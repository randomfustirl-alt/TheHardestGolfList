// routes/admin.js
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const {
  getAllLevels,
  getAllUsers,
  getRecentCompletions,
  getMaxLevelRank,
  createLevel,
  getLevelById,
  updateLevel,
  deleteLevel,
  getUserById,
  createCompletion,
  deleteCompletion,
  deleteUser,
  updateUserRole
} = require('../db/store');

// Protect all admin routes
router.use(requireAdmin);

// GET /admin
router.get('/', async (req, res) => {
  const levels = await getAllLevels();
  const players = await getAllUsers();
  const recentCompletions = await getRecentCompletions(20);

  res.render('admin', {
    title: 'Admin — LEVEL/LIST',
    levels,
    players,
    recentCompletions,
    flash: req.session.flash || null,
  });
  delete req.session.flash;
});

// GET /admin/level/new
router.get('/level/new', async (req, res) => {
  const maxRank = await getMaxLevelRank();
  const nextRank = maxRank + 1;

  res.render('admin-level-form', {
    title: 'New Level — LEVEL/LIST',
    level: null,
    nextRank,
    error: null,
  });
});

// POST /admin/level
router.post('/level', async (req, res) => {
  const { name, rank, difficulty, points, creator, verifier, description } = req.body;

  if (!name || !rank || !difficulty || !points || !creator || !verifier) {
    const maxRank = await getMaxLevelRank();
    const nextRank = maxRank + 1;
    return res.render('admin-level-form', {
      title: 'New Level — LEVEL/LIST',
      level: null,
      nextRank,
      error: 'All fields except description are required.',
    });
  }

  await createLevel({ name, rank, difficulty, points, creator, verifier, description });

  req.session.flash = { type: 'success', message: `Level "${name}" added at rank #${rank}.` };
  res.redirect('/admin');
});

// GET /admin/level/:id/edit
router.get('/level/:id/edit', async (req, res) => {
  const level = await getLevelById(req.params.id);
  if (!level) return res.redirect('/admin');

  res.render('admin-level-form', {
    title: `Edit ${level.name} — LEVEL/LIST`,
    level,
    nextRank: level.rank,
    error: null,
  });
});

// POST /admin/level/:id
router.post('/level/:id', async (req, res) => {
  const level = await getLevelById(req.params.id);
  if (!level) return res.redirect('/admin');

  const { name, rank, difficulty, points, creator, verifier, description } = req.body;

  if (!name || !rank || !difficulty || !points || !creator || !verifier) {
    return res.render('admin-level-form', {
      title: `Edit ${level.name} — LEVEL/LIST`,
      level,
      nextRank: level.rank,
      error: 'All fields except description are required.',
    });
  }

  await updateLevel(level.id, { name, rank, difficulty, points, creator, verifier, description });

  req.session.flash = { type: 'success', message: `Level "${name}" updated.` };
  res.redirect('/admin');
});

// POST /admin/level/:id/delete
router.post('/level/:id/delete', async (req, res) => {
  const level = await getLevelById(req.params.id);
  if (!level) return res.redirect('/admin');

  await deleteLevel(level.id);

  req.session.flash = { type: 'success', message: `Level "${level.name}" deleted.` };
  res.redirect('/admin');
});

// POST /admin/completion — add a verified completion
router.post('/completion', async (req, res) => {
  const { user_id, level_id, notes } = req.body;

  if (!user_id || !level_id) {
    req.session.flash = { type: 'error', message: 'Player and level are required.' };
    return res.redirect('/admin');
  }

  const user = await getUserById(user_id);
  const level = await getLevelById(level_id);

  if (!user || !level) {
    req.session.flash = { type: 'error', message: 'Invalid player or level.' };
    return res.redirect('/admin');
  }

  const result = await createCompletion(user.id, level.id, 'ListMaker', notes);
  if (!result) {
    req.session.flash = { type: 'error', message: `${user.display_name} has already completed "${level.name}".` };
    return res.redirect('/admin');
  }

  req.session.flash = { type: 'success', message: `Verified clear of "${level.name}" added for ${user.display_name}. (+${level.points} pts)` };
  res.redirect('/admin');
});

// POST /admin/completion/:id/revoke
router.post('/completion/:id/revoke', async (req, res) => {
  const comp = await deleteCompletion(req.params.id);

  if (!comp) {
    req.session.flash = { type: 'error', message: 'Completion not found.' };
    return res.redirect('/admin');
  }

  req.session.flash = {
    type: 'success',
    message: `Revoked "${comp.level_name}" clear for ${comp.player_name}. (-${comp.points} pts)`,
  };
  res.redirect('/admin');
});

// POST /admin/user/:id/delete — Delete a user account and all their records
router.post('/user/:id/delete', async (req, res) => {
  const targetUser = await getUserById(req.params.id);

  if (!targetUser) {
    req.session.flash = { type: 'error', message: 'User not found.' };
    return res.redirect('/admin');
  }

  // Prevent deleting ListMaker / self-deletion
  if (targetUser.username === 'listmaker' || targetUser.id === req.user.id) {
    req.session.flash = { type: 'error', message: 'The primary ListMaker account cannot be deleted.' };
    return res.redirect('/admin');
  }

  await deleteUser(targetUser.id);

  req.session.flash = {
    type: 'success',
    message: `User account "${targetUser.display_name}" (@${targetUser.username}) and all associated records deleted.`,
  };
  res.redirect('/admin');
});

// POST /admin/user/:id/toggle-admin — Grant or revoke admin role
router.post('/user/:id/toggle-admin', async (req, res) => {
  const targetUser = await getUserById(req.params.id);

  if (!targetUser) {
    req.session.flash = { type: 'error', message: 'User not found.' };
    return res.redirect('/admin');
  }

  // Prevent demoting primary ListMaker account
  if (targetUser.username === 'listmaker') {
    req.session.flash = { type: 'error', message: 'The primary ListMaker account role cannot be changed.' };
    return res.redirect('/admin');
  }

  const newRole = targetUser.role === 'admin' ? 'user' : 'admin';
  await updateUserRole(targetUser.id, newRole);

  const actionText = newRole === 'admin' ? 'granted Administrator permissions to' : 'revoked Administrator permissions from';
  req.session.flash = {
    type: 'success',
    message: `Successfully ${actionText} ${targetUser.display_name} (@${targetUser.username}).`,
  };
  res.redirect('/admin');
});

module.exports = router;
