// auth.js
// Centralized authentication middleware (JWT)
const jwt = require('jsonwebtoken');
const SECRET = 'supersecretkey';

function authenticate(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function issueToken(user) {
  return jwt.sign(user, SECRET, { expiresIn: '1h' });
}

module.exports = { authenticate, issueToken };
