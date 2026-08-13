// middleware/helpers.js
// EJS helper functions injected into res.locals

function padRank(n) {
  return String(n).padStart(3, '0');
}

function formatPoints(n) {
  return Number(n).toLocaleString('en-US');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function difficultyClass(difficulty) {
  const map = {
    'Mythic': 'diff-mythic',
    'Extreme': 'diff-extreme',
    'Insane': 'diff-insane',
    'Hard': 'diff-hard',
    'Medium': 'diff-medium',
  };
  return map[difficulty] || 'diff-medium';
}

function avatarHue(username) {
  // Deterministic hue from username
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function avatarInitials(displayName) {
  if (!displayName) return '?';
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return displayName.slice(0, 2).toUpperCase();
}

module.exports = function attachHelpers(req, res, next) {
  res.locals.padRank = padRank;
  res.locals.formatPoints = formatPoints;
  res.locals.formatDate = formatDate;
  res.locals.difficultyClass = difficultyClass;
  res.locals.avatarHue = avatarHue;
  res.locals.avatarInitials = avatarInitials;
  next();
};
