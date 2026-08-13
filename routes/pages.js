// routes/pages.js
const express = require('express');
const router = express.Router();
const { getTopLevel, getStats, getAllLevels, getDifficulties, getLeaderboard } = require('../db/store');

// GET /
router.get('/', async (req, res) => {
  const topLevel = await getTopLevel();
  const stats = await getStats();

  res.render('home', {
    title: 'LEVEL/LIST — The Public Ranking of Impossible Levels',
    topLevel,
    stats,
  });
});

// GET /list
router.get('/list', async (req, res) => {
  const search = (req.query.q || '').trim();
  const difficulty = req.query.difficulty || '';
  const sort = req.query.sort || 'rank';

  const levels = await getAllLevels(search, difficulty, sort);
  const difficulties = await getDifficulties();

  res.render('list', {
    title: 'The List — LEVEL/LIST',
    levels,
    difficulties,
    search,
    difficulty,
    sort,
  });
});

// GET /leaderboard
router.get('/leaderboard', async (req, res) => {
  const search = (req.query.q || '').trim();
  const players = await getLeaderboard(search);

  res.render('leaderboard', {
    title: 'Leaderboard — LEVEL/LIST',
    players,
    search,
  });
});

// GET /players
router.get('/players', async (req, res) => {
  const search = (req.query.q || '').trim();
  const players = await getLeaderboard(search);

  res.render('players', {
    title: 'Players — LEVEL/LIST',
    players,
    search,
  });
});

module.exports = router;
