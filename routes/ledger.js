const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ledgerService = require('../services/ledgerService');
const FinancialEvent = require('../models/FinancialEvent');
const ResponseFactory = require('../utils/ResponseFactory');

/**
 * Immutable Ledger API
 * Issue #738: Endpoints to view transaction history and audit event chains.
 */

/**
 * @route   GET /api/ledger/:id
 * @desc    Get complete event history for an entity
 */
router.get('/:id', auth, async (req, res) => {
    try {
        const events = await FinancialEvent.find({ entityId: req.params.id })
            .sort({ sequence: 1 })
            .populate('performedBy', 'name email');

        const audit = await ledgerService.auditChain(req.params.id);

        return ResponseFactory.success(res, {
            entityId: req.params.id,
            integrity: audit,
            eventCount: events.length,
            events
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   POST /api/ledger/:id/reconstruct
 * @desc    Reconstruct current state by replaying all events
 */
router.post('/:id/reconstruct', auth, async (req, res) => {
    try {
        const state = await ledgerService.reconstructState(req.params.id);
        return ResponseFactory.success(res, state);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
