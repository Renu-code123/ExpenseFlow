const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Expense = require('../models/Expense');

/**
 * @route   POST /api/sync/delta
 * @desc    Sync offline changes with server
 * @access  Private
 */
router.post('/delta', auth, async (req, res) => {
  const { changes } = req.body; // Array of { id, version, data, action: 'create'|'update'|'delete' }
  const userId = req.user._id;
  const results = {
    success: [],
    conflicts: [],
    errors: []
  };

  if (!Array.isArray(changes)) {
    return res.status(400).json({ error: 'Invalid changes format' });
  }

  for (const change of changes) {
    try {
      const { id, version, data, action, localId } = change;

      if (action === 'create') {
        const newExpense = new Expense({
          ...data,
          user: userId,
          version: 1,
          lastSyncedAt: Date.now()
        });
        await newExpense.save();
        results.success.push({ localId, serverId: newExpense._id, version: newExpense.version });
        continue;
      }

      const existing = await Expense.findOne({ _id: id, user: userId });

      if (!existing) {
        results.errors.push({ id, message: 'Expense not found' });
        continue;
      }

      if (action === 'delete') {
        await existing.remove();
        results.success.push({ id, action: 'delete' });
        continue;
      }

      // Conflict Detection
      if (existing.version > version) {
        // Server has a newer version
        results.conflicts.push({
          id,
          serverVersion: existing.version,
          serverData: existing,
          message: 'Conflict detected: Server has a newer version'
        });
        continue;
      }

      // Update existing
      Object.assign(existing, data);
      existing.version = version + 1; // Increment version
      existing.lastSyncedAt = Date.now();
      await existing.save();

      results.success.push({ id, version: existing.version });

    } catch (error) {
      console.error('[Sync] Error processing change:', error);
      results.errors.push({ id: change.id, message: error.message });
    }
  }

  res.json(results);
});

/**
 * @route   GET /api/sync/pull
 * @desc    Pull changes from server since last sync
 * @access  Private
 */
router.get('/pull', auth, async (req, res) => {
  const { lastSyncTime } = req.query;
  const userId = req.user._id;

  try {
    const query = { user: userId };
    if (lastSyncTime) {
      query.lastSyncedAt = { $gt: new Date(lastSyncTime) };
    }

    const changes = await Expense.find(query);
    res.json({
      success: true,
      changes,
      serverTime: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to pull changes' });
  }
});

module.exports = router;