const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const groupService = require('../services/groupService');
const { GroupSchemas, validateRequest } = require('../middleware/inputValidator');

/**
 * @route   POST /api/groups
 * @desc    Create a new group
 * @access  Private
 */
router.post('/', auth, validateRequest(GroupSchemas.create), async (req, res) => {
  try {
    const group = await groupService.createGroup(req.user._id, req.body);

    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      data: group
    });
  } catch (error) {
    console.error('[Groups Routes] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/groups
 * @desc    Get user's groups
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const groups = await groupService.getUserGroups(req.user._id);

    res.json({
      success: true,
      count: groups.length,
      data: groups
    });
  } catch (error) {
    console.error('[Groups Routes] Get all error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/groups/:id
 * @desc    Get group by ID
 * @access  Private
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const group = await groupService.getGroupById(req.params.id, req.user._id);

    res.json({
      success: true,
      data: group
    });
  } catch (error) {
    console.error('[Groups Routes] Get by ID error:', error);
    if (error.message === 'Group not found' || error.message === 'Access denied') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/groups/:id/members
 * @desc    Add member to group
 * @access  Private
 */
router.post('/:id/members', auth, validateRequest(GroupSchemas.addMember), async (req, res) => {
  try {
    const { email, role } = req.body;
    const memberData = { email, role: role || 'member' };
    const group = await groupService.addMember(req.params.id, req.user._id, memberData);

    res.json({
      success: true,
      message: 'Member added successfully',
      data: group
    });
  } catch (error) {
    console.error('[Groups Routes] Add member error:', error);
    if (error.message.includes('not found') || error.message === 'Access denied') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   DELETE /api/groups/:id/members/:memberId
 * @desc    Remove member from group
 * @access  Private
 */
router.delete('/:id/members/:memberId', auth, async (req, res) => {
  try {
    const group = await groupService.removeMember(req.params.id, req.user._id, req.params.memberId);

    res.json({
      success: true,
      message: 'Member removed successfully',
      data: group
    });
  } catch (error) {
    console.error('[Groups Routes] Remove member error:', error);
    if (error.message.includes('not found') || error.message === 'Access denied') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/groups/:id/expenses
 * @desc    Add expense to group
 * @access  Private
 */
router.post('/:id/expenses', auth, async (req, res) => {
  try {
    const { expenseId } = req.body;

    if (!expenseId) {
      return res.status(400).json({ error: 'Expense ID is required' });
    }

    const group = await groupService.addExpenseToGroup(req.params.id, req.user._id, expenseId);

    res.json({
      success: true,
      message: 'Expense added to group successfully',
      data: group
    });
  } catch (error) {
    console.error('[Groups Routes] Add expense error:', error);
    if (error.message.includes('not found') || error.message === 'Access denied') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   PUT /api/groups/:id/settings
 * @desc    Update group settings
 * @access  Private
 */
router.put('/:id/settings', auth, async (req, res) => {
  try {
    const { error, value } = updateSettingsSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const group = await groupService.updateGroupSettings(req.params.id, req.user._id, value);

    res.json({
      success: true,
      message: 'Group settings updated successfully',
      data: group
    });
  } catch (error) {
    console.error('[Groups Routes] Update settings error:', error);
    if (error.message.includes('not found') || error.message === 'Access denied') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   DELETE /api/groups/:id
 * @desc    Delete group
 * @access  Private
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await groupService.deleteGroup(req.params.id, req.user._id);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[Groups Routes] Delete error:', error);
    if (error.message.includes('not found') || error.message === 'Access denied') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/groups/:id/statistics
 * @desc    Get group statistics
 * @access  Private
 */
router.get('/:id/statistics', auth, async (req, res) => {
  try {
    const statistics = await groupService.getGroupStatistics(req.params.id, req.user._id);

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('[Groups Routes] Statistics error:', error);
    if (error.message.includes('not found') || error.message === 'Access denied') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
