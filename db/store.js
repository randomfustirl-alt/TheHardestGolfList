// db/store.js
// Direct JSON File Persistence - NO COMPILATION, NO BINARIES, SAVES INSTANTLY TO DISK
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

// Memory cache of data
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
      console.error('[DB] Error parsing db.json, creating new database file:', e);
      memoryData = { users: [], levels: [], completions: [], nextIds: { users: 1, levels: 1, completions: 1 } };
      saveData();
    }
  }
}

function saveData() {
  if (!memoryData) return;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(memoryData, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] CRITICAL WRITE ERROR to db.json:', err);
  }
}

async function initDb() {
  ensureDataFile();

  // Check if ListMaker exists
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
    console.log('[DB] Admin account ListMaker created in db.json');
  }
  console.log(`[DB] JSON Store ready. (${memoryData.levels.length} levels, ${memoryData.users.length} users, ${memoryData.completions.length} completions)`);
}

// User Helpers
function getUserById(id) {
  ensureDataFile();
  return memoryData.users.find(u => u.id === Number(id)) || null;
}

function getUserByUsername(username) {
  ensureDataFile();
  if (!username) return null;
  return memoryData.users.find(u => u.username === username.toLowerCase()) || null;
}

function getAllUsers() {
  ensureDataFile();
  return memoryData.users.map(u => ({ ...u }));
}

function createUser(username, displayName, passwordHash, role = 'user') {
  ensureDataFile();
  const newUser = {
    id: memoryData.nextIds.users++,
    username: username.toLowerCase(),
    display_name: displayName,
    password_hash: passwordHash,
    role,
    created_at: new Date().toISOString()
  };
  memoryData.users.push(newUser);
  saveData();
  return newUser.id;
}

function deleteUser(id) {
  ensureDataFile();
  const uid = Number(id);
  memoryData.users = memoryData.users.filter(u => u.id !== uid);
  memoryData.completions = memoryData.completions.filter(c => c.user_id !== uid);
  saveData();
}

// Level Helpers
function getLevelById(id) {
  ensureDataFile();
  return memoryData.levels.find(l => l.id === Number(id)) || null;
}

function getAllLevels(search = '', difficulty = '', sort = 'rank') {
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

  // Sort
  if (sort === 'rank') result.sort((a, b) => a.rank - b.rank);
  else if (sort === 'points_desc') result.sort((a, b) => b.points - a.points);
  else if (sort === 'points_asc') result.sort((a, b) => a.points - b.points);
  else if (sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'clears') result.sort((a, b) => b.clear_count - a.clear_count);
  else if (sort === 'newest') result.sort((a, b) => new Date(b.date_added) - new Date(a.date_added));

  return result;
}

function getTopLevel() {
  ensureDataFile();
  if (memoryData.levels.length === 0) return null;
  const sorted = [...memoryData.levels].sort((a, b) => a.rank - b.rank);
  return sorted[0];
}

function getMaxLevelRank() {
  ensureDataFile();
  if (memoryData.levels.length === 0) return 0;
  return Math.max(...memoryData.levels.map(l => l.rank));
}

function getDifficulties() {
  ensureDataFile();
  const set = new Set(memoryData.levels.map(l => l.difficulty));
  return Array.from(set).sort();
}

function createLevel({ rank, name, difficulty, points, creator, verifier, description }) {
  ensureDataFile();
  const r = Number(rank);
  // Shift rank collisions
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

function updateLevel(id, { rank, name, difficulty, points, creator, verifier, description }) {
  ensureDataFile();
  const levelId = Number(id);
  const level = memoryData.levels.find(l => l.id === levelId);
  if (!level) return false;

  const newRank = Number(rank);
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

function deleteLevel(id) {
  ensureDataFile();
  const levelId = Number(id);
  memoryData.levels = memoryData.levels.filter(l => l.id !== levelId);
  memoryData.completions = memoryData.completions.filter(c => c.level_id !== levelId);
  saveData();
}

// Completion Helpers
function getCompletionsForLevel(levelId) {
  ensureDataFile();
  const lid = Number(levelId);
  return memoryData.completions
    .filter(c => c.level_id === lid)
    .map(c => {
      const user = getUserById(c.user_id);
      return {
        ...c,
        username: user ? user.username : 'deleted',
        display_name: user ? user.display_name : 'Deleted User'
      };
    })
    .sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
}

function getCompletionsForUser(userId) {
  ensureDataFile();
  const uid = Number(userId);
  return memoryData.completions
    .filter(c => c.user_id === uid)
    .map(c => {
      const level = getLevelById(c.level_id);
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

function getRecentCompletions(limit = 20) {
  ensureDataFile();
  return [...memoryData.completions]
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
    .slice(0, limit)
    .map(c => {
      const user = getUserById(c.user_id);
      const level = getLevelById(c.level_id);
      return {
        ...c,
        player_name: user ? user.display_name : 'Deleted User',
        username: user ? user.username : 'deleted',
        level_name: level ? level.name : 'Deleted Level',
        points: level ? level.points : 0
      };
    });
}

function createCompletion(userId, levelId, verifiedBy = 'ListMaker', notes = '') {
  ensureDataFile();
  const uid = Number(userId);
  const lid = Number(levelId);

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

function deleteCompletion(id) {
  ensureDataFile();
  const cid = Number(id);
  const comp = memoryData.completions.find(c => c.id === cid);
  if (!comp) return null;

  const user = getUserById(comp.user_id);
  const level = getLevelById(comp.level_id);
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
function getLeaderboard(searchQuery = '') {
  ensureDataFile();
  const users = memoryData.users;

  let list = users.map(u => {
    const userCompletions = memoryData.completions.filter(c => c.user_id === u.id);
    const total_points = userCompletions.reduce((sum, c) => {
      const level = getLevelById(c.level_id);
      return sum + (level ? level.points : 0);
    }, 0);

    return {
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      role: u.role,
      created_at: u.created_at,
      total_points,
      verified_clears: userCompletions.length
    };
  });

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(u =>
      u.username.toLowerCase().includes(q) ||
      u.display_name.toLowerCase().includes(q)
    );
  }

  // Sort by points desc, clears desc, creation date asc
  list.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (b.verified_clears !== a.verified_clears) return b.verified_clears - a.verified_clears;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  return list.map((item, index) => ({ ...item, rank: index + 1 }));
}

function getStats() {
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
