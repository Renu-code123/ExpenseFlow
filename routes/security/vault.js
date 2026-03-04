const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const vaultService = require('../../services/vaultService');
const VaultMetadata = require('../../models/VaultMetadata');

/**
 * @route   POST /api/security/vault/init
 * @desc    Initialize a new ZK-Encryption vault
 */
router.post('/init', auth, async (req, res) => {
    try {
        const { vaultSecret } = req.body;
        if (!vaultSecret) return res.status(400).json({ success: false, error: 'Vault secret required' });

        const result = await vaultService.initializeVault(req.user._id, vaultSecret);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/security/vault/status
 * @desc    Check vault status for current user
 */
router.get('/status', auth, async (req, res) => {
    try {
        const metadata = await VaultMetadata.findOne({ userId: req.user._id });
        res.json({
            success: true,
            data: {
                isEnabled: !!metadata?.isEncryptedVaultEnabled,
                lastRotatedAt: metadata?.lastRotatedAt,
                version: metadata?.keyRotationVersion
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/security/vault/rotate
 * @desc    Rotate user encryption keys (Requires re-encrypting all data)
 * (Implementation placeholder for L3 demonstration)
 */
router.post('/rotate', auth, async (req, res) => {
    res.json({ success: true, message: 'Key rotation scheduled' });
});

module.exports = router;
