// middleware/auth.js
const { getUserById } = require('../db/store');

// Attach logged-in user to req.user and res.locals.user on every request
async function attachUser(req, res, next) {
  res.locals.user = null;
  if (req.session && req.session.userId) {
    try {
      const user = await getUserById(req.session.userId);
      if (user) {
        req.user = user;
        res.locals.user = user;
      } else {
        req.session.destroy(() => {});
      }
    } catch (e) {
      console.error('Error attaching user:', e);
    }
  }
  next();
}

// Require authenticated user
function requireLogin(req, res, next) {
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  next();
}

// Require admin role
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.redirect('/login');
  }
  if (req.user.role !== 'admin') {
    return res.status(403).render('error', {
      title: 'Access Denied',
      code: 403,
      message: 'You do not have permission to access this page.',
    });
  }
  next();
}

module.exports = { attachUser, requireLogin, requireAdmin };
