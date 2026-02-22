const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const syncInterceptor = require('../middleware/syncInterceptor');
const transactionService = require('../services/transactionService');
const consensusEngine = require('../services/consensusEngine');
const SyncConflict = require('../models/SyncConflict');
const ResponseFactory = require('../utils/ResponseFactory');

/**
 * Distributed Sync API (Vector Clock Enhanced)
 * Issue #730: Handles high-integrity multi-device data synchronization.
 */

/**
 * @route   POST /api/sync/transactions/:id
 * @desc    Sync a specific transaction with consensus reconciliation
 */
router.post('/transactions/:id', auth, syncInterceptor, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await transactionService.syncUpdate(id, req.body, req.syncContext);

    if (result.status === 'synced') {
      return ResponseFactory.success(res, result.transaction, 200, 'State synchronized');
    }

    if (result.status === 'conflict') {
      return ResponseFactory.success(res, null, 409, 'Conflict detected. Captured in graveyard.');
    }

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @route   GET /api/sync/conflicts
 * @desc    List all captured conflicts for the user
 */
router.get('/conflicts', auth, async (req, res) => {
  const conflicts = await SyncConflict.find({
    userId: req.user._id,
    status: 'open'
  }).sort({ createdAt: -1 });

  res.json({ success: true, count: conflicts.length, conflicts });
});

/**
 * @route   POST /api/sync/conflicts/:id/resolve
 * @desc    Resolve a conflict using a specific strategy
 */
router.post('/conflicts/:id/resolve', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { strategy, resolvedData } = req.body;

    const result = await consensusEngine.resolveConflict(id, strategy, resolvedData);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;