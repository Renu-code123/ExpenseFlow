const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const AuditLog = require('../models/AuditLog');
const auditProcessor = require('../services/auditProcessor');
const ResponseFactory = require('../utils/ResponseFactory');

/**
 * Forensic Audit API
 * Issue #731: Endpoints for exploring system mutations and performing "Time Travel" lookups.
 */

/**
 * @route   GET /api/audit/logs
 * @desc    Search audit logs with filters
 */
router.get('/logs', auth, async (req, res) => {
  try {
    const { entityId, entityModel, action, userId, startDate, endDate } = req.query;

    const query = {};
    if (entityId) query.entityId = entityId;
    if (entityModel) query.entityModel = entityModel;
    if (action) query.action = action;
    if (userId) query.performedBy = userId;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(100)
      .populate('performedBy', 'name email');

    return ResponseFactory.success(res, logs);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @route   GET /api/audit/time-travel/:entityId
 * @desc    Reconstruct entity state at a specific point in time
 */
router.get('/time-travel/:entityId', auth, async (req, res) => {
  try {
    const { entityId } = req.params;
    const { at } = req.query;

    if (!at) {
      return res.status(400).json({ success: false, error: 'Target timestamp (?at=) is required.' });
    }

    const reconstructedState = await auditProcessor.reconstructEntity(entityId, new Date(at));

    if (!reconstructedState) {
      return res.status(404).json({ success: false, error: 'No history found for this entity at the given time.' });
    }

    return ResponseFactory.success(res, reconstructedState);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @route   GET /api/audit/lineage/:transactionId
 * @desc    Visualize "Money Flow Lineage" for regulatory inspection
 * Issue #866: Provenance tracing from fund source to final expense category.
 */
router.get('/lineage/:transactionId', auth, async (req, res) => {
  try {
    const FinancialEvent = require('../models/FinancialEvent');
    const MoneyLineage = require('../models/MoneyLineage');

    // Find the event that recorded the lineage
    const event = await FinancialEvent.findOne({
      entityId: req.params.transactionId,
      eventType: 'FUNDS_RESERVED'
    });

    if (!event || !event.payload?.fragments) {
      return res.status(404).json({ success: false, error: 'No lineage metadata found for this transaction.' });
    }

    const lineageTree = {
      transactionId: req.params.transactionId,
      provenanceHash: event.payload.lineageProvenanceHash,
      sources: event.payload.fragments.map(f => ({
        dna: f.sourceDna,
        amount: f.amountContributed,
        originalHash: f.provenanceHash
      })),
      timestamp: event.timestamp
    };

    return ResponseFactory.success(res, lineageTree);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
