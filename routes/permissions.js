const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Role = require('../models/Role');
const Permission = require('../models/Permission');
const { requirePermission } = require('../middleware/rbacMiddleware');

/**
 * @route   GET /api/rbac/permissions
 * @desc    Get all available permissions
 */
router.get('/permissions', auth, async (req, res) => {
    try {
        const permissions = await Permission.find().sort({ module: 1, name: 1 });
        res.json({ success: true, data: permissions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/rbac/roles
 * @desc    Get all roles
 */
router.get('/roles', auth, async (req, res) => {
    try {
        const roles = await Role.find().populate('permissions');
        res.json({ success: true, data: roles });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/rbac/roles
 * @desc    Create a custom role (Requires global admin or specific permission)
 */
router.post('/roles', auth, async (req, res) => {
    try {
        const { name, code, permissions, inheritedFrom } = req.body;
        const role = new Role({ name, code, permissions, inheritedFrom });
        await role.save();
        res.status(201).json({ success: true, data: role });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
