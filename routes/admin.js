// routes/admin.js
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { get, all, run, insert } = require('../db/connection');

// Protect all admin routes
router.use(requireAdmin);

// GET /admin
router.get('/', (req, res) => {
  const levels = all('SELECT l.*, (SELECT COUNT(*) FROM completions c WHERE c.level_id = l.id) as clear_count FROM levels l ORDER BY l.rank ASC');
  const players = all("SELECT id, username, display_name FROM users WHERE role = 'user' ORDER BY display_name ASC");
  const recentCompletions = all(`
    SELECT c.*, u.display_name as player_name, u.username, l.name as level_name, l.points
    FROM completions c
    JOIN users u ON c.user_id = u.id
    JOIN levels l ON c.level_id = l.id
    ORDER BY c.completed_at DESC
    LIMIT 20
  `);

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
router.get('/level/new', (req, res) => {
  // Get next available rank
  const maxRank = get('SELECT MAX(rank) as max FROM levels');
  const nextRank = maxRank && maxRank.max ? maxRank.max + 1 : 1;

  res.render('admin-level-form', {
    title: 'New Level — LEVEL/LIST',
    level: null,
    nextRank,
    error: null,
  });
});

// POST /admin/level
router.post('/level', (req, res) => {
  const { name, rank, difficulty, points, creator, verifier, description } = req.body;

  if (!name || !rank || !difficulty || !points || !creator || !verifier) {
    const maxRank = get('SELECT MAX(rank) as max FROM levels');
    const nextRank = maxRank && maxRank.max ? maxRank.max + 1 : 1;
    return res.render('admin-level-form', {
      title: 'New Level — LEVEL/LIST',
      level: null,
      nextRank,
      error: 'All fields except description are required.',
    });
  }

  // Check rank collision
  const existing = get('SELECT id FROM levels WHERE rank = ?', [parseInt(rank)]);
  if (existing) {
    // Shift all levels with rank >= new rank down by 1
    run('UPDATE levels SET rank = rank + 1 WHERE rank >= ?', [parseInt(rank)]);
  }

  insert(
    'INSERT INTO levels (rank, name, difficulty, points, creator, verifier, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [parseInt(rank), name.trim(), difficulty, parseInt(points), creator.trim(), verifier.trim(), (description || '').trim()]
  );

  req.session.flash = { type: 'success', message: `Level "${name}" added at rank #${rank}.` };
  res.redirect('/admin');
});

// GET /admin/level/:id/edit
router.get('/level/:id/edit', (req, res) => {
  const level = get('SELECT * FROM levels WHERE id = ?', [req.params.id]);
  if (!level) return res.redirect('/admin');

  res.render('admin-level-form', {
    title: `Edit ${level.name} — LEVEL/LIST`,
    level,
    nextRank: level.rank,
    error: null,
  });
});

// POST /admin/level/:id
router.post('/level/:id', (req, res) => {
  const level = get('SELECT * FROM levels WHERE id = ?', [req.params.id]);
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

  // If rank changed, handle collision
  const newRank = parseInt(rank);
  if (newRank !== level.rank) {
    const collision = get('SELECT id FROM levels WHERE rank = ? AND id != ?', [newRank, level.id]);
    if (collision) {
      if (newRank < level.rank) {
        run('UPDATE levels SET rank = rank + 1 WHERE rank >= ? AND rank < ? AND id != ?', [newRank, level.rank, level.id]);
      } else {
        run('UPDATE levels SET rank = rank - 1 WHERE rank > ? AND rank <= ? AND id != ?', [level.rank, newRank, level.id]);
      }
    }
  }

  run(
    'UPDATE levels SET rank = ?, name = ?, difficulty = ?, points = ?, creator = ?, verifier = ?, description = ? WHERE id = ?',
    [newRank, name.trim(), difficulty, parseInt(points), creator.trim(), verifier.trim(), (description || '').trim(), level.id]
  );

  req.session.flash = { type: 'success', message: `Level "${name}" updated.` };
  res.redirect('/admin');
});

// POST /admin/level/:id/delete
router.post('/level/:id/delete', (req, res) => {
  const level = get('SELECT * FROM levels WHERE id = ?', [req.params.id]);
  if (!level) return res.redirect('/admin');

  // Delete completions for this level first
  run('DELETE FROM completions WHERE level_id = ?', [level.id]);
  run('DELETE FROM levels WHERE id = ?', [level.id]);

  req.session.flash = { type: 'success', message: `Level "${level.name}" deleted.` };
  res.redirect('/admin');
});

// POST /admin/completion — add a verified completion
router.post('/completion', (req, res) => {
  const { user_id, level_id, notes } = req.body;

  if (!user_id || !level_id) {
    req.session.flash = { type: 'error', message: 'Player and level are required.' };
    return res.redirect('/admin');
  }

  const user = get('SELECT * FROM users WHERE id = ?', [user_id]);
  const level = get('SELECT * FROM levels WHERE id = ?', [level_id]);

  if (!user || !level) {
    req.session.flash = { type: 'error', message: 'Invalid player or level.' };
    return res.redirect('/admin');
  }

  // Check for duplicate
  const existing = get('SELECT id FROM completions WHERE user_id = ? AND level_id = ?', [user_id, level_id]);
  if (existing) {
    req.session.flash = { type: 'error', message: `${user.display_name} has already completed "${level.name}".` };
    return res.redirect('/admin');
  }

  insert(
    'INSERT INTO completions (user_id, level_id, verified_by, notes) VALUES (?, ?, ?, ?)',
    [user_id, level_id, 'ListMaker', (notes || '').trim()]
  );

  req.session.flash = { type: 'success', message: `Verified clear of "${level.name}" added for ${user.display_name}. (+${level.points} pts)` };
  res.redirect('/admin');
});

// POST /admin/completion/:id/revoke
router.post('/completion/:id/revoke', (req, res) => {
  const completion = get(`
    SELECT c.*, u.display_name as player_name, l.name as level_name, l.points
    FROM completions c
    JOIN users u ON c.user_id = u.id
    JOIN levels l ON c.level_id = l.id
    WHERE c.id = ?
  `, [req.params.id]);

  if (!completion) {
    req.session.flash = { type: 'error', message: 'Completion not found.' };
    return res.redirect('/admin');
  }

  run('DELETE FROM completions WHERE id = ?', [completion.id]);

  req.session.flash = {
    type: 'success',
    message: `Revoked "${completion.level_name}" clear for ${completion.player_name}. (-${completion.points} pts)`,
  };
  res.redirect('/admin');
});

module.exports = router;
