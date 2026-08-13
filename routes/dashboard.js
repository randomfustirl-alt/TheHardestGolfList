// routes/dashboard.js
const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/auth');
const { getLeaderboard, getCompletionsForUser } = require('../db/store');

// GET /dashboard
router.get('/dashboard', requireLogin, async (req, res) => {
  const userId = req.user.id;

  const completions = await getCompletionsForUser(userId);
  const total_points = completions.reduce((sum, c) => sum + (c.points || 0), 0);

  const leaderboard = await getLeaderboard();
  const found = leaderboard.find(p => p.id === userId);
  const myRank = found ? found.rank : null;
  const totalPlayers = leaderboard.length;

  res.render('dashboard', {
    title: `Dashboard — LEVEL/LIST`,
    stats: {
      total_points,
      verified_clears: completions.length
    },
    myRank,
    totalPlayers,
    completions,
  });
});

module.exports = router;
