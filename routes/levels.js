// routes/levels.js
const express = require('express');
const router = express.Router();
const { getLevelById, getCompletionsForLevel } = require('../db/store');

// GET /level/:id
router.get('/level/:id', async (req, res) => {
  const level = await getLevelById(req.params.id);
  if (!level) {
    return res.status(404).render('error', {
      title: 'Level Not Found',
      code: 404,
      message: 'That level does not exist on the list.',
    });
  }

  const completions = await getCompletionsForLevel(level.id);

  res.render('level-detail', {
    title: `${level.name} — LEVEL/LIST`,
    level,
    completions,
  });
});

module.exports = router;
