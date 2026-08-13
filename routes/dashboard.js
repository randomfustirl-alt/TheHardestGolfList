// routes/dashboard.js
const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const { get, all } = require('../db/connection');

// GET /dashboard
router.get('/dashboard', requireLogin, (req, res) => {
  const userId = req.user.id;

  // Stats
  const stats = get(`
    SELECT COALESCE(SUM(l.points), 0) as total_points, COUNT(c.id) as verified_clears
    FROM completions c
    JOIN levels l ON c.level_id = l.id
    WHERE c.user_id = ?
  `, [userId]);

  // Rank
  const allPlayers = all(`
    SELECT u.id, COALESCE(SUM(l.points), 0) as total_points, COUNT(c.id) as verified_clears, u.created_at
    FROM users u
    LEFT JOIN completions c ON c.user_id = u.id
    LEFT JOIN levels l ON c.level_id = l.id
    GROUP BY u.id
    ORDER BY total_points DESC, verified_clears DESC, u.created_at ASC
  `);
  const rankIndex = allPlayers.findIndex(p => p.id === userId);
  const myRank = rankIndex >= 0 ? rankIndex + 1 : null;
  const totalPlayers = allPlayers.length;

  // Recent + all completions
  const completions = all(`
    SELECT c.*, l.name as level_name, l.difficulty, l.points, l.rank as level_rank, l.id as level_id
    FROM completions c
    JOIN levels l ON c.level_id = l.id
    WHERE c.user_id = ?
    ORDER BY c.completed_at DESC
  `, [userId]);

  res.render('dashboard', {
    title: `Dashboard — LEVEL/LIST`,
    stats,
    myRank,
    totalPlayers,
    completions,
  });
});

module.exports = router;
