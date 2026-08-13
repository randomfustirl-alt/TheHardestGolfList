// routes/players.js
const express = require('express');
const router = express.Router();
const { get, all } = require('../db/connection');

// GET /player/:username
router.get('/player/:username', (req, res) => {
  const username = req.params.username.toLowerCase();
  const player = get('SELECT id, username, display_name, role, created_at FROM users WHERE username = ?', [username]);

  if (!player) {
    return res.status(404).render('error', {
      title: 'Player Not Found',
      code: 404,
      message: 'That player does not have a profile here.',
    });
  }

  // Get total points and clears (server-side)
  const stats = get(`
    SELECT COALESCE(SUM(l.points), 0) as total_points, COUNT(c.id) as verified_clears
    FROM completions c
    JOIN levels l ON c.level_id = l.id
    WHERE c.user_id = ?
  `, [player.id]);

  // Get player rank in leaderboard
  const allPlayers = all(`
    SELECT u.id, COALESCE(SUM(l.points), 0) as total_points, COUNT(c.id) as verified_clears, u.created_at
    FROM users u
    LEFT JOIN completions c ON c.user_id = u.id
    LEFT JOIN levels l ON c.level_id = l.id
    WHERE u.role = 'user'
    GROUP BY u.id
    ORDER BY total_points DESC, verified_clears DESC, u.created_at ASC
  `);
  const rankIndex = allPlayers.findIndex(p => p.id === player.id);
  const playerRank = rankIndex >= 0 ? rankIndex + 1 : null;

  // Get completion history
  const completions = all(`
    SELECT c.*, l.name as level_name, l.difficulty, l.points, l.rank as level_rank
    FROM completions c
    JOIN levels l ON c.level_id = l.id
    WHERE c.user_id = ?
    ORDER BY c.completed_at DESC
  `, [player.id]);

  res.render('player-profile', {
    title: `${player.display_name} — LEVEL/LIST`,
    player,
    stats,
    playerRank,
    completions,
  });
});

module.exports = router;
