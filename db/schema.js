// db/schema.js
// Creates tables and auto-seeds the ListMaker admin account on first boot
const bcrypt = require('bcryptjs');
const { run, get } = require('./connection');

async function initSchema() {
  // USERS table
  run(`CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'user',
    created_at   TEXT DEFAULT (datetime('now'))
  )`);

  // LEVELS table
  run(`CREATE TABLE IF NOT EXISTS levels (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    rank         INTEGER UNIQUE NOT NULL,
    name         TEXT NOT NULL,
    difficulty   TEXT NOT NULL,
    points       INTEGER NOT NULL,
    creator      TEXT NOT NULL,
    verifier     TEXT NOT NULL,
    description  TEXT DEFAULT '',
    date_added   TEXT DEFAULT (datetime('now'))
  )`);

  // COMPLETIONS table
  run(`CREATE TABLE IF NOT EXISTS completions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    level_id     INTEGER NOT NULL,
    verified_by  TEXT NOT NULL DEFAULT 'ListMaker',
    notes        TEXT DEFAULT '',
    completed_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, level_id)
  )`);

  // Auto-seed ListMaker admin account (only once, via INSERT OR IGNORE)
  const existing = get("SELECT id FROM users WHERE username = 'listmaker'");
  if (!existing) {
    const hash = await bcrypt.hash('!ListMaker69$', 12);
    run(
      `INSERT OR IGNORE INTO users (username, display_name, password_hash, role)
       VALUES (?, ?, ?, ?)`,
      ['listmaker', 'ListMaker', hash, 'admin']
    );
    console.log('[DB] ListMaker admin account created.');
  }

  console.log('[DB] Schema initialized.');
}

module.exports = { initSchema };
