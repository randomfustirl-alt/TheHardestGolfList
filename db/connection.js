// db/connection.js
// sql.js persistent SQLite - loads from disk, saves on writes
const fs = require('fs');
const path = require('path');

let db;
let SQL;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'levellist.db');

async function getDb() {
  if (db) return db;

  // Ensure data directory exists
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  // Load sql.js
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  // Load existing database or create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable WAL-like behavior (foreign keys)
  db.run('PRAGMA foreign_keys = ON;');

  return db;
}

// Save database to disk after every write
function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Helper: run a statement with auto-save
function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

// Helper: get first row
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

// Helper: get all rows
function all(sql, params = []) {
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper: run and get last insert rowid
function insert(sql, params = []) {
  db.run(sql, params);
  const result = get('SELECT last_insert_rowid() as id');
  saveDb();
  return result ? result.id : null;
}

module.exports = { getDb, saveDb, run, get, all, insert };
