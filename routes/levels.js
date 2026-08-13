// routes/levels.js
const express = require('express');
const router = express.Router();
const { get, all } = require('../db/connection');

// GET /level/:id
router.get('/level/:id', (req, res) => {
  const level = get('SELECT * FROM levels WHERE id = ?', [req.params.id]);
  if (!level) {
    return res.status(404).render('error', {
      title: 'Level Not Found',
      code: 404,
      message: 'That level does not exist on the list.',
    });
  }

  const completions = all(`
    SELECT c.*, u.username, u.display_name
    FROM completions c
    JOIN users u ON c.user_id = u.id
    WHERE c.level_id = ?
    ORDER BY c.completed_at ASC
  `, [level.id]);

  res.render('level-detail', {
    title: `${level.name} — LEVEL/LIST`,
    level,
    completions,
  });
});

module.exports = router;
