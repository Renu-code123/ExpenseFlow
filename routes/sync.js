const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const syncManager = require('../services/syncManager');

/**
 * @route   GET /api/sync/delta
 * @desc    Fetch differential updates since a specific version
 */
router.get('/delta', auth, async (req, res) => {
  try {
    const lastVersion = parseInt(req.query.v) || 0;
    const changes = await syncManager.getDifferentialUpdates(req.user._id, lastVersion);

    const latestVersion = changes.length > 0 ? changes[changes.length - 1].version : lastVersion;

    res.json({
      success: true,
      v: latestVersion,
      count: changes.length,
      changes
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/sync/push
 * @desc    Push local changes from a client with conflict resolution
 */
router.post('/push', auth, async (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'] || 'web-default';
    const { entityType, data } = req.body;

    if (!entityType || !data) {
      return res.status(400).json({ success: false, error: 'Missing sync payload' });
    }

    const result = await syncManager.applyIncomingUpdate(req.user._id, deviceId, entityType, data);

    res.json({
      success: true,
      action: result.action,
      entity: result.entity,
      logs: result.logs
    });
  } catch (error) {
    console.error('[SyncRoute] Push failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/sync/delete
 * @desc    Propagate a hard/soft delete across devices
 */
router.post('/delete', auth, async (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'] || 'web-default';
    const { entityType, entityId } = req.body;

    await syncManager.softDelete(req.user._id, deviceId, entityType, entityId);

    res.json({ success: true, message: 'Delete captured and synced' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;