import { randomBytes, scryptSync } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// <project>/server, resolved from this file so the path never depends on the cwd.
const serverRoot = dirname(fileURLToPath(import.meta.url))

const databaseFile =
  process.env.DATABASE_FILE ?? join(serverRoot, 'data', 'team-hub.db')

mkdirSync(dirname(databaseFile), { recursive: true })

export const dbPath = databaseFile

// Opens the SQLite file, creating it on first run.
export const db = new DatabaseSync(databaseFile)

// SQLite leaves foreign key enforcement off by default.
db.exec('PRAGMA foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student'
  )
`)

// Older databases predate roles — add the column without losing data.
const userColumns = db.prepare('PRAGMA table_info(users)').all()
if (!userColumns.some((column) => column.name === 'role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'")
}

if (!db.prepare('SELECT id FROM users WHERE username = ?').get('dorsadev')) {
  const password = process.env.SEED_USER_PASSWORD
  if (!password || password.length < 12) {
    db.close()
    throw new Error('Set SEED_USER_PASSWORD to at least 12 characters for the first start.')
  }
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  db.prepare(`
    INSERT INTO users (username, display_name, password_salt, password_hash)
    VALUES (?, ?, ?, ?)
  `).run('dorsadev', 'Dorsa', salt, hash)
}

// The hub owner (the teacher) stays in charge: dorsadev is always admin.
db.prepare("UPDATE users SET role = 'admin' WHERE username = 'dorsadev'").run()

db.exec(`
  CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`)

// Branch names are unique per owner, not globally.
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS branches_owner_name_idx
  ON branches (owner_user_id, name)
`)

// Files live inside a branch; deleting a branch removes its files.
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`)

// File names are unique within a branch, like branch names within an owner.
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS files_branch_name_idx
  ON files (branch_id, name)
`)

// Every user starts with a "main" branch (matches the previous UI default).
const branchlessUsers = db.prepare(`
  SELECT id FROM users
  WHERE id NOT IN (SELECT owner_user_id FROM branches)
`).all()
const insertSeedBranch = db.prepare(
  'INSERT INTO branches (name, owner_user_id) VALUES (?, ?)'
)
for (const user of branchlessUsers) {
  insertSeedBranch.run('main', user.id)
}

export function closeDb() {
  db.close()
}
