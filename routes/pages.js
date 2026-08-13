// routes/pages.js
const express = require('express');
const router = express.Router();
const { get, all } = require('../db/connection');

// Helper: get leaderboard data (server-side points, deterministic ranking)
function getLeaderboard(searchQuery = '') {
  let sql = `
    SELECT
      u.id, u.username, u.display_name, u.created_at,
      COALESCE(SUM(l.points), 0) AS total_points,
      COUNT(c.id) AS verified_clears
    FROM users u
    LEFT JOIN completions c ON c.user_id = u.id
    LEFT JOIN levels l ON c.level_id = l.id
  `;
  const params = [];
  if (searchQuery) {
    sql += ` WHERE (LOWER(u.username) LIKE ? OR LOWER(u.display_name) LIKE ?)`;
    params.push(`%${searchQuery.toLowerCase()}%`, `%${searchQuery.toLowerCase()}%`);
  }
  sql += `
    GROUP BY u.id
    ORDER BY total_points DESC, verified_clears DESC, u.created_at ASC
  `;
  const rows = all(sql, params);
  // Add rank position
  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

// GET /
router.get('/', (req, res) => {
  const topLevel = get('SELECT * FROM levels ORDER BY rank ASC LIMIT 1');
  const totalLevels = get('SELECT COUNT(*) as count FROM levels');
  const totalPlayers = get("SELECT COUNT(*) as count FROM users");
  const totalClears = get('SELECT COUNT(*) as count FROM completions');

  res.render('home', {
    title: 'LEVEL/LIST — The Public Ranking of Impossible Levels',
    topLevel,
    stats: {
      levels: totalLevels ? totalLevels.count : 0,
      players: totalPlayers ? totalPlayers.count : 0,
      clears: totalClears ? totalClears.count : 0,
    },
  });
});

// GET /list
router.get('/list', (req, res) => {
  const search = (req.query.q || '').trim();
  const difficulty = req.query.difficulty || '';
  const sort = req.query.sort || 'rank';

  let sql = 'SELECT l.*, (SELECT COUNT(*) FROM completions c WHERE c.level_id = l.id) as clear_count FROM levels l WHERE 1=1';
  const params = [];

  if (search) {
    sql += ` AND (LOWER(l.name) LIKE ? OR LOWER(l.creator) LIKE ? OR LOWER(l.verifier) LIKE ?)`;
    const q = `%${search.toLowerCase()}%`;
    params.push(q, q, q);
  }
  if (difficulty) {
    sql += ` AND l.difficulty = ?`;
    params.push(difficulty);
  }

  const sortMap = {
    rank: 'l.rank ASC',
    points_desc: 'l.points DESC',
    points_asc: 'l.points ASC',
    name: 'l.name ASC',
    clears: 'clear_count DESC',
    newest: 'l.date_added DESC',
  };
  sql += ` ORDER BY ${sortMap[sort] || 'l.rank ASC'}`;

  const levels = all(sql, params);
  const difficulties = all('SELECT DISTINCT difficulty FROM levels ORDER BY difficulty ASC');

  res.render('list', {
    title: 'The List — LEVEL/LIST',
    levels,
    difficulties: difficulties.map(d => d.difficulty),
    search,
    difficulty,
    sort,
  });
});

// GET /leaderboard
router.get('/leaderboard', (req, res) => {
  const search = (req.query.q || '').trim();
  const players = getLeaderboard(search);

  res.render('leaderboard', {
    title: 'Leaderboard — LEVEL/LIST',
    players,
    search,
  });
});

// GET /players
router.get('/players', (req, res) => {
  const search = (req.query.q || '').trim();
  const players = getLeaderboard(search);

  res.render('players', {
    title: 'Players — LEVEL/LIST',
    players,
    search,
  });
});

module.exports = router;
