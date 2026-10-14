const router = require('express').Router();
const { db, H } = require('../db');
const crypto = require('crypto');
const { W, sessions } = require('../middleware');

// ===== Auth =====
router.post('/api/login', W((q, r) => {
  const { username, password, portal } = q.body, u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!u || u.pw !== H(password || '')) return r.status(401).json({ message: 'Invalid username or password' });
  if (u.role !== portal) return r.status(403).json({ message: `This is the ${portal} portal — please use the ${u.role} portal.` });
  const token = crypto.randomUUID(), user = { id: u.id, username: u.username, role: u.role, name: u.name };
  sessions.set(token, user); r.json({ token, user });
}));

module.exports = router;
