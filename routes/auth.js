// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getUserByUsername, createUser } = require('../db/store');

// GET /login
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { title: 'Sign In — LEVEL/LIST', error: null, formData: {} });
});

// POST /login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const trimUser = (username || '').trim().toLowerCase();

  if (!trimUser || !password) {
    return res.render('login', {
      title: 'Sign In — LEVEL/LIST',
      error: 'Please enter your username and password.',
      formData: { username: trimUser },
    });
  }

  const user = getUserByUsername(trimUser);
  if (!user) {
    return res.render('login', {
      title: 'Sign In — LEVEL/LIST',
      error: 'Invalid username or password.',
      formData: { username: trimUser },
    });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.render('login', {
      title: 'Sign In — LEVEL/LIST',
      error: 'Invalid username or password.',
      formData: { username: trimUser },
    });
  }

  req.session.userId = user.id;
  const returnTo = req.session.returnTo || '/dashboard';
  delete req.session.returnTo;
  res.redirect(returnTo);
});

// GET /register
router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('register', { title: 'Join the List — LEVEL/LIST', error: null, formData: {} });
});

// POST /register
router.post('/register', async (req, res) => {
  const { username, password, confirm_password } = req.body;
  const trimUser = (username || '').trim().toLowerCase();

  // Validation
  if (!trimUser || !password) {
    return res.render('register', {
      title: 'Join the List — LEVEL/LIST',
      error: 'Username and password are required.',
      formData: { username: trimUser },
    });
  }

  if (!/^[a-z0-9_]{3,20}$/.test(trimUser)) {
    return res.render('register', {
      title: 'Join the List — LEVEL/LIST',
      error: 'Username must be 3–20 characters: letters, numbers, or underscores only.',
      formData: { username: trimUser },
    });
  }

  if (password.length < 8) {
    return res.render('register', {
      title: 'Join the List — LEVEL/LIST',
      error: 'Password must be at least 8 characters.',
      formData: { username: trimUser },
    });
  }

  if (password !== confirm_password) {
    return res.render('register', {
      title: 'Join the List — LEVEL/LIST',
      error: 'Passwords do not match.',
      formData: { username: trimUser },
    });
  }

  // Check username availability
  const existing = getUserByUsername(trimUser);
  if (existing) {
    return res.render('register', {
      title: 'Join the List — LEVEL/LIST',
      error: 'That username is already taken.',
      formData: { username: trimUser },
    });
  }

  // Hash and insert
  const hash = await bcrypt.hash(password, 12);
  const displayName = trimUser.charAt(0).toUpperCase() + trimUser.slice(1);
  const userId = createUser(trimUser, displayName, hash, 'user');

  req.session.userId = userId;
  res.redirect('/dashboard');
});

// POST /logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
