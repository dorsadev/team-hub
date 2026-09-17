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
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
  }
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

// Authenticated admins only — everyone else gets 403.
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' })
    }
    next()
  })
}

// Expired sessions are removed even if their owners never return.
const sessionCleanup = setInterval(() => {
  for (const [token, session] of sessions) {
    if (session.expiresAt <= Date.now()) sessions.delete(token)
  }
}, 60_000)
sessionCleanup.unref()

app.post('/api/register', (req, res) => {
  // JSON-only requests also prevent cross-site HTML form signups.
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'Use application/json.' })
  }
  const { username, displayName, password, role } = req.body ?? {}
  if (typeof username !== 'string' || typeof displayName !== 'string' ||
      typeof password !== 'string') {
    return res.status(400).json({ error: 'Provide a username, display name, and password.' })
  }

  // The signup form picks the role via its "I am a admin" checkbox; anything
  // other than the two known roles is rejected.
  if (role !== 'student' && role !== 'admin') {
    return res.status(400).json({ error: 'Role must be student or admin.' })
  }

  const trimmedUsername = username.trim()
  const trimmedDisplayName = displayName.trim()
  if (!trimmedUsername || !trimmedDisplayName || !password) {
    return res.status(400).json({ error: 'All fields are required.' })
  }
  if (trimmedUsername.length < 3 || trimmedUsername.length > 100) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' })
  }
  if (trimmedDisplayName.length > 100) {
    return res.status(400).json({ error: 'Display name must be 100 characters or fewer.' })
  }
  if (password.length < 8 || password.length > 1024) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  }

  // Plain text never reaches the database — same salt + scrypt scheme as login.
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')

  let userId
  try {
    const result = db.prepare(`
      INSERT INTO users (username, display_name, password_salt, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(trimmedUsername, trimmedDisplayName, salt, hash, role)
    userId = Number(result.lastInsertRowid)
  } catch (error) {
    // SQLITE_CONSTRAINT_UNIQUE (2067): users.username is UNIQUE.
    if (error?.errcode === 2067 ||
        (error instanceof Error && error.message.includes('UNIQUE constraint failed'))) {
      return res.status(409).json({ error: 'That username is already taken.' })
    }
    throw error
  }

  // New members start with a "main" branch, like everyone else.
  db.prepare('INSERT INTO branches (name, owner_user_id) VALUES (?, ?)')
    .run('main', userId)

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  return res.status(201).json({ user: publicUser(user) })
})

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

// Members overview — admins only, students get 403.
app.get('/api/users', requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, display_name AS displayName, role
    FROM users
    ORDER BY id
  `).all()
  return res.json({ users })
})

// Admin-only: branches owned by a specific user, selected from the member
// list. Unknown users get 404; non-admins never get past requireAdmin.
app.get('/api/admin/users/:userId/branches', requireAdmin, (req, res) => {
  const userId = Number(req.params.userId)
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(404).json({ error: 'User not found.' })
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
  if (!user) {
    return res.status(404).json({ error: 'User not found.' })
  }
  const branches = db.prepare(`
    SELECT id, name, owner_user_id, created_at
    FROM branches
    WHERE owner_user_id = ?
    ORDER BY id
  `).all(userId)
  return res.json({ branches })
})

// Admin-only: details of a single branch. It must belong to the specified
// user — a missing user, missing branch, or wrong owner all return 404.
app.get('/api/admin/users/:userId/branches/:branchId', requireAdmin, (req, res) => {
  const userId = Number(req.params.userId)
  const branchId = Number(req.params.branchId)
  if (!Number.isInteger(userId) || userId < 1 ||
      !Number.isInteger(branchId) || branchId < 1) {
    return res.status(404).json({ error: 'Branch not found.' })
  }
  const branch = db.prepare(`
    SELECT id, name, owner_user_id, created_at
    FROM branches
    WHERE id = ? AND owner_user_id = ?
  `).get(branchId, userId)
  if (!branch) {
    return res.status(404).json({ error: 'Branch not found.' })
  }
  return res.json({ branch })
})

// Admin-only: the workspace of a single branch. Same ownership rules as the
// details endpoint above, plus the branch's stored files.
app.get('/api/admin/users/:userId/branches/:branchId/workspace', requireAdmin, (req, res) => {
  const userId = Number(req.params.userId)
  const branchId = Number(req.params.branchId)
  if (!Number.isInteger(userId) || userId < 1 ||
      !Number.isInteger(branchId) || branchId < 1) {
    return res.status(404).json({ error: 'Branch not found.' })
  }
  const branch = db.prepare(`
    SELECT id, name, owner_user_id, created_at
    FROM branches
    WHERE id = ? AND owner_user_id = ?
  `).get(branchId, userId)
  if (!branch) {
    return res.status(404).json({ error: 'Branch not found.' })
  }
  const files = db.prepare(`
    SELECT id, branch_id, name, content, created_at, updated_at
    FROM files
    WHERE branch_id = ?
    ORDER BY id
  `).all(branchId)
  return res.json({ branch, files })
})

// Admin-only: the files of a single branch. Same ownership rules as the
// workspace endpoint above.
app.get('/api/admin/users/:userId/branches/:branchId/files', requireAdmin, (req, res) => {
  const userId = Number(req.params.userId)
  const branchId = Number(req.params.branchId)
  if (!Number.isInteger(userId) || userId < 1 ||
      !Number.isInteger(branchId) || branchId < 1) {
    return res.status(404).json({ error: 'Branch not found.' })
  }
  const branch = db.prepare(
    'SELECT id FROM branches WHERE id = ? AND owner_user_id = ?'
  ).get(branchId, userId)
  if (!branch) {
    return res.status(404).json({ error: 'Branch not found.' })
  }
  const files = db.prepare(`
    SELECT id, branch_id, name, content, created_at, updated_at
    FROM files
    WHERE branch_id = ?
    ORDER BY id
  `).all(branchId)
  return res.json({ files })
})

