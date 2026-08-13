// db/store.js — Dual Engine: MongoDB Cloud (Primary) + Local JSON Fallback
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// Mongoose Schemas for MongoDB
const userSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  username: { type: String, required: true, unique: true, lowercase: true },
  display_name: { type: String, required: true },
  password_hash: { type: String, required: true },
  role: { type: String, default: 'user' },
  created_at: { type: Date, default: Date.now }
});

const levelSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  rank: { type: Number, required: true },
  name: { type: String, required: true },
  difficulty: { type: String, required: true },
  points: { type: Number, required: true },
  creator: { type: String, required: true },
  verifier: { type: String, required: true },
  description: { type: String, default: '' },
  date_added: { type: Date, default: Date.now }
});

const completionSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  user_id: { type: Number, required: true },
  level_id: { type: Number, required: true },
  verified_by: { type: String, default: 'ListMaker' },
  notes: { type: String, default: '' },
  completed_at: { type: Date, default: Date.now }
});

const metaSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  nextIds: {
    users: { type: Number, default: 1 },
    levels: { type: Number, default: 1 },
    completions: { type: Number, default: 1 }
  }
});

let UserDoc, LevelDoc, CompletionDoc, MetaDoc;

// Local JSON Fallback Setup
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
let isMongo = false;
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
  if (!memoryData || isMongo) return;
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(memoryData, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Write error:', err);
  }
}

async function initDb() {
  const mongoUri = process.env.MONGODB_URI;

  if (mongoUri) {
    try {
      await mongoose.connect(mongoUri);
      isMongo = true;
      UserDoc = mongoose.model('User', userSchema);
      LevelDoc = mongoose.model('Level', levelSchema);
      CompletionDoc = mongoose.model('Completion', completionSchema);
      MetaDoc = mongoose.model('Meta', metaSchema);

      let meta = await MetaDoc.findOne({ key: 'app_meta' });
      if (!meta) {
        meta = await MetaDoc.create({ key: 'app_meta', nextIds: { users: 1, levels: 1, completions: 1 } });
      }

      let listMaker = await UserDoc.findOne({ username: 'listmaker' });
      if (!listMaker) {
        const hash = await bcrypt.hash('!ListMaker69$', 12);
        await UserDoc.create({
          id: meta.nextIds.users++,
          username: 'listmaker',
          display_name: 'ListMaker',
          password_hash: hash,
          role: 'admin',
          created_at: new Date()
        });
        await meta.save();
        console.log('[DB] MongoDB Cloud: ListMaker admin account created.');
      }
      console.log('✅ [DB] Connected to MongoDB Cloud successfully!');
      return;
    } catch (err) {
      console.error('❌ [DB] MongoDB connection failed, falling back to local JSON store:', err.message);
      isMongo = false;
    }
  }

  // Local JSON fallback
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
  console.log(`ℹ️ [DB] Running on Local JSON Store (${memoryData.levels.length} levels, ${memoryData.users.length} users). Set MONGODB_URI to use cloud database.`);
}

// User Helpers
async function getUserById(id) {
  if (isMongo) {
    const u = await UserDoc.findOne({ id: Number(id) });
    return u ? u.toObject() : null;
  }
  ensureDataFile();
  return memoryData.users.find(u => u.id === Number(id)) || null;
}

async function getUserByUsername(username) {
  if (!username) return null;
  if (isMongo) {
    const u = await UserDoc.findOne({ username: username.toLowerCase() });
    return u ? u.toObject() : null;
  }
  ensureDataFile();
  return memoryData.users.find(u => u.username === username.toLowerCase()) || null;
}

