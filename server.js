// server.js — LEVEL/LIST main entry point
const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDb } = require('./db/store');
const attachHelpers = require('./middleware/helpers');
const { attachUser } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sessions
app.use(session({
  secret: 'levellist-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
  },
}));

// Global middleware
app.use(attachHelpers);
app.use(attachUser);

// Routes
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/pages'));
app.use('/', require('./routes/levels'));
app.use('/', require('./routes/players'));
app.use('/', require('./routes/dashboard'));
app.use('/admin', require('./routes/admin'));

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page Not Found — LEVEL/LIST',
    code: 404,
    message: 'This page does not exist on the list.',
  });
});

// 500
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: 'Server Error — LEVEL/LIST',
    code: 500,
    message: 'Something went wrong. Please try again.',
  });
});

// Boot: init DB store then start server
(async () => {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`\n  LEVEL/LIST running at http://localhost:${PORT}\n`);
      console.log(`  Admin login: listmaker / !ListMaker69$`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
