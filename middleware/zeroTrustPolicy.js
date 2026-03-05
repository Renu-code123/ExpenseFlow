// Zero-Trust Dynamic Policy Enforcement Middleware
const { getPolicyForEndpoint } = require('../models/policy');

module.exports = async function zeroTrustPolicy(req, res, next) {
  const endpoint = req.path;
  const user = req.user;
  const riskScore = req.riskScore;
  const policy = await getPolicyForEndpoint(endpoint, user.role);
  if (!policy) {
    return res.status(403).json({ error: 'No policy for endpoint' });
  }
  // Dynamic enforcement: check risk, context, etc.
  if (riskScore > policy.maxRisk) {
    return res.status(403).json({ error: 'Access denied: high risk' });
  }
  // Additional contextual checks (time, geo, device, etc.)
  // ...
  next();
}
