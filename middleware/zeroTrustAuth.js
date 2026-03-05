// Zero-Trust Continuous Authentication Middleware
const { getSessionByToken } = require('../models/session');
const { getUserById } = require('../models/user');
const riskEngine = require('../risk/riskEngine');

module.exports = async function zeroTrustAuth(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const session = await getSessionByToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  const user = await getUserById(session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  // Continuous authentication: check device, biometrics, etc. (placeholder)
  // Risk analysis
  const riskScore = await riskEngine.calculateRisk(req, user, session);
  req.user = user;
  req.session = session;
  req.riskScore = riskScore;
  next();
}
