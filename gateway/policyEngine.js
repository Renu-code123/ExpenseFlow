// policyEngine.js
// Dynamic policy enforcement middleware
let policies = {
  '/api/serviceA': { roles: ['admin', 'user'], rateLimit: 50 },
  '/api/serviceB': { roles: ['admin'], rateLimit: 20 }
};

function enforcePolicy(req, res, next) {
  const policy = policies[req.path];
  if (!policy) return next();
  if (!policy.roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

function updatePolicy(path, newPolicy) {
  policies[path] = newPolicy;
}

function getPolicies() {
  return policies;
}

module.exports = { enforcePolicy, updatePolicy, getPolicies };