async function getAllUsers() {
  if (isMongo) {
    const users = await UserDoc.find().lean();
    const completions = await CompletionDoc.find().lean();
    const levels = await LevelDoc.find().lean();

    return users.map(u => {
      const uComps = completions.filter(c => c.user_id === u.id);
      const total_points = uComps.reduce((sum, c) => {
        const lvl = levels.find(l => l.id === c.level_id);
        return sum + (lvl ? lvl.points : 0);
      }, 0);
      return {
        ...u,
        total_points,
        verified_clears: uComps.length
      };
    }).sort((a, b) => a.display_name.localeCompare(b.display_name));
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
  if (isMongo) {
    const meta = await MetaDoc.findOne({ key: 'app_meta' });
    const newId = meta.nextIds.users++;
    await meta.save();
    const u = await UserDoc.create({
      id: newId,
      username: username.toLowerCase(),
      display_name: displayName,
      password_hash: passwordHash,
      role,
      created_at: new Date()
    });
    return u.id;
  }
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

async function deleteUser(id) {
  const uid = Number(id);
  if (isMongo) {
    await UserDoc.deleteOne({ id: uid });
    await CompletionDoc.deleteMany({ user_id: uid });
    return;
  }
  ensureDataFile();
  memoryData.users = memoryData.users.filter(u => u.id !== uid);
  memoryData.completions = memoryData.completions.filter(c => c.user_id !== uid);
  saveData();
}

// Level Helpers
async function getLevelById(id) {
  if (isMongo) {
    const l = await LevelDoc.findOne({ id: Number(id) });
    return l ? l.toObject() : null;
  }
  ensureDataFile();
  return memoryData.levels.find(l => l.id === Number(id)) || null;
}

async function getAllLevels(search = '', difficulty = '', sort = 'rank') {
  let levels, completions;
  if (isMongo) {
    levels = await LevelDoc.find().lean();
    completions = await CompletionDoc.find().lean();
  } else {
    ensureDataFile();
    levels = memoryData.levels;
    completions = memoryData.completions;
  }

  let result = levels.map(l => {
    const clear_count = completions.filter(c => c.level_id === l.id).length;
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
  let levels;
  if (isMongo) {
    levels = await LevelDoc.find().lean();
  } else {
    ensureDataFile();
    levels = memoryData.levels;
  }
  if (levels.length === 0) return 0;
  return Math.max(...levels.map(l => l.rank));
}

async function getDifficulties() {
  let levels;
  if (isMongo) {
    levels = await LevelDoc.find().lean();
  } else {
    ensureDataFile();
    levels = memoryData.levels;
  }
  const set = new Set(levels.map(l => l.difficulty));
  return Array.from(set).sort();
}

async function createLevel({ rank, name, difficulty, points, creator, verifier, description }) {
  const r = Number(rank);

  if (isMongo) {
    await LevelDoc.updateMany({ rank: { $gte: r } }, { $inc: { rank: 1 } });
    const meta = await MetaDoc.findOne({ key: 'app_meta' });
    const newId = meta.nextIds.levels++;
    await meta.save();

    const lvl = await LevelDoc.create({
      id: newId,
      rank: r,
      name: name.trim(),
      difficulty,
      points: Number(points),
      creator: creator.trim(),
      verifier: verifier.trim(),
      description: (description || '').trim(),
      date_added: new Date()
    });
    return lvl.id;
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

  if (isMongo) {
    const level = await LevelDoc.findOne({ id: levelId });
    if (!level) return false;

    if (newRank !== level.rank) {
      if (newRank < level.rank) {
        await LevelDoc.updateMany({ id: { $ne: levelId }, rank: { $gte: newRank, $lt: level.rank } }, { $inc: { rank: 1 } });
      } else {
        await LevelDoc.updateMany({ id: { $ne: levelId }, rank: { $gt: level.rank, $lte: newRank } }, { $inc: { rank: -1 } });
      }
    }

    level.rank = newRank;
    level.name = name.trim();
    level.difficulty = difficulty;
    level.points = Number(points);
    level.creator = creator.trim();
    level.verifier = verifier.trim();
    level.description = (description || '').trim();

    await level.save();
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
  if (isMongo) {
    await LevelDoc.deleteOne({ id: levelId });
    await CompletionDoc.deleteMany({ level_id: levelId });
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
  let completions, users;
  if (isMongo) {
    completions = await CompletionDoc.find({ level_id: lid }).lean();
    users = await UserDoc.find().lean();
  } else {
    ensureDataFile();
    completions = memoryData.completions.filter(c => c.level_id === lid);
    users = memoryData.users;
  }

  return completions.map(c => {
    const user = users.find(u => u.id === c.user_id);
    return {
      ...c,
      username: user ? user.username : 'deleted',
      display_name: user ? user.display_name : 'Deleted User'
    };
  }).sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
}

async function getCompletionsForUser(userId) {
  const uid = Number(userId);
  let completions, levels;
  if (isMongo) {
    completions = await CompletionDoc.find({ user_id: uid }).lean();
    levels = await LevelDoc.find().lean();
  } else {
    ensureDataFile();
    completions = memoryData.completions.filter(c => c.user_id === uid);
    levels = memoryData.levels;
  }

  return completions.map(c => {
    const level = levels.find(l => l.id === c.level_id);
    return {
      ...c,
      level_name: level ? level.name : 'Deleted Level',
      difficulty: level ? level.difficulty : 'Unknown',
      points: level ? level.points : 0,
      level_rank: level ? level.rank : 999
    };
  }).sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
}

async function getRecentCompletions(limit = 20) {
  let completions, users, levels;
  if (isMongo) {
    completions = await CompletionDoc.find().lean();
    users = await UserDoc.find().lean();
    levels = await LevelDoc.find().lean();
  } else {
    ensureDataFile();
    completions = memoryData.completions;
    users = memoryData.users;
    levels = memoryData.levels;
  }

  return [...completions]
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
    .slice(0, limit)
    .map(c => {
      const user = users.find(u => u.id === c.user_id);
      const level = levels.find(l => l.id === c.level_id);
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

  if (isMongo) {
    const exists = await CompletionDoc.findOne({ user_id: uid, level_id: lid });
    if (exists) return null;

    const meta = await MetaDoc.findOne({ key: 'app_meta' });
    const newId = meta.nextIds.completions++;
    await meta.save();

    const comp = await CompletionDoc.create({
      id: newId,
      user_id: uid,
      level_id: lid,
      verified_by: verifiedBy,
      notes: (notes || '').trim(),
      completed_at: new Date()
    });
    return comp.id;
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

  if (isMongo) {
    const comp = await CompletionDoc.findOne({ id: cid });
    if (!comp) return null;

    const user = await UserDoc.findOne({ id: comp.user_id });
    const level = await LevelDoc.findOne({ id: comp.level_id });
    await CompletionDoc.deleteOne({ id: cid });

    return {
      ...comp.toObject(),
      player_name: user ? user.display_name : 'User',
      level_name: level ? level.name : 'Level',
      points: level ? level.points : 0
    };
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
  let users, completions, levels;
  if (isMongo) {
    users = await UserDoc.find().lean();
    completions = await CompletionDoc.find().lean();
    levels = await LevelDoc.find().lean();
  } else {
    ensureDataFile();
    users = memoryData.users;
    completions = memoryData.completions;
    levels = memoryData.levels;
  }

  let list = users.map(u => {
    const uComps = completions.filter(c => c.user_id === u.id);
    const total_points = uComps.reduce((sum, c) => {
      const lvl = levels.find(l => l.id === c.level_id);
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
  if (isMongo) {
    const [lCount, pCount, cCount] = await Promise.all([
      LevelDoc.countDocuments(),
      UserDoc.countDocuments(),
      CompletionDoc.countDocuments()
    ]);
    return { levels: lCount, players: pCount, clears: cCount };
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
