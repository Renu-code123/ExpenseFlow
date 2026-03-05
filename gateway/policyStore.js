// policyStore.js
// In-memory and persistent policy storage for dynamic enforcement
const fs = require('fs');
const POLICY_FILE = 'gateway/policies.json';

let policies = {};

function loadPolicies() {
  if (fs.existsSync(POLICY_FILE)) {
    policies = JSON.parse(fs.readFileSync(POLICY_FILE));
  }
}

function savePolicies() {
  fs.writeFileSync(POLICY_FILE, JSON.stringify(policies, null, 2));
}

function getPolicy(path) {
  return policies[path];
}

function setPolicy(path, policy) {
  policies[path] = policy;
  savePolicies();
}

function deletePolicy(path) {
  delete policies[path];
  savePolicies();
}

function listPolicies() {
  return policies;
}

loadPolicies();

module.exports = {
  getPolicy,
  setPolicy,
  deletePolicy,
  listPolicies,
  loadPolicies,
  savePolicies
};
