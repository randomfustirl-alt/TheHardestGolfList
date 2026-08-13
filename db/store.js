// db/store.js — Multi-Engine: Turso Cloud (Primary) + MongoDB + Local JSON Fallback
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { createClient } = require('@libsql/client');
const mongoose = require('mongoose');

let turso = null;
let isTurso = false;
let isMongo = false;

// Local JSON Fallback Setup
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
let memoryData = null;

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
      users: [],
      levels: [],
      completions: [],
      nextIds: { users: 1, levels: 1, completions: 1 }
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2), 'utf8');
    memoryData = initialData;
  } else {
    try {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      memoryData = JSON.parse(content);
      if (!memoryData.nextIds) {
        memoryData.nextIds = {
          users: (memoryData.users.reduce((max, u) => u.id > max ? u.id : max, 0) || 0) + 1,
          levels: (memoryData.levels.reduce((max, l) => l.id > max ? l.id : max, 0) || 0) + 1,
          completions: (memoryData.completions.reduce((max, c) => c.id > max ? c.id : max, 0) || 0) + 1
        };
      }
    } catch (e) {
      memoryData = { users: [], levels: [], completions: [], nextIds: { users: 1, levels: 1, completions: 1 } };
      saveData();
    }
  }
}

function saveData() {
  if (!memoryData || isTurso || isMongo) return;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(memoryData, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Write error:', err);
  }
}

