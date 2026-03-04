const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const reconciliationEngine = require('../services/reconciliationEngine');
const settlementService = require('../services/settlementService');

// Create Intercompany Transaction
router.post('/transaction', auth, async (req, res) => {
    try {
        const IntercompanyTransaction = require('../models/IntercompanyTransaction');
        const txn = new IntercompanyTransaction({
            ...req.body,
            userId: req.user._id
        });
        await txn.save();
        res.status(201).json(txn);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Run Reconciliation
router.post('/run', auth, async (req, res) => {
    try {
        const { entityA, entityB, period } = req.body;
        const report = await reconciliationEngine.runReconciliation(req.user._id, entityA, entityB, period);
        res.json(report);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get Net Balance between two entities
router.get('/balance', auth, async (req, res) => {
    try {
        const { entityA, entityB } = req.query;
        const balance = await reconciliationEngine.getNetBalance(req.user._id, entityA, entityB);
        res.json(balance);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get Settlement Advice
router.get('/settlement-advice', auth, async (req, res) => {
    try {
        const { entityA, entityB } = req.query;
        const advice = await settlementService.generateSettlementAdvice(req.user._id, entityA, entityB);
        res.json(advice);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Process Settlement
router.post('/settle', auth, async (req, res) => {
    try {
        const { txnIds } = req.body;
        const result = await settlementService.processSettlement(req.user._id, txnIds);
        res.json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// History
router.get('/history', auth, async (req, res) => {
    try {
        const history = await settlementService.getIntercompanyHistory(req.user._id);
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
