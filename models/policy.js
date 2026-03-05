// Policy Model
const policies = [
  { endpoint: '/api/transfer', role: 'admin', maxRisk: 5 },
  { endpoint: '/api/transfer', role: 'user', maxRisk: 2 }
];

async function getPolicyForEndpoint(endpoint, role) {
  return policies.find(p => p.endpoint === endpoint && p.role === role);
}

module.exports = { getPolicyForEndpoint };
