const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const treasuryService = require('../services/treasuryService');
const runwayForecaster = require('../services/runwayForecaster');
const TreasuryVault = require('../models/TreasuryVault');
const LiquidityThreshold = require('../models/LiquidityThreshold');
const ExchangeHedge = require('../models/ExchangeHedge');

/**
 * Get Treasury Dashboard
 */
router.get('/dashboard', auth, async (req, res) => {
    try {
        const dashboard = await treasuryService.getTreasuryDashboard(req.user._id);
        const portfolio = await treasuryService.getPortfolioMetrics(req.user._id);

        res.json({
            success: true,
            data: {
                ...dashboard,
                portfolio
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Cash Runway Forecast
 */
router.get('/forecast', auth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 180;
        const forecast = await runwayForecaster.generateForecast(req.user._id, days);

        res.json({ success: true, data: forecast });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Liquidity Projection
 */
router.get('/projection', auth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 90;
        const projection = await treasuryService.getLiquidityProjection(req.user._id, days);

        res.json({ success: true, data: projection });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Create Treasury Vault
 */
router.post('/vaults', auth, async (req, res) => {
    try {
        const vault = new TreasuryVault({
            ...req.body,
            userId: req.user._id
        });
        await vault.save();

        res.json({ success: true, data: vault });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Get All Vaults
 */
router.get('/vaults', auth, async (req, res) => {
    try {
        const vaults = await TreasuryVault.find({ userId: req.user._id });
        res.json({ success: true, data: vaults });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Update Vault Balance
 */
router.patch('/vaults/:id/balance', auth, async (req, res) => {
    try {
        const { amount, operation } = req.body; // operation: 'add' or 'subtract'
        const vault = await TreasuryVault.findOne({ _id: req.params.id, userId: req.user._id });

        if (!vault) {
            return res.status(404).json({ success: false, error: 'Vault not found' });
        }

        if (operation === 'add') {
            vault.balance += amount;
        } else if (operation === 'subtract') {
            vault.balance -= amount;
        }

        await vault.save();
        res.json({ success: true, data: vault });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Transfer Between Vaults
 */
router.post('/vaults/transfer', auth, async (req, res) => {
    try {
        const { fromVaultId, toVaultId, amount } = req.body;
        const result = await treasuryService.transferBetweenVaults(
            fromVaultId,
            toVaultId,
            amount,
            req.user._id
        );

        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Auto-Rebalance Vaults
 */
router.post('/vaults/rebalance', auth, async (req, res) => {
    try {
        const actions = await treasuryService.rebalanceVaults(req.user._id);
        res.json({ success: true, data: actions });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Create Liquidity Threshold
 */
router.post('/thresholds', auth, async (req, res) => {
    try {
        const threshold = new LiquidityThreshold({
            ...req.body,
            userId: req.user._id
        });
        await threshold.save();

        res.json({ success: true, data: threshold });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Get All Thresholds
 */
router.get('/thresholds', auth, async (req, res) => {
    try {
        const thresholds = await LiquidityThreshold.find({ userId: req.user._id });
        res.json({ success: true, data: thresholds });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Monitor Thresholds (Manual Trigger)
 */
router.post('/thresholds/monitor', auth, async (req, res) => {
    try {
        const alerts = await treasuryService.monitorThresholds(req.user._id);
        res.json({ success: true, data: alerts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Create FX Hedge
 */
router.post('/hedges', auth, async (req, res) => {
    try {
        const hedgeId = `HG-${Date.now()}-${req.user._id.toString().substring(0, 4)}`.toUpperCase();
        const hedge = new ExchangeHedge({
            ...req.body,
            hedgeId,
            userId: req.user._id
        });
        await hedge.save();

        res.json({ success: true, data: hedge });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Get All Hedges
 */
router.get('/hedges', auth, async (req, res) => {
    try {
        const hedges = await ExchangeHedge.find({ userId: req.user._id });
        res.json({ success: true, data: hedges });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Update Hedge Market Rate (for MTM calculation)
 */
router.patch('/hedges/:id/market-rate', auth, async (req, res) => {
    try {
        const { marketRate } = req.body;
        const hedge = await ExchangeHedge.findOne({ _id: req.params.id, userId: req.user._id });

        if (!hedge) {
            return res.status(404).json({ success: false, error: 'Hedge not found' });
        }

        hedge.marketRate = marketRate;
        await hedge.save(); // Pre-save hook will calculate MTM

        res.json({ success: true, data: hedge });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Settle Hedge
 */
router.post('/hedges/:id/settle', auth, async (req, res) => {
    try {
        const hedge = await ExchangeHedge.findOne({ _id: req.params.id, userId: req.user._id });

        if (!hedge) {
            return res.status(404).json({ success: false, error: 'Hedge not found' });
        }

        hedge.status = 'settled';
        await hedge.save();

        res.json({ success: true, data: hedge });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

module.exports = router;
