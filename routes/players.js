// routes/players.js
const express = require('express');
const router = express.Router();
const { getUserByUsername, getLeaderboard, getCompletionsForUser } = require('../db/store');

// GET /player/:username
router.get('/player/:username', async (req, res) => {
  const username = req.params.username.toLowerCase();
  const player = await getUserByUsername(username);

  if (!player) {
    return res.status(404).render('error', {
      title: 'Player Not Found',
      code: 404,
      message: 'That player does not have a profile here.',
    });
  }

  const completions = await getCompletionsForUser(player.id);
  const total_points = completions.reduce((sum, c) => sum + (c.points || 0), 0);

  const leaderboard = await getLeaderboard();
  const found = leaderboard.find(p => p.id === player.id);
  const playerRank = found ? found.rank : null;

  res.render('player-profile', {
    title: `${player.display_name} — LEVEL/LIST`,
    player,
    stats: {
      total_points,
      verified_clears: completions.length
    },
    playerRank,
    completions,
  });
});

module.exports = router;
