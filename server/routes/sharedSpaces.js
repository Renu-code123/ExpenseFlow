const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const spaceAuth = require('../middleware/spaceAuth');
const { validateSharedSpace, validateMember, validateGoal, validateApproval } = require('../middleware/sharedSpaceValidator');

const sharedSpaceService = require('../services/sharedSpaceService');
const approvalService = require('../services/approvalService');
const SharedSpace = require('../models/SharedSpace');
const SharedGoal = require('../models/SharedGoal');
const SpaceActivity = require('../models/SpaceActivity');
const ApprovalRequest = require('../models/ApprovalRequest');

// ==================== SHARED SPACES ====================

// Create shared space
router.post('/', auth, validateSharedSpace, async (req, res) => {
    try {
        const space = await sharedSpaceService.createSpace(req.user.id, req.body);
        res.status(201).json({ success: true, data: space });
    } catch (error) {
        console.error('Error creating shared space:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Get user's shared spaces
router.get('/', auth, async (req, res) => {
    try {
        const spaces = await SharedSpace.getUserSpaces(req.user.id);
        res.json({ success: true, data: spaces });
    } catch (error) {
        console.error('Error fetching shared spaces:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single shared space
router.get('/:id', auth, spaceAuth('view_expenses'), async (req, res) => {
    try {
        const space = await SharedSpace.findById(req.params.id)
            .populate('owner', 'name email')
            .populate('members.user', 'name email');
        
        if (!space) {
            return res.status(404).json({ success: false, message: 'Shared space not found' });
        }
        
        res.json({ success: true, data: space });
    } catch (error) {
        console.error('Error fetching shared space:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update shared space
router.put('/:id', auth, spaceAuth('manage_members'), async (req, res) => {
    try {
        const space = await SharedSpace.findById(req.params.id);
        
        if (!space) {
            return res.status(404).json({ success: false, message: 'Shared space not found' });
        }
        
        const allowedUpdates = ['name', 'description', 'settings'];
        Object.keys(req.body).forEach(key => {
            if (allowedUpdates.includes(key)) {
                if (key === 'settings') {
                    space.settings = { ...space.settings, ...req.body.settings };
                } else {
                    space[key] = req.body[key];
                }
            }
        });
        
        await space.save();
        
        await SpaceActivity.logActivity({
            space: space._id,
            actor: req.user.id,
            action: 'settings_changed',
            target_type: 'space',
            target_id: space._id
        });
        
        res.json({ success: true, data: space });
    } catch (error) {
        console.error('Error updating shared space:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Archive shared space
router.delete('/:id', auth, async (req, res) => {
    try {
        const space = await SharedSpace.findById(req.params.id);
        
        if (!space) {
            return res.status(404).json({ success: false, message: 'Shared space not found' });
        }
        
        if (space.owner.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Only the owner can archive the space' });
        }
        
        space.isActive = false;
        await space.save();
        
        await SpaceActivity.logActivity({
            space: space._id,
            actor: req.user.id,
            action: 'space_archived',
            target_type: 'space',
            target_id: space._id
        });
        
        res.json({ success: true, message: 'Space archived successfully' });
    } catch (error) {
        console.error('Error archiving shared space:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== MEMBERS ====================

// Add member to space
router.post('/:id/members', auth, spaceAuth('manage_members'), validateMember, async (req, res) => {
    try {
        const { user_id, role } = req.body;
        const space = await sharedSpaceService.addMember(req.params.id, req.user.id, user_id, role);
        res.json({ success: true, data: space });
    } catch (error) {
        console.error('Error adding member:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Join space with invite code
router.post('/join', auth, async (req, res) => {
    try {
        const { invite_code } = req.body;
        
        if (!invite_code) {
            return res.status(400).json({ success: false, message: 'Invite code is required' });
        }
        
        const space = await sharedSpaceService.joinSpaceWithCode(req.user.id, invite_code);
        res.json({ success: true, data: space, message: 'Successfully joined the space' });
    } catch (error) {
        console.error('Error joining space:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Remove member from space
router.delete('/:id/members/:userId', auth, spaceAuth('manage_members'), async (req, res) => {
    try {
        const space = await sharedSpaceService.removeMember(req.params.id, req.user.id, req.params.userId);
        res.json({ success: true, data: space });
    } catch (error) {
        console.error('Error removing member:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Update member role/permissions
router.put('/:id/members/:userId', auth, spaceAuth('manage_members'), async (req, res) => {
    try {
        const { role, permissions } = req.body;
        const space = await sharedSpaceService.updateMemberRole(
            req.params.id,
            req.user.id,
            req.params.userId,
            role,
            permissions
        );
        res.json({ success: true, data: space });
    } catch (error) {
        console.error('Error updating member:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Regenerate invite code
router.post('/:id/invite-code/regenerate', auth, spaceAuth('manage_members'), async (req, res) => {
    try {
        const space = await SharedSpace.findById(req.params.id);
        
        if (!space) {
            return res.status(404).json({ success: false, message: 'Shared space not found' });
        }
        
        space.invite_code = space.generateInviteCode();
        await space.save();
        
        res.json({ success: true, data: { invite_code: space.invite_code } });
    } catch (error) {
        console.error('Error regenerating invite code:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== GOALS ====================

// Create shared goal
router.post('/:id/goals', auth, spaceAuth('manage_goals'), validateGoal, async (req, res) => {
    try {
        const goal = new SharedGoal({
            ...req.body,
            space: req.params.id,
            created_by: req.user.id
        });
        
        await goal.save();
        
        await SpaceActivity.logActivity({
            space: req.params.id,
            actor: req.user.id,
            action: 'goal_created',
            target_type: 'goal',
            target_id: goal._id,
            details: {
                description: goal.name,
                amount: goal.target_amount
            }
        });
        
        res.status(201).json({ success: true, data: goal });
    } catch (error) {
        console.error('Error creating goal:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Get space goals
router.get('/:id/goals', auth, spaceAuth('view_goals'), async (req, res) => {
    try {
        const { status } = req.query;
        const goals = await SharedGoal.getSpaceGoals(req.params.id, status);
        res.json({ success: true, data: goals });
    } catch (error) {
        console.error('Error fetching goals:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single goal
router.get('/:id/goals/:goalId', auth, spaceAuth('view_goals'), async (req, res) => {
    try {
        const goal = await SharedGoal.findOne({ 
            _id: req.params.goalId,
            space: req.params.id
        })
            .populate('contributors.user', 'name email')
            .populate('contributions.user', 'name')
            .populate('created_by', 'name');
        
        if (!goal) {
            return res.status(404).json({ success: false, message: 'Goal not found' });
        }
        
        res.json({ success: true, data: goal });
    } catch (error) {
        console.error('Error fetching goal:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add contribution to goal
router.post('/:id/goals/:goalId/contribute', auth, spaceAuth('add_expenses'), async (req, res) => {
    try {
        const { amount, note, transaction_id } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Valid amount is required' });
        }
        
        const goal = await SharedGoal.findOne({
            _id: req.params.goalId,
            space: req.params.id
        });
        
        if (!goal) {
            return res.status(404).json({ success: false, message: 'Goal not found' });
        }
        
        await goal.addContribution(req.user.id, amount, note, transaction_id);
        
        await SpaceActivity.logActivity({
            space: req.params.id,
            actor: req.user.id,
            action: 'contribution_made',
            target_type: 'goal',
            target_id: goal._id,
            details: {
                amount: amount,
                description: goal.name
            }
        });
        
        res.json({ success: true, data: goal });
    } catch (error) {
        console.error('Error adding contribution:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Update goal
router.put('/:id/goals/:goalId', auth, spaceAuth('manage_goals'), async (req, res) => {
    try {
        const goal = await SharedGoal.findOne({
            _id: req.params.goalId,
            space: req.params.id
        });
        
        if (!goal) {
            return res.status(404).json({ success: false, message: 'Goal not found' });
        }
        
        const allowedUpdates = ['name', 'description', 'target_amount', 'deadline', 'status', 'priority'];
        Object.keys(req.body).forEach(key => {
            if (allowedUpdates.includes(key)) {
                goal[key] = req.body[key];
            }
        });
        
        await goal.save();
        
        await SpaceActivity.logActivity({
            space: req.params.id,
            actor: req.user.id,
            action: 'goal_updated',
            target_type: 'goal',
            target_id: goal._id
        });
        
        res.json({ success: true, data: goal });
    } catch (error) {
        console.error('Error updating goal:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// ==================== APPROVALS ====================

// Create approval request
router.post('/:id/approvals', auth, spaceAuth('add_expenses'), validateApproval, async (req, res) => {
    try {
        const { expense_data, priority } = req.body;
        const request = await approvalService.createApprovalRequest(
            req.params.id,
            req.user.id,
            expense_data,
            priority
        );
        res.status(201).json({ success: true, data: request });
    } catch (error) {
        console.error('Error creating approval request:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Get pending approval requests
router.get('/:id/approvals', auth, spaceAuth('view_expenses'), async (req, res) => {
    try {
        const requests = await approvalService.getPendingRequests(req.params.id, req.user.id);
        res.json({ success: true, data: requests });
    } catch (error) {
        console.error('Error fetching approval requests:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Process approval (approve/reject)
router.post('/:id/approvals/:requestId/:action', auth, spaceAuth('approve_expenses'), async (req, res) => {
    try {
        const { action } = req.params;
        const { comment } = req.body;
        
        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }
        
        const decision = action === 'approve' ? 'approved' : 'rejected';
        const request = await approvalService.processApproval(
            req.params.requestId,
            req.user.id,
            decision,
            comment
        );
        
        res.json({ success: true, data: request });
    } catch (error) {
        console.error('Error processing approval:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Cancel approval request
router.delete('/:id/approvals/:requestId', auth, async (req, res) => {
    try {
        const request = await approvalService.cancelRequest(req.params.requestId, req.user.id);
        res.json({ success: true, data: request });
    } catch (error) {
        console.error('Error cancelling approval request:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// ==================== REPORTS & ACTIVITY ====================

// Get space report
router.get('/:id/report', auth, spaceAuth('view_reports'), async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        const startDate = start_date ? new Date(start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = end_date ? new Date(end_date) : new Date();
        
        const report = await sharedSpaceService.getSpaceReport(
            req.params.id,
            req.user.id,
            startDate,
            endDate
        );
        
        res.json({ success: true, data: report });
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get member contributions
router.get('/:id/contributions/:userId?', auth, spaceAuth('view_reports'), async (req, res) => {
    try {
        const memberId = req.params.userId || req.user.id;
        const contributions = await sharedSpaceService.getMemberContributions(
            req.params.id,
            req.user.id,
            memberId
        );
        res.json({ success: true, data: contributions });
    } catch (error) {
        console.error('Error fetching contributions:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get space activity log
router.get('/:id/activity', auth, spaceAuth('view_expenses'), async (req, res) => {
    try {
        const { limit = 50, skip = 0 } = req.query;
        const activity = await SpaceActivity.getSpaceActivity(
            req.params.id,
            parseInt(limit),
            parseInt(skip)
        );
        res.json({ success: true, data: activity });
    } catch (error) {
        console.error('Error fetching activity:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
