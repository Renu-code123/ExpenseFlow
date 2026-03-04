// adminApi.js
// Admin API for dynamic policy management
const express = require('express');
const { updatePolicy, getPolicies } = require('./policyEngine');
const { authenticate } = require('./auth');
const router = express.Router();

router.use(authenticate);

router.get('/admin/policies', (req, res) => {
  res.json({ policies: getPolicies() });
});

router.post('/admin/policies/update', (req, res) => {
  const { path, policy } = req.body;
  updatePolicy(path, policy);
  res.json({ success: true });
});

module.exports = router;
