const express = require('express');
const Workspace = require('../models/Workspace');
const WorkspaceInvite = require('../models/WorkspaceInvite');
const User = require('../models/User');
const collaborationService = require('../services/collaborationService');
const workspaceService = require('../services/workspaceService');
const consolidationService = require('../services/consolidationService');
const inviteService = require('../services/inviteService');
const auth = require('../middleware/auth');
const {
  checkPermission,
  requireManager,
  requireOwner,
  workspaceAccess,
  canManageRole,
  ROLES
} = require('../middleware/rbac');
const router = express.Router();

// ============================================
// Workspace CRUD Operations
// ============================================

/**
 * Create workspace
 * POST /api/workspaces
 */
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, settings } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Workspace name is required' });
    }

    const workspace = new Workspace({
      name: name.trim(),
      description: description?.trim(),
      owner: req.user._id,
      members: [{
        user: req.user._id,
        role: 'owner',
        joinedAt: new Date(),
        status: 'active'
      }],
      settings: settings || {}
    });

    workspace.logActivity('workspace:created', req.user._id);
    await workspace.save();

    // Populate for response
    await workspace.populate('owner', 'name email avatar');
    await workspace.populate('members.user', 'name email avatar');

    res.status(201).json({
      success: true,
      data: workspace,
      message: 'Workspace created successfully'
    });
  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create sub-workspace (hierarchical #629)
 * POST /api/workspaces/:parentId/sub-workspace
 */
router.post('/:parentId/sub-workspace', auth, async (req, res) => {
  try {
    const workspace = await workspaceService.createSubWorkspace(
      req.user._id,
      req.params.parentId,
      req.body
    );
    res.status(201).json({ success: true, data: workspace });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get consolidated financial report
 * GET /api/workspaces/:id/consolidated-report
 */
router.get('/:id/consolidated-report', auth, workspaceAccess('reports:view'), async (req, res) => {
  try {
    const { startDate, endDate, baseCurrency } = req.query;
    const report = await consolidationService.getConsolidatedReport(req.params.id, {
      startDate: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: endDate ? new Date(endDate) : new Date(),
      baseCurrency
    });
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get user's workspaces
 * GET /api/workspaces
 */
router.get('/', auth, async (req, res) => {
  try {
    const workspaces = await Workspace.getUserWorkspaces(req.user._id);

    // Add user's role to each workspace
    const workspacesWithRole = workspaces.map(ws => {
      const wsObj = ws.toObject();
      wsObj.userRole = ws.getUserRole(req.user._id);
      wsObj.isOwner = ws.owner._id.toString() === req.user._id.toString();
      return wsObj;
    });

    res.json({
      success: true,
      data: workspacesWithRole,
      count: workspacesWithRole.length
    });
  } catch (error) {
    console.error('Get workspaces error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get single workspace details
 * GET /api/workspaces/:id
 */
router.get('/:id', auth, workspaceAccess(), async (req, res) => {
  try {
    const workspace = req.workspace;

    res.json({
      success: true,
      data: {
        ...workspace.toObject(),
        userRole: req.userRole,
        isOwner: req.isOwner
      }
    });
  } catch (error) {
    console.error('Get workspace error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update workspace settings
 * PUT /api/workspaces/:id
 */
router.put('/:id', auth, checkPermission('workspace:settings'), async (req, res) => {
  try {
    const { name, description, settings, inviteSettings } = req.body;
    const workspace = req.workspace;

    if (name) workspace.name = name.trim();
    if (description !== undefined) workspace.description = description?.trim();
    if (settings) workspace.settings = { ...workspace.settings, ...settings };
    if (inviteSettings) workspace.inviteSettings = { ...workspace.inviteSettings, ...inviteSettings };

    workspace.logActivity('workspace:settings_changed', req.user._id, {
      changes: Object.keys(req.body)
    });

    await workspace.save();
    await workspace.populate('owner', 'name email avatar');
    await workspace.populate('members.user', 'name email avatar');

    res.json({
      success: true,
      data: workspace,
      message: 'Workspace updated successfully'
    });
  } catch (error) {
    console.error('Update workspace error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete workspace (owner only)
 * DELETE /api/workspaces/:id
 */
router.delete('/:id', auth, requireOwner(), async (req, res) => {
  try {
    const workspace = req.workspace;

    // Soft delete - archive instead of hard delete
    workspace.status = 'archived';
    workspace.logActivity('workspace:deleted', req.user._id);
    await workspace.save();

    // Also cancel all pending invites
    await WorkspaceInvite.updateMany(
      { workspace: workspace._id, status: 'pending' },
      { status: 'revoked', revokedAt: new Date(), revokedBy: req.user._id }
    );

    res.json({
      success: true,
      message: 'Workspace deleted successfully'
    });
  } catch (error) {
    console.error('Delete workspace error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Member Management
// ============================================

/**
 * Get workspace members
 * GET /api/workspaces/:id/members
 */
router.get('/:id/members', auth, workspaceAccess(), async (req, res) => {
  try {
    const workspace = req.workspace;

    const members = workspace.members.map(m => ({
      _id: m._id,
      user: m.user,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
      lastActiveAt: m.lastActiveAt,
      canManage: workspace.canManageRole(req.user._id, m.role)
    }));

    res.json({
      success: true,
      data: members,
      count: members.length,
      userRole: req.userRole
    });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update member role
 * PUT /api/workspaces/:id/members/:userId
 */
router.put('/:id/members/:userId', auth, checkPermission('members:promote'), async (req, res) => {
  try {
    const { role } = req.body;
    const { userId } = req.params;
    const workspace = req.workspace;

    // Validate role
    if (!Object.values(ROLES).includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Cannot change owner role
    if (workspace.owner.toString() === userId) {
      return res.status(400).json({ error: 'Cannot change owner role' });
    }

    // Cannot promote to owner
    if (role === 'owner') {
      return res.status(400).json({ error: 'Cannot promote to owner. Use transfer ownership instead.' });
    }

    // Check if user can manage the target role
    if (!workspace.canManageRole(req.user._id, role)) {
      return res.status(403).json({ error: 'You cannot assign this role' });
    }

    // Find and update member
    const member = workspace.members.find(m => m.user.toString() === userId);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const oldRole = member.role;
    member.role = role;

    workspace.logActivity('member:role_changed', req.user._id, {
      targetUser: userId,
      oldRole,
      newRole: role
    });

    await workspace.save();
    await workspace.populate('members.user', 'name email avatar');

    res.json({
      success: true,
      data: member,
      message: `Member role updated to ${role}`
    });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Remove member from workspace
 * DELETE /api/workspaces/:id/members/:userId
 */
router.delete('/:id/members/:userId', auth, checkPermission('members:remove'), async (req, res) => {
  try {
    const { userId } = req.params;
    const workspace = req.workspace;

    // Cannot remove owner
    if (workspace.owner.toString() === userId) {
      return res.status(400).json({ error: 'Cannot remove workspace owner' });
    }

    // Find member
    const memberIndex = workspace.members.findIndex(m => m.user.toString() === userId);
    if (memberIndex === -1) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const removedMember = workspace.members[memberIndex];

    // Check if user can manage this member's role
    if (!workspace.canManageRole(req.user._id, removedMember.role)) {
      return res.status(403).json({ error: 'You cannot remove members with this role' });
    }

    // Remove member
    workspace.members.splice(memberIndex, 1);

    workspace.logActivity('member:removed', req.user._id, {
      targetUser: userId,
      removedRole: removedMember.role
    });

    await workspace.save();

    res.json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Leave workspace (self)
 * POST /api/workspaces/:id/leave
 */
router.post('/:id/leave', auth, workspaceAccess(), async (req, res) => {
  try {
    const workspace = req.workspace;
    const userId = req.user._id.toString();

    // Owner cannot leave - must transfer ownership first
    if (workspace.owner.toString() === userId) {
      return res.status(400).json({
        error: 'Owner cannot leave workspace. Transfer ownership first.'
      });
    }

    // Remove self from members
    const memberIndex = workspace.members.findIndex(m => m.user.toString() === userId);
    if (memberIndex === -1) {
      return res.status(404).json({ error: 'You are not a member of this workspace' });
    }

    workspace.members.splice(memberIndex, 1);

    workspace.logActivity('member:removed', req.user._id, {
      targetUser: userId,
      selfRemoval: true
    });

    await workspace.save();

    res.json({
      success: true,
      message: 'You have left the workspace'
    });
  } catch (error) {
    console.error('Leave workspace error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Transfer ownership
 * POST /api/workspaces/:id/transfer
 */
router.post('/:id/transfer', auth, requireOwner(), async (req, res) => {
  try {
    const { newOwnerId } = req.body;
    const workspace = req.workspace;

    if (!newOwnerId) {
      return res.status(400).json({ error: 'New owner ID is required' });
    }

    // Verify new owner is a member
    const newOwnerMember = workspace.members.find(
      m => m.user.toString() === newOwnerId
    );
    if (!newOwnerMember) {
      return res.status(400).json({ error: 'New owner must be an existing member' });
    }

    // Update ownership
    const oldOwnerId = workspace.owner;
    workspace.owner = newOwnerId;

    // Update roles
    newOwnerMember.role = 'owner';

    // Find old owner in members and demote to manager
    const oldOwnerMember = workspace.members.find(
      m => m.user.toString() === oldOwnerId.toString()
    );
    if (oldOwnerMember) {
      oldOwnerMember.role = 'manager';
    }

    workspace.logActivity('workspace:transfer', req.user._id, {
      oldOwner: oldOwnerId,
      newOwner: newOwnerId
    });

    await workspace.save();
    await workspace.populate('owner', 'name email avatar');
    await workspace.populate('members.user', 'name email avatar');

    res.json({
      success: true,
      data: workspace,
      message: 'Ownership transferred successfully'
    });
  } catch (error) {
    console.error('Transfer ownership error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Invite Management
// ============================================

/**
 * Send invite
 * POST /api/workspaces/:id/invite
 */
router.post('/:id/invite', auth, checkPermission('members:invite'), async (req, res) => {
  try {
    const { email, role = 'viewer', message, expiryDays } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Validate role - cannot invite as owner
    if (role === 'owner') {
      return res.status(400).json({ error: 'Cannot invite as owner' });
    }

    // Check if user can invite with this role
    if (!req.workspace.canManageRole(req.user._id, role)) {
      return res.status(403).json({ error: 'You cannot invite members with this role' });
    }

    const result = await inviteService.createInvite({
      workspaceId: req.params.id,
      email,
      role,
      invitedById: req.user._id,
      message,
      expiryDays
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'Invitation sent successfully'
    });
  } catch (error) {
    console.error('Send invite error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get pending invites for workspace
 * GET /api/workspaces/:id/invites
 */
router.get('/:id/invites', auth, checkPermission('members:invite'), async (req, res) => {
  try {
    const invites = await inviteService.getWorkspaceInvites(req.params.id);

    res.json({
      success: true,
      data: invites,
      count: invites.length
    });
  } catch (error) {
    console.error('Get invites error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Resend invite
 * POST /api/workspaces/:id/invites/:inviteId/resend
 */
router.post('/:id/invites/:inviteId/resend', auth, checkPermission('members:invite'), async (req, res) => {
  try {
    const result = await inviteService.resendInvite(
      req.params.inviteId,
      req.user._id
    );

    res.json({
      success: result.success,
      message: result.success ? 'Invitation resent' : 'Failed to resend invitation'
    });
  } catch (error) {
    console.error('Resend invite error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Revoke invite
 * DELETE /api/workspaces/:id/invites/:inviteId
 */
router.delete('/:id/invites/:inviteId', auth, checkPermission('members:invite'), async (req, res) => {
  try {
    await inviteService.revokeInvite(
      req.params.inviteId,
      req.user._id,
      req.params.id
    );

    res.json({
      success: true,
      message: 'Invitation revoked'
    });
  } catch (error) {
    console.error('Revoke invite error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// Public Invite Endpoints (no auth required for preview)
// ============================================

/**
 * Get invite details (for preview page)
 * GET /api/workspaces/invite/:token
 */
router.get('/invite/:token', async (req, res) => {
  try {
    const details = await inviteService.getInviteDetails(req.params.token);

    if (!details) {
      return res.status(404).json({
        error: 'Invalid or expired invitation',
        code: 'INVITE_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: details
    });
  } catch (error) {
    console.error('Get invite details error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Accept invite (join workspace)
 * POST /api/workspaces/join
 */
router.post('/join', auth, async (req, res) => {
  try {
    const { token, linkToken } = req.body;

    let result;
    if (token) {
      result = await inviteService.acceptInvite(token, req.user._id);
    } else if (linkToken) {
      result = await inviteService.joinViaLink(linkToken, req.user._id);
    } else {
      return res.status(400).json({ error: 'Invite token or link token is required' });
    }

    res.json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error) {
    console.error('Join workspace error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Decline invite
 * POST /api/workspaces/decline
 */
router.post('/decline', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Invite token is required' });
    }

    const result = await inviteService.declineInvite(token);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Decline invite error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get user's pending invites
 * GET /api/workspaces/my-invites
 */
router.get('/my-invites', auth, async (req, res) => {
  try {
    const invites = await inviteService.getUserInvites(req.user.email);

    res.json({
      success: true,
      data: invites,
      count: invites.length
    });
  } catch (error) {
    console.error('Get my invites error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Shareable Link Management
// ============================================

/**
 * Generate shareable invite link
 * POST /api/workspaces/:id/invite-link
 */
router.post('/:id/invite-link', auth, requireManager(), async (req, res) => {
  try {
    const { role = 'viewer', expiryDays = 30 } = req.body;
    const workspace = req.workspace;

    // Enable invite links if not already
    workspace.inviteSettings.inviteLinkEnabled = true;
    await workspace.save();

    const result = await inviteService.generateShareableLink(
      req.params.id,
      role,
      expiryDays
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Generate invite link error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Disable shareable invite link
 * DELETE /api/workspaces/:id/invite-link
 */
router.delete('/:id/invite-link', auth, requireManager(), async (req, res) => {
  try {
    const workspace = req.workspace;

    workspace.inviteSettings.inviteLinkEnabled = false;
    workspace.inviteSettings.inviteLinkToken = null;
    workspace.inviteSettings.inviteLinkExpiry = null;
    await workspace.save();

    res.json({
      success: true,
      message: 'Invite link disabled'
    });
  } catch (error) {
    console.error('Disable invite link error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Activity Log
// ============================================

/**
 * Get workspace activity log
 * GET /api/workspaces/:id/activity
 */
router.get('/:id/activity', auth, checkPermission('audit:view'), async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const workspace = req.workspace;

    const activities = workspace.activityLog
      .slice(-limit - offset, -offset || undefined)
      .reverse();

    // Populate user details
    await Workspace.populate(activities, [
      { path: 'performedBy', select: 'name email avatar' },
      { path: 'targetUser', select: 'name email avatar' }
    ]);

    res.json({
      success: true,
      data: activities,
      total: workspace.activityLog.length
    });
  } catch (error) {
    console.error('Get activity log error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Governance & Policy Management
// ============================================

/**
 * Create spending policy
 * POST /api/workspaces/:workspaceId/policies
 */
router.post('/:workspaceId/policies', auth, requireManager, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const workspace = await Workspace.findById(workspaceId);

    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const { name, description, conditions, approvalChain, actions, riskScore } = req.body;

    if (!name) return res.status(400).json({ error: 'Policy name required' });

    const policy = await workspaceService.createPolicy(workspaceId, req.user._id, {
      name,
      description,
      conditions,
      approvalChain,
      actions,
      riskScore
    });

    workspace.logActivity('policy:created', req.user._id, { policyId: policy._id });
    await workspace.save();

    res.status(201).json({ success: true, data: policy });
  } catch (error) {
    console.error('Create policy error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get workspace policies
 * GET /api/workspaces/:workspaceId/policies
 */
router.get('/:workspaceId/policies', auth, workspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { resourceType, active } = req.query;

    const policies = await workspaceService.getPolicies(workspaceId, {
      resourceType,
      active: active === 'true'
    });

    res.json({ success: true, data: policies });
  } catch (error) {
    console.error('Get policies error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update policy
 * PUT /api/workspaces/:workspaceId/policies/:policyId
 */
router.put('/:workspaceId/policies/:policyId', auth, requireManager, async (req, res) => {
  try {
    const { workspaceId, policyId } = req.params;

    const policy = await workspaceService.updatePolicy(
      workspaceId,
      policyId,
      req.user._id,
      req.body
    );

    res.json({ success: true, data: policy });
  } catch (error) {
    console.error('Update policy error:', error);
    res.status(error.message.includes('not found') ? 404 : 500)
      .json({ error: error.message });
  }
});

/**
 * Delete policy
 * DELETE /api/workspaces/:workspaceId/policies/:policyId
 */
router.delete('/:workspaceId/policies/:policyId', auth, requireManager, async (req, res) => {
  try {
    const { workspaceId, policyId } = req.params;

    await workspaceService.deletePolicy(workspaceId, policyId, req.user._id);

    res.json({ success: true, message: 'Policy deleted' });
  } catch (error) {
    console.error('Delete policy error:', error);
    res.status(error.message.includes('not found') ? 404 : 500)
      .json({ error: error.message });
  }
});

/**
 * Get workspace available balance
 * GET /api/workspaces/:workspaceId/balance
 */
router.get('/:workspaceId/balance', auth, workspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const balance = await workspaceService.calculateAvailableBalance(workspaceId);

    res.json({ success: true, data: balance });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get pending approvals
 * GET /api/workspaces/:workspaceId/approvals/pending
 */
router.get('/:workspaceId/approvals/pending', auth, workspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const pendingApprovals = await workspaceService.getPendingApprovals(workspaceId, req.user._id);

    res.json({ success: true, data: pendingApprovals });
  } catch (error) {
    console.error('Get pending approvals error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Approve expense
 * POST /api/workspaces/:workspaceId/expenses/:expenseId/approve
 */
router.post('/:workspaceId/expenses/:expenseId/approve', auth, async (req, res) => {
  try {
    const { workspaceId, expenseId } = req.params;
    const { notes } = req.body;

    const expense = await workspaceService.approveExpense(
      workspaceId,
      expenseId,
      req.user._id,
      notes
    );

    res.json({ success: true, data: expense });
  } catch (error) {
    console.error('Approve expense error:', error);
    res.status(error.message.includes('not found') ? 404 : 500)
      .json({ error: error.message });
  }
});

/**
 * Reject expense
 * POST /api/workspaces/:workspaceId/expenses/:expenseId/reject
 */
router.post('/:workspaceId/expenses/:expenseId/reject', auth, async (req, res) => {
  try {
    const { workspaceId, expenseId } = req.params;
    const { reason } = req.body;

    if (!reason) return res.status(400).json({ error: 'Rejection reason required' });

    const expense = await workspaceService.rejectExpense(
      workspaceId,
      expenseId,
      req.user._id,
      reason
    );

    res.json({ success: true, data: expense });
  } catch (error) {
    console.error('Reject expense error:', error);
    res.status(error.message.includes('not found') ? 404 : 500)
      .json({ error: error.message });
  }
});

module.exports = router;