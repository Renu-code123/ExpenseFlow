// advancedPolicyEngine.js
// Advanced policy engine with RBAC, ABAC, and real-time updates
const { getPolicy } = require('./policyStore');

function enforceAdvancedPolicy(req, res, next) {
  const policy = getPolicy(req.path);
  if (!policy) return next();
  // RBAC check
  if (policy.roles && !policy.roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied (role)' });
  }
  // ABAC check
  if (policy.attributes) {
    for (const attr in policy.attributes) {
      if (req.user[attr] !== policy.attributes[attr]) {
        return res.status(403).json({ error: `Access denied (attribute: ${attr})` });
      }
    }
  }
  // Rate limit override
  if (policy.rateLimit && req.rateLimit && req.rateLimit > policy.rateLimit) {
    return res.status(429).json({ error: 'Rate limit exceeded (policy)' });
  }
  next();
}

module.exports = { enforceAdvancedPolicy };
