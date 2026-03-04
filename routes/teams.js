const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const teamManagementService = require('../services/teamManagementService');

/**
 * @route   POST /api/teams
 * @desc    Create a new team
 */
router.post('/', auth, roleCheck(['admin']), async (req, res) => {
    try {
        const team = await teamManagementService.createTeam(req.user._id, req.body);
        res.json({ success: true, data: team });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   GET /api/teams/my-teams
 * @desc    Get teams the user is part of
 */
router.get('/my-teams', auth, async (req, res) => {
    try {
        const teams = await teamManagementService.getHierarchy(req.user._id);
        res.json({ success: true, data: teams });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   POST /api/teams/:teamId/members
 * @desc    Add member to team
 */
router.post('/:teamId/members', auth, roleCheck(['approver', 'admin']), async (req, res) => {
    try {
        const { userId, role } = req.body;
        const team = await teamManagementService.addMember(req.params.teamId, userId, role);
        res.json({ success: true, data: team });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
