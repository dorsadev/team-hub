import express from 'express'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { closeDb, db, dbPath } from './db.js'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const sessions = new Map()
const sessionLifetime = 24 * 60 * 60 * 1000
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

app.use(express.json({ limit: '4kb' }))
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

function sessionToken(req) {
  return (req.headers.cookie ?? '')
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('team_hub_session='))
    ?.slice('team_hub_session='.length)
}

function publicUser(user) {
  return { id: user.id, username: user.username, displayName: user.display_name }
}

// Resolves the session cookie to the logged-in user, or rejects with 401.
function requireAuth(req, res, next) {
  const token = sessionToken(req)
  const session = sessions.get(token)
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token)
    return res.status(401).json({ error: 'Not authenticated.' })
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.userId)
  if (!user) {
    sessions.delete(token)
    return res.status(401).json({ error: 'Not authenticated.' })
  }
  req.user = user
  next()
}

// Expired sessions are removed even if their owners never return.
const sessionCleanup = setInterval(() => {
  for (const [token, session] of sessions) {
    if (session.expiresAt <= Date.now()) sessions.delete(token)
  }
}, 60_000)
sessionCleanup.unref()

app.post('/api/login', (req, res) => {
  // JSON-only requests also prevent cross-site HTML form logins.
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'Use application/json.' })
  }
  const { username, password } = req.body ?? {}
  if (typeof username !== 'string' || typeof password !== 'string' ||
      username.length > 100 || password.length > 1024) {
    return res.status(400).json({ error: 'Provide a username and password.' })
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  const hash = scryptSync(password, user?.password_salt ?? 'unknown-user', 64)
  const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64)
  if (!timingSafeEqual(hash, expected) || !user) {
    return res.status(401).json({ error: 'Invalid username or password.' })
  }

  sessions.delete(sessionToken(req))
  const token = randomBytes(32).toString('hex')
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + sessionLifetime })
  res.cookie('team_hub_session', token, { ...cookieOptions, maxAge: sessionLifetime })
  return res.json({ user: publicUser(user) })
})

app.get('/api/me', requireAuth, (req, res) => {
  return res.json({ user: publicUser(req.user) })
})

app.get('/api/branches', requireAuth, (req, res) => {
  const branches = db.prepare(`
    SELECT id, name, owner_user_id AS ownerUserId, created_at AS createdAt
    FROM branches
    WHERE owner_user_id = ?
    ORDER BY id
  `).all(req.user.id)
  return res.json({ branches })
})

app.post('/api/branches', requireAuth, (req, res) => {
  // JSON-only requests also prevent cross-site HTML form posts.
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'Use application/json.' })
  }
  const { name } = req.body ?? {}
  if (typeof name !== 'string') {
    return res.status(400).json({ error: 'Provide a branch name.' })
  }
  const trimmedName = name.trim()
  if (!trimmedName || trimmedName.length > 100) {
    return res.status(400).json({ error: 'Provide a branch name.' })
  }

  try {
    const result = db.prepare(`
      INSERT INTO branches (name, owner_user_id)
      VALUES (?, ?)
    `).run(trimmedName, req.user.id)
    const branch = db.prepare(`
      SELECT id, name, owner_user_id AS ownerUserId, created_at AS createdAt
      FROM branches
      WHERE id = ?
    `).get(Number(result.lastInsertRowid))
    return res.status(201).json({ branch })
  } catch (error) {
    // SQLITE_CONSTRAINT_UNIQUE (2067): the unique (owner_user_id, name) index
    // rejects duplicate branch names for this user.
    if (error?.errcode === 2067 ||
        (error instanceof Error && error.message.includes('UNIQUE constraint failed'))) {
      return res.status(409).json({ error: 'That branch already exists.' })
    }
    throw error
  }
})

app.post('/api/logout', (req, res) => {
  sessions.delete(sessionToken(req))
  res.clearCookie('team_hub_session', cookieOptions)
  res.json({ status: 'ok' })
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

const server = app.listen(port, () => {
  console.log(`Team Hub API listening on http://localhost:${port}`)
  console.log(`SQLite database: ${dbPath}`)
})

// Close the HTTP server and the database on Ctrl+C / kill.
function shutdown() {
  server.close(() => {
    closeDb()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