async function initDb() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  // 1. Try Turso Cloud (SQLite at the Edge)
  if (tursoUrl && tursoToken) {
    try {
      // Ensure protocol is clean for @libsql/client
      let cleanUrl = tursoUrl.trim();
      if (cleanUrl.startsWith('libsql://')) {
        cleanUrl = cleanUrl.replace('libsql://', 'https://');
      }

      turso = createClient({
        url: cleanUrl,
        authToken: tursoToken.trim()
      });

      // Create Tables
      await turso.execute(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TEXT DEFAULT (datetime('now'))
      )`);

      await turso.execute(`CREATE TABLE IF NOT EXISTS levels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rank INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        points INTEGER NOT NULL,
        creator TEXT NOT NULL,
        verifier TEXT NOT NULL,
        description TEXT DEFAULT '',
        date_added TEXT DEFAULT (datetime('now'))
      )`);

      await turso.execute(`CREATE TABLE IF NOT EXISTS completions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        level_id INTEGER NOT NULL,
        verified_by TEXT DEFAULT 'ListMaker',
        notes TEXT DEFAULT '',
        completed_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, level_id)
      )`);

      // Auto-seed ListMaker
      const existing = await turso.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: ['listmaker'] });
      if (existing.rows.length === 0) {
        const hash = await bcrypt.hash('!ListMaker69$', 12);
        await turso.execute({
          sql: 'INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)',
          args: ['listmaker', 'ListMaker', hash, 'admin']
        });
        console.log('[DB] Turso Cloud: ListMaker admin account created.');
      }

      isTurso = true;
      console.log('⚡ [DB] Connected to Turso Cloud (SQLite at the Edge) successfully!');
      return;
    } catch (err) {
      console.error('❌ [DB] Turso connection failed, checking MongoDB fallback:', err.message);
      isTurso = false;
    }
  }

  // 2. Local JSON fallback
  ensureDataFile();
  let listMaker = memoryData.users.find(u => u.username === 'listmaker');
  if (!listMaker) {
    const hash = await bcrypt.hash('!ListMaker69$', 12);
    listMaker = {
      id: memoryData.nextIds.users++,
      username: 'listmaker',
      display_name: 'ListMaker',
      password_hash: hash,
      role: 'admin',
      created_at: new Date().toISOString()
    };
    memoryData.users.push(listMaker);
    saveData();
    console.log('[DB] Local JSON: ListMaker admin account created.');
  }
  console.log(`ℹ️ [DB] Running on Local JSON Store (${memoryData.levels.length} levels, ${memoryData.users.length} users). Set TURSO_DATABASE_URL & TURSO_AUTH_TOKEN for cloud database.`);
}

// User Helpers
async function getUserById(id) {
  const uid = Number(id);
  if (isTurso) {
    const res = await turso.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [uid] });
    return res.rows.length > 0 ? res.rows[0] : null;
  }
  ensureDataFile();
  return memoryData.users.find(u => u.id === uid) || null;
}

async function getUserByUsername(username) {
  if (!username) return null;
  const uname = username.toLowerCase();
  if (isTurso) {
    const res = await turso.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [uname] });
    return res.rows.length > 0 ? res.rows[0] : null;
  }
  ensureDataFile();
  return memoryData.users.find(u => u.username === uname) || null;
}

async function getAllUsers() {
  if (isTurso) {
    const res = await turso.execute(`
      SELECT u.id, u.username, u.display_name, u.role, u.created_at,
             COALESCE(SUM(l.points), 0) AS total_points,
             COUNT(c.id) AS verified_clears
      FROM users u
      LEFT JOIN completions c ON c.user_id = u.id
      LEFT JOIN levels l ON c.level_id = l.id
      GROUP BY u.id
      ORDER BY u.display_name ASC
    `);
    return res.rows;
  }
  ensureDataFile();
  return memoryData.users.map(u => {
    const uComps = memoryData.completions.filter(c => c.user_id === u.id);
    const total_points = uComps.reduce((sum, c) => {
      const lvl = memoryData.levels.find(l => l.id === c.level_id);
      return sum + (lvl ? lvl.points : 0);
    }, 0);
    return {
      ...u,
      total_points,
      verified_clears: uComps.length
    };
  }).sort((a, b) => a.display_name.localeCompare(b.display_name));
}

async function createUser(username, displayName, passwordHash, role = 'user') {
  const uname = username.toLowerCase();
  if (isTurso) {
    const res = await turso.execute({
      sql: 'INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?) RETURNING id',
      args: [uname, displayName, passwordHash, role]
    });
    return res.rows.length > 0 ? res.rows[0].id : Number(res.lastInsertRowid);
  }
  ensureDataFile();
  const newUser = {
    id: memoryData.nextIds.users++,
    username: uname,
    display_name: displayName,
    password_hash: passwordHash,
    role,
    created_at: new Date().toISOString()
  };
  memoryData.users.push(newUser);
  saveData();
  return newUser.id;
}

async function deleteUser(id) {
  const uid = Number(id);
  if (isTurso) {
    await turso.batch([
      { sql: 'DELETE FROM completions WHERE user_id = ?', args: [uid] },
      { sql: 'DELETE FROM users WHERE id = ?', args: [uid] }
    ]);
    return;
  }
  ensureDataFile();
  memoryData.users = memoryData.users.filter(u => u.id !== uid);
  memoryData.completions = memoryData.completions.filter(c => c.user_id !== uid);
  saveData();
}

// Level Helpers
async function getLevelById(id) {
  const lid = Number(id);
  if (isTurso) {
    const res = await turso.execute({ sql: 'SELECT * FROM levels WHERE id = ?', args: [lid] });
    return res.rows.length > 0 ? res.rows[0] : null;
  }
  ensureDataFile();
  return memoryData.levels.find(l => l.id === lid) || null;
}

async function getAllLevels(search = '', difficulty = '', sort = 'rank') {
  if (isTurso) {
    let sql = 'SELECT l.*, (SELECT COUNT(*) FROM completions c WHERE c.level_id = l.id) as clear_count FROM levels l WHERE 1=1';
    const args = [];
    if (search) {
      sql += ' AND (LOWER(l.name) LIKE ? OR LOWER(l.creator) LIKE ? OR LOWER(l.verifier) LIKE ?)';
      const q = `%${search.toLowerCase()}%`;
      args.push(q, q, q);
    }
    if (difficulty) {
      sql += ' AND l.difficulty = ?';
      args.push(difficulty);
    }

    const sortMap = {
      rank: 'l.rank ASC',
      points_desc: 'l.points DESC',
      points_asc: 'l.points ASC',
      name: 'l.name ASC',
      clears: 'clear_count DESC',
      newest: 'l.date_added DESC'
    };
    sql += ` ORDER BY ${sortMap[sort] || 'l.rank ASC'}`;

    const res = await turso.execute({ sql, args });
    return res.rows;
  }

  ensureDataFile();
  let result = memoryData.levels.map(l => {
    const clear_count = memoryData.completions.filter(c => c.level_id === l.id).length;
    return { ...l, clear_count };
  });

  if (search) {
    const q = search.toLowerCase();
    result = result.filter(l =>
      (l.name && l.name.toLowerCase().includes(q)) ||
      (l.creator && l.creator.toLowerCase().includes(q)) ||
      (l.verifier && l.verifier.toLowerCase().includes(q))
    );
  }

  if (difficulty) {
    result = result.filter(l => l.difficulty === difficulty);
  }

  if (sort === 'rank') result.sort((a, b) => a.rank - b.rank);
  else if (sort === 'points_desc') result.sort((a, b) => b.points - a.points);
  else if (sort === 'points_asc') result.sort((a, b) => a.points - b.points);
  else if (sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'clears') result.sort((a, b) => b.clear_count - a.clear_count);
  else if (sort === 'newest') result.sort((a, b) => new Date(b.date_added) - new Date(a.date_added));

  return result;
}

async function getTopLevel() {
  const levels = await getAllLevels('', '', 'rank');
  return levels.length > 0 ? levels[0] : null;
}

async function getMaxLevelRank() {
  if (isTurso) {
    const res = await turso.execute('SELECT MAX(rank) as maxRank FROM levels');
    return res.rows.length > 0 && res.rows[0].maxRank ? Number(res.rows[0].maxRank) : 0;
  }
  ensureDataFile();
  if (memoryData.levels.length === 0) return 0;
  return Math.max(...memoryData.levels.map(l => l.rank));
}

async function getDifficulties() {
  if (isTurso) {
    const res = await turso.execute('SELECT DISTINCT difficulty FROM levels ORDER BY difficulty ASC');
    return res.rows.map(r => r.difficulty);
  }
  ensureDataFile();
  const set = new Set(memoryData.levels.map(l => l.difficulty));
  return Array.from(set).sort();
}

async function createLevel({ rank, name, difficulty, points, creator, verifier, description }) {
  const r = Number(rank);

  if (isTurso) {
    await turso.execute({
      sql: 'UPDATE levels SET rank = rank + 1 WHERE rank >= ?',
      args: [r]
    });

    const res = await turso.execute({
      sql: 'INSERT INTO levels (rank, name, difficulty, points, creator, verifier, description) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
      args: [r, name.trim(), difficulty, Number(points), creator.trim(), verifier.trim(), (description || '').trim()]
    });
    return res.rows.length > 0 ? res.rows[0].id : Number(res.lastInsertRowid);
  }

  ensureDataFile();
  memoryData.levels.forEach(l => {
    if (l.rank >= r) l.rank += 1;
  });

  const newLevel = {
    id: memoryData.nextIds.levels++,
    rank: r,
    name: name.trim(),
    difficulty,
    points: Number(points),
    creator: creator.trim(),
    verifier: verifier.trim(),
    description: (description || '').trim(),
    date_added: new Date().toISOString()
  };

  memoryData.levels.push(newLevel);
  saveData();
  return newLevel.id;
}

async function updateLevel(id, { rank, name, difficulty, points, creator, verifier, description }) {
  const levelId = Number(id);
  const newRank = Number(rank);

  if (isTurso) {
    const current = await getLevelById(levelId);
    if (!current) return false;

    if (newRank !== current.rank) {
      if (newRank < current.rank) {
        await turso.execute({
          sql: 'UPDATE levels SET rank = rank + 1 WHERE rank >= ? AND rank < ? AND id != ?',
          args: [newRank, current.rank, levelId]
        });
      } else {
        await turso.execute({
          sql: 'UPDATE levels SET rank = rank - 1 WHERE rank > ? AND rank <= ? AND id != ?',
          args: [current.rank, newRank, levelId]
        });
      }
    }

    await turso.execute({
      sql: 'UPDATE levels SET rank = ?, name = ?, difficulty = ?, points = ?, creator = ?, verifier = ?, description = ? WHERE id = ?',
      args: [newRank, name.trim(), difficulty, Number(points), creator.trim(), verifier.trim(), (description || '').trim(), levelId]
    });
    return true;
  }

  ensureDataFile();
  const level = memoryData.levels.find(l => l.id === levelId);
  if (!level) return false;

  if (newRank !== level.rank) {
    memoryData.levels.forEach(l => {
      if (l.id !== levelId) {
        if (newRank < level.rank && l.rank >= newRank && l.rank < level.rank) {
          l.rank += 1;
        } else if (newRank > level.rank && l.rank > level.rank && l.rank <= newRank) {
          l.rank -= 1;
        }
      }
    });
  }

  level.rank = newRank;
  level.name = name.trim();
  level.difficulty = difficulty;
  level.points = Number(points);
  level.creator = creator.trim();
  level.verifier = verifier.trim();
  level.description = (description || '').trim();

  saveData();
  return true;
}

async function deleteLevel(id) {
  const levelId = Number(id);
  if (isTurso) {
    await turso.batch([
      { sql: 'DELETE FROM completions WHERE level_id = ?', args: [levelId] },
      { sql: 'DELETE FROM levels WHERE id = ?', args: [levelId] }
    ]);
    return;
  }
  ensureDataFile();
  memoryData.levels = memoryData.levels.filter(l => l.id !== levelId);
  memoryData.completions = memoryData.completions.filter(c => c.level_id !== levelId);
  saveData();
}

// Completion Helpers
async function getCompletionsForLevel(levelId) {
  const lid = Number(levelId);
  if (isTurso) {
    const res = await turso.execute({
      sql: `SELECT c.*, u.username, u.display_name
            FROM completions c
            JOIN users u ON c.user_id = u.id
            WHERE c.level_id = ?
            ORDER BY c.completed_at ASC`,
      args: [lid]
    });
    return res.rows;
  }

  ensureDataFile();
  return memoryData.completions
    .filter(c => c.level_id === lid)
    .map(c => {
      const user = memoryData.users.find(u => u.id === c.user_id);
      return {
        ...c,
        username: user ? user.username : 'deleted',
        display_name: user ? user.display_name : 'Deleted User'
      };
    })
    .sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
}

async function getCompletionsForUser(userId) {
  const uid = Number(userId);
  if (isTurso) {
    const res = await turso.execute({
      sql: `SELECT c.*, l.name as level_name, l.difficulty, l.points, l.rank as level_rank
            FROM completions c
            JOIN levels l ON c.level_id = l.id
            WHERE c.user_id = ?
            ORDER BY c.completed_at DESC`,
      args: [uid]
    });
    return res.rows;
  }

  ensureDataFile();
  return memoryData.completions
    .filter(c => c.user_id === uid)
    .map(c => {
      const level = memoryData.levels.find(l => l.id === c.level_id);
      return {
        ...c,
        level_name: level ? level.name : 'Deleted Level',
        difficulty: level ? level.difficulty : 'Unknown',
        points: level ? level.points : 0,
        level_rank: level ? level.rank : 999
      };
    })
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
}

async function getRecentCompletions(limit = 20) {
  if (isTurso) {
    const res = await turso.execute({
      sql: `SELECT c.*, u.display_name as player_name, u.username, l.name as level_name, l.points
            FROM completions c
            JOIN users u ON c.user_id = u.id
            JOIN levels l ON c.level_id = l.id
            ORDER BY c.completed_at DESC
            LIMIT ?`,
      args: [limit]
    });
    return res.rows;
  }

  ensureDataFile();
  return [...memoryData.completions]
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
    .slice(0, limit)
    .map(c => {
      const user = memoryData.users.find(u => u.id === c.user_id);
      const level = memoryData.levels.find(l => l.id === c.level_id);
      return {
        ...c,
        player_name: user ? user.display_name : 'Deleted User',
        username: user ? user.username : 'deleted',
        level_name: level ? level.name : 'Deleted Level',
        points: level ? level.points : 0
      };
    });
}

async function createCompletion(userId, levelId, verifiedBy = 'ListMaker', notes = '') {
  const uid = Number(userId);
  const lid = Number(levelId);

  if (isTurso) {
    const existing = await turso.execute({
      sql: 'SELECT id FROM completions WHERE user_id = ? AND level_id = ?',
      args: [uid, lid]
    });
    if (existing.rows.length > 0) return null;

    const res = await turso.execute({
      sql: 'INSERT INTO completions (user_id, level_id, verified_by, notes) VALUES (?, ?, ?, ?) RETURNING id',
      args: [uid, lid, verifiedBy, (notes || '').trim()]
    });
    return res.rows.length > 0 ? res.rows[0].id : Number(res.lastInsertRowid);
  }

  ensureDataFile();
  const exists = memoryData.completions.find(c => c.user_id === uid && c.level_id === lid);
  if (exists) return null;

  const newComp = {
    id: memoryData.nextIds.completions++,
    user_id: uid,
    level_id: lid,
    verified_by: verifiedBy,
    notes: (notes || '').trim(),
    completed_at: new Date().toISOString()
  };

  memoryData.completions.push(newComp);
  saveData();
  return newComp.id;
}

async function deleteCompletion(id) {
  const cid = Number(id);

  if (isTurso) {
    const res = await turso.execute({
      sql: `SELECT c.*, u.display_name as player_name, l.name as level_name, l.points
            FROM completions c
            JOIN users u ON c.user_id = u.id
            JOIN levels l ON c.level_id = l.id
            WHERE c.id = ?`,
      args: [cid]
    });
    if (res.rows.length === 0) return null;
    const comp = res.rows[0];
    await turso.execute({ sql: 'DELETE FROM completions WHERE id = ?', args: [cid] });
    return comp;
  }

  ensureDataFile();
  const comp = memoryData.completions.find(c => c.id === cid);
  if (!comp) return null;

  const user = memoryData.users.find(u => u.id === comp.user_id);
  const level = memoryData.levels.find(l => l.id === comp.level_id);
  memoryData.completions = memoryData.completions.filter(c => c.id !== cid);
  saveData();

  return {
    ...comp,
    player_name: user ? user.display_name : 'User',
    level_name: level ? level.name : 'Level',
    points: level ? level.points : 0
  };
}

// Leaderboard Helper
async function getLeaderboard(searchQuery = '') {
  if (isTurso) {
    let sql = `
      SELECT
        u.id, u.username, u.display_name, u.role, u.created_at,
        COALESCE(SUM(l.points), 0) AS total_points,
        COUNT(c.id) AS verified_clears
      FROM users u
      LEFT JOIN completions c ON c.user_id = u.id
      LEFT JOIN levels l ON c.level_id = l.id
    `;
    const args = [];
    if (searchQuery) {
      sql += ' WHERE (LOWER(u.username) LIKE ? OR LOWER(u.display_name) LIKE ?)';
      const q = `%${searchQuery.toLowerCase()}%`;
      args.push(q, q);
    }
    sql += `
      GROUP BY u.id
      ORDER BY total_points DESC, verified_clears DESC, u.created_at ASC
    `;
    const res = await turso.execute({ sql, args });
    return res.rows.map((row, index) => ({ ...row, rank: index + 1 }));
  }

  ensureDataFile();
  let list = memoryData.users.map(u => {
    const uComps = memoryData.completions.filter(c => c.user_id === u.id);
    const total_points = uComps.reduce((sum, c) => {
      const lvl = memoryData.levels.find(l => l.id === c.level_id);
      return sum + (lvl ? lvl.points : 0);
    }, 0);

    return {
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      role: u.role,
      created_at: u.created_at,
      total_points,
      verified_clears: uComps.length
    };
  });

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(u =>
      u.username.toLowerCase().includes(q) ||
      u.display_name.toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (b.verified_clears !== a.verified_clears) return b.verified_clears - a.verified_clears;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  return list.map((item, index) => ({ ...item, rank: index + 1 }));
}

async function getStats() {
  if (isTurso) {
    const lRes = await turso.execute('SELECT COUNT(*) as count FROM levels');
    const pRes = await turso.execute('SELECT COUNT(*) as count FROM users');
    const cRes = await turso.execute('SELECT COUNT(*) as count FROM completions');
    return {
      levels: Number(lRes.rows[0].count),
      players: Number(pRes.rows[0].count),
      clears: Number(cRes.rows[0].count)
    };
  }
  ensureDataFile();
  return {
    levels: memoryData.levels.length,
    players: memoryData.users.length,
    clears: memoryData.completions.length
  };
}

module.exports = {
  initDb,
  saveData,
  getUserById,
  getUserByUsername,
  getAllUsers,
  createUser,
  deleteUser,
  getLevelById,
  getAllLevels,
  getTopLevel,
  getMaxLevelRank,
  getDifficulties,
  createLevel,
  updateLevel,
  deleteLevel,
  getCompletionsForLevel,
  getCompletionsForUser,
  getRecentCompletions,
  createCompletion,
  deleteCompletion,
  getLeaderboard,
  getStats
};
