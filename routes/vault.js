const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const mfaEnforcer = require('../middleware/mfaEnforcer');
const KeyNode = require('../models/KeyNode');
const ResponseFactory = require('../utils/responseFactory');

/**
 * Vault Administrative Routes
 * Issue #770: APIs for managing tenant encryption keys.
 */

/**
 * @route   GET /api/vault/status
 * @desc    Check encryption status for the current workspace/tenant
 */
router.get('/status', [auth, mfaEnforcer], async (req, res) => {
    // Requires admin level access
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Vault management requires administrative access' });
    }

    try {
        const tenantId = req.headers['x-tenant-id'] || req.user.tenantId;

        const keyNode = await KeyNode.findOne({ tenantId });

        return ResponseFactory.success(res, {
            vaultActive: !!keyNode,
            algorithm: keyNode ? keyNode.algorithm : null,
            keyVersion: keyNode ? keyNode.version : null,
            lastRotated: keyNode ? keyNode.lastRotatedAt : null
        });
    } catch (error) {
        return ResponseFactory.error(res, 500, error.message);
    }
});

module.exports = router;
