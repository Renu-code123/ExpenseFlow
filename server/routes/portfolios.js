const express = require('express');
const router = express.Router();
const portfolioService = require('../services/portfolioService');
const auth = require('../middleware/auth');

// Create portfolio
router.post('/', auth, async (req, res) => {
    try {
        const portfolio = await portfolioService.createPortfolio(req.user.id, req.body);
        res.status(201).json({ success: true, data: portfolio });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get all user portfolios
router.get('/', auth, async (req, res) => {
    try {
        const portfolios = await Portfolio.getUserPortfolios(req.user.id);
        res.json({ success: true, data: portfolios });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get portfolio details
router.get('/:id', auth, async (req, res) => {
    try {
        const data = await portfolioService.getPortfolio(req.params.id, req.user.id);
        res.json({ success: true, data });
    } catch (error) {
        res.status(404).json({ success: false, message: error.message });
    }
});

// Get portfolio analytics
router.get('/:id/analytics', auth, async (req, res) => {
    try {
        const analytics = await portfolioService.getAnalytics(req.params.id, req.user.id);
        res.json({ success: true, data: analytics });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update portfolio metrics
router.post('/:id/update-metrics', auth, async (req, res) => {
    try {
        const portfolio = await portfolioService.updatePortfolioMetrics(req.params.id);
        res.json({ success: true, data: portfolio });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add asset
router.post('/:id/assets', auth, async (req, res) => {
    try {
        const asset = await portfolioService.addAsset(req.params.id, req.user.id, req.body);
        res.status(201).json({ success: true, data: asset });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Buy asset
router.post('/:id/assets/:assetId/buy', auth, async (req, res) => {
    try {
        const result = await portfolioService.buyAsset(
            req.params.id,
            req.user.id,
            req.params.assetId,
            req.body
        );
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Sell asset
router.post('/:id/assets/:assetId/sell', auth, async (req, res) => {
    try {
        const result = await portfolioService.sellAsset(
            req.params.id,
            req.user.id,
            req.params.assetId,
            req.body
        );
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Record dividend
router.post('/:id/assets/:assetId/dividend', auth, async (req, res) => {
    try {
        const transaction = await portfolioService.recordDividend(
            req.params.id,
            req.user.id,
            req.params.assetId,
            req.body
        );
        res.json({ success: true, data: transaction });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Get performance history
router.get('/:id/performance', auth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const history = await portfolioService.getPerformanceHistory(
            req.params.id,
            req.user.id,
            days
        );
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update prices
router.post('/:id/update-prices', auth, async (req, res) => {
    try {
        const priceUpdateService = require('../services/priceUpdateService');
        const results = await priceUpdateService.updatePortfolioPrices(req.params.id);
        
        // Update portfolio metrics after price update
        await portfolioService.updatePortfolioMetrics(req.params.id);
        
        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
