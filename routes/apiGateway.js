const express = require('express');
const auth = require('../middleware/auth');
const apiGatewayPolicyService = require('../services/apiGatewayPolicyService');
const apiGateway = require('../middleware/apiGateway');

const router = express.Router();

const adminAuth = (req, res, next) => {
  const isAdminByEmail = process.env.ADMIN_EMAIL && req.user?.email === process.env.ADMIN_EMAIL;
  const role = req.user?.role;
  const isAdminByRole = role === 'admin' || role === 'superadmin';

  if (!isAdminByEmail && !isAdminByRole) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }

  next();
};

router.get('/policies', auth, adminAuth, (req, res) => {
  const policies = apiGatewayPolicyService.getPolicies();
  const health = apiGatewayPolicyService.getHealth();
  const riskHealth = apiGateway.getRiskHealth();

  res.json({
    success: true,
    health,
    riskHealth,
    policies
  });
});

router.get('/risk-health', auth, adminAuth, (req, res) => {
  const health = apiGatewayPolicyService.getHealth();
  const riskHealth = apiGateway.getRiskHealth();

  return res.json({
    success: true,
    health,
    riskHealth
  });
});

router.get('/decisions', auth, adminAuth, (req, res) => {
  const limit = Number(req.query.limit || 200);
  const correlationId = req.query.correlationId ? String(req.query.correlationId) : undefined;
  const actorKey = req.query.actorKey ? String(req.query.actorKey) : undefined;
  const minTier = req.query.minTier !== undefined ? Number(req.query.minTier) : undefined;

  const decisions = apiGateway.getRiskAuditTrail({
    limit,
    correlationId,
    actorKey,
    minTier
  });

  return res.json({
    success: true,
    count: decisions.length,
    decisions
  });
});

router.put('/policies', auth, adminAuth, (req, res) => {
  try {
    const nextPolicies = req.body;

    if (!nextPolicies || typeof nextPolicies !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Valid policy payload is required'
      });
    }

    const updated = apiGatewayPolicyService.updatePolicies(nextPolicies, {
      bumpVersion: req.query.bumpVersion === 'true'
    });

    return res.json({
      success: true,
      message: 'API gateway policies updated',
      policies: updated
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message || 'Policy update failed'
    });
  }
});

module.exports = router;