// Admin-only: create a file inside a branch. The name must be a non-empty
// string; content may be empty. Names are unique within a branch.
app.post('/api/admin/users/:userId/branches/:branchId/files', requireAdmin, (req, res) => {
  // JSON-only requests also prevent cross-site HTML form posts.
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'Use application/json.' })
  }
  const { name, content } = req.body ?? {}
  if (typeof name !== 'string') {
    return res.status(400).json({ error: 'Provide a file name.' })
  }
  if (content !== undefined && typeof content !== 'string') {
    return res.status(400).json({ error: 'File content must be text.' })
  }
  const trimmedName = name.trim()
  if (!trimmedName) {
    return res.status(400).json({ error: 'Provide a file name.' })
  }
  if (trimmedName.length > 100) {
    return res.status(400).json({ error: 'File name must be 100 characters or fewer.' })
  }
  const fileContent = typeof content === 'string' ? content : ''

  const userId = Number(req.params.userId)
  const branchId = Number(req.params.branchId)
  if (!Number.isInteger(userId) || userId < 1 ||
      !Number.isInteger(branchId) || branchId < 1) {
    return res.status(404).json({ error: 'Branch not found.' })
  }
  const branch = db.prepare(
    'SELECT id FROM branches WHERE id = ? AND owner_user_id = ?'
  ).get(branchId, userId)
  if (!branch) {
    return res.status(404).json({ error: 'Branch not found.' })
  }

  let fileId
  try {
    const result = db.prepare(`
      INSERT INTO files (branch_id, name, content)
      VALUES (?, ?, ?)
    `).run(branchId, trimmedName, fileContent)
    fileId = Number(result.lastInsertRowid)
  } catch (error) {
    // SQLITE_CONSTRAINT_UNIQUE (2067): file names are unique per branch.
    if (error?.errcode === 2067 ||
        (error instanceof Error && error.message.includes('UNIQUE constraint failed'))) {
      return res.status(409).json({ error: 'A file with that name already exists.' })
    }
    throw error
  }

  const file = db.prepare(`
    SELECT id, branch_id, name, content, created_at, updated_at
    FROM files
    WHERE id = ?
  `).get(fileId)
  return res.status(201).json({ file })
})

// Admin-only: a single file. The file must belong to the specified branch,
// and the branch to the specified user — anything else is 404.
app.get('/api/admin/users/:userId/branches/:branchId/files/:fileId', requireAdmin, (req, res) => {
  const userId = Number(req.params.userId)
  const branchId = Number(req.params.branchId)
  const fileId = Number(req.params.fileId)
  if (!Number.isInteger(userId) || userId < 1 ||
      !Number.isInteger(branchId) || branchId < 1 ||
      !Number.isInteger(fileId) || fileId < 1) {
    return res.status(404).json({ error: 'File not found.' })
  }
  const file = db.prepare(`
    SELECT f.id, f.branch_id, f.name, f.content, f.created_at, f.updated_at
    FROM files AS f
    JOIN branches AS b ON b.id = f.branch_id
    WHERE f.id = ? AND f.branch_id = ? AND b.owner_user_id = ?
  `).get(fileId, branchId, userId)
  if (!file) {
    return res.status(404).json({ error: 'File not found.' })
  }
  return res.json({ file })
})

// Admin-only: update a single file (rename and/or edit content). Same
// ownership rules as above; names stay unique within the branch.
app.put('/api/admin/users/:userId/branches/:branchId/files/:fileId', requireAdmin, (req, res) => {
  // JSON-only requests also prevent cross-site HTML form posts.
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'Use application/json.' })
  }
  const { name, content } = req.body ?? {}
  if (typeof name !== 'string') {
    return res.status(400).json({ error: 'Provide a file name.' })
  }
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'File content must be text.' })
  }
  const trimmedName = name.trim()
  if (!trimmedName) {
    return res.status(400).json({ error: 'Provide a file name.' })
  }
  if (trimmedName.length > 100) {
    return res.status(400).json({ error: 'File name must be 100 characters or fewer.' })
  }

  const userId = Number(req.params.userId)
  const branchId = Number(req.params.branchId)
  const fileId = Number(req.params.fileId)
  if (!Number.isInteger(userId) || userId < 1 ||
      !Number.isInteger(branchId) || branchId < 1 ||
      !Number.isInteger(fileId) || fileId < 1) {
    return res.status(404).json({ error: 'File not found.' })
  }
  const file = db.prepare(`
    SELECT f.id, f.branch_id
    FROM files AS f
    JOIN branches AS b ON b.id = f.branch_id
    WHERE f.id = ? AND f.branch_id = ? AND b.owner_user_id = ?
  `).get(fileId, branchId, userId)
  if (!file) {
    return res.status(404).json({ error: 'File not found.' })
  }

  try {
    db.prepare(`
      UPDATE files
      SET name = ?, content = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?
    `).run(trimmedName, content, fileId)
  } catch (error) {
    // SQLITE_CONSTRAINT_UNIQUE (2067): file names are unique per branch.
    if (error?.errcode === 2067 ||
        (error instanceof Error && error.message.includes('UNIQUE constraint failed'))) {
      return res.status(409).json({ error: 'A file with that name already exists.' })
    }
    throw error
  }

  const updated = db.prepare(`
    SELECT id, branch_id, name, content, created_at, updated_at
    FROM files
    WHERE id = ?
  `).get(fileId)
  return res.json({ file: updated })
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
