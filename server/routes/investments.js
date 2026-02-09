const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const investmentService = require('../services/investmentService');
const {
  validateCreatePortfolio,
  validateUpdatePortfolio,
  validateBuyTransaction,
  validateSellTransaction,
  validateDividend,
  validateTransfer,
  validateAddToWatchlist,
  validateSearchAssets,
  validatePortfolioHistory,
  validateTransactionHistory,
  validatePriceHistory,
  validateManualPriceUpdate
} = require('../middleware/investmentValidator');

const Portfolio = require('../models/Portfolio');
const Asset = require('../models/Asset');
const AssetTransaction = require('../models/AssetTransaction');
const PriceHistory = require('../models/PriceHistory');

// ============ PORTFOLIO ROUTES ============

// Create portfolio
router.post('/portfolios', auth, validateCreatePortfolio, async (req, res) => {
  try {
    const portfolio = await investmentService.createPortfolio(req.user._id, req.validated);
    res.status(201).json({ success: true, data: portfolio });
  } catch (error) {
    console.error('Error creating portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user portfolios
router.get('/portfolios', auth, async (req, res) => {
  try {
    const portfolios = await investmentService.getUserPortfolios(req.user._id);
    res.json({ success: true, data: portfolios });
  } catch (error) {
    console.error('Error fetching portfolios:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single portfolio with values
router.get('/portfolios/:portfolioId', auth, async (req, res) => {
  try {
    const result = await investmentService.getPortfolioWithValues(
      req.params.portfolioId,
      req.user._id
    );
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    res.status(error.message === 'Portfolio not found' ? 404 : 500)
      .json({ success: false, error: error.message });
  }
});

// Update portfolio
router.put('/portfolios/:portfolioId', auth, validateUpdatePortfolio, async (req, res) => {
  try {
    const portfolio = await Portfolio.findOneAndUpdate(
      { _id: req.params.portfolioId, user: req.user._id },
      req.validated,
      { new: true }
    );
    
    if (!portfolio) {
      return res.status(404).json({ success: false, error: 'Portfolio not found' });
    }
    
    res.json({ success: true, data: portfolio });
  } catch (error) {
    console.error('Error updating portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete portfolio
router.delete('/portfolios/:portfolioId', auth, async (req, res) => {
  try {
    const portfolio = await Portfolio.findOneAndDelete({
      _id: req.params.portfolioId,
      user: req.user._id
    });
    
    if (!portfolio) {
      return res.status(404).json({ success: false, error: 'Portfolio not found' });
    }
    
    // Delete associated transactions
    await AssetTransaction.deleteMany({ portfolio: req.params.portfolioId });
    
    res.json({ success: true, message: 'Portfolio deleted' });
  } catch (error) {
    console.error('Error deleting portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get portfolio performance
router.get('/portfolios/:portfolioId/performance', auth, async (req, res) => {
  try {
    const performance = await investmentService.calculatePortfolioPerformance(
      req.params.portfolioId,
      req.user._id
    );
    res.json({ success: true, data: performance });
  } catch (error) {
    console.error('Error calculating performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get portfolio history
router.get('/portfolios/:portfolioId/history', auth, validatePortfolioHistory, async (req, res) => {
  try {
    const history = await investmentService.getPortfolioHistory(
      req.params.portfolioId,
      req.user._id,
      req.validated.days
    );
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching portfolio history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Take portfolio snapshot
router.post('/portfolios/:portfolioId/snapshot', auth, async (req, res) => {
  try {
    const portfolio = await Portfolio.findOne({
      _id: req.params.portfolioId,
      user: req.user._id
    }).populate('holdings.asset');
    
    if (!portfolio) {
      return res.status(404).json({ success: false, error: 'Portfolio not found' });
    }
    
    await portfolio.takeSnapshot();
    res.json({ success: true, message: 'Snapshot taken' });
  } catch (error) {
    console.error('Error taking snapshot:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get rebalancing suggestions
router.get('/portfolios/:portfolioId/rebalance', auth, async (req, res) => {
  try {
    const portfolio = await Portfolio.findOne({
      _id: req.params.portfolioId,
      user: req.user._id
    }).populate('holdings.asset');
    
    if (!portfolio) {
      return res.status(404).json({ success: false, error: 'Portfolio not found' });
    }
    
    const suggestions = await portfolio.getRebalancingSuggestions();
    res.json({ success: true, data: suggestions });
  } catch (error) {
    console.error('Error getting rebalancing suggestions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ TRANSACTION ROUTES ============

// Buy asset
router.post('/transactions/buy', auth, validateBuyTransaction, async (req, res) => {
  try {
    const result = await investmentService.buyAsset(
      req.user._id,
      req.validated.portfolioId,
      req.validated
    );
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('Error buying asset:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sell asset
router.post('/transactions/sell', auth, validateSellTransaction, async (req, res) => {
  try {
    const result = await investmentService.sellAsset(
      req.user._id,
      req.validated.portfolioId,
      req.validated
    );
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('Error selling asset:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Record dividend
router.post('/transactions/dividend', auth, validateDividend, async (req, res) => {
  try {
    const result = await investmentService.recordDividend(
      req.user._id,
      req.validated.portfolioId,
      req.validated
    );
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('Error recording dividend:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Transfer asset between portfolios
router.post('/transactions/transfer', auth, validateTransfer, async (req, res) => {
  try {
    const { fromPortfolioId, toPortfolioId, symbol, quantity, costBasis, purchaseDate, notes } = req.validated;
    
    // Verify ownership
    if (fromPortfolioId) {
      const from = await Portfolio.findOne({ _id: fromPortfolioId, user: req.user._id });
      if (!from) {
        return res.status(404).json({ success: false, error: 'Source portfolio not found' });
      }
    }
    
    if (toPortfolioId) {
      const to = await Portfolio.findOne({ _id: toPortfolioId, user: req.user._id });
      if (!to) {
        return res.status(404).json({ success: false, error: 'Destination portfolio not found' });
      }
    }
    
    const asset = await Asset.findOne({ symbol: symbol.toUpperCase() });
    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    
    // Create transfer out transaction
    if (fromPortfolioId) {
      await new AssetTransaction({
        portfolio: fromPortfolioId,
        asset: asset._id,
        user: req.user._id,
        type: 'transfer_out',
        quantity,
        pricePerUnit: costBasis / quantity,
        notes
      }).save();
      
      const fromPortfolio = await Portfolio.findById(fromPortfolioId);
      await fromPortfolio.removeHolding(asset._id, quantity, costBasis / quantity);
    }
    
    // Create transfer in transaction
    if (toPortfolioId) {
      await new AssetTransaction({
        portfolio: toPortfolioId,
        asset: asset._id,
        user: req.user._id,
        type: 'transfer_in',
        quantity,
        pricePerUnit: costBasis / quantity,
        notes
      }).save();
      
      const toPortfolio = await Portfolio.findById(toPortfolioId);
      await toPortfolio.addHolding(asset._id, quantity, costBasis / quantity, purchaseDate);
    }
    
    res.status(201).json({ success: true, message: 'Transfer completed' });
  } catch (error) {
    console.error('Error transferring asset:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get transaction history
router.get('/transactions', auth, validateTransactionHistory, async (req, res) => {
  try {
    const { portfolioId, assetId, type, startDate, endDate, page, limit } = req.validated;
    
    const query = { user: req.user._id };
    if (portfolioId) query.portfolio = portfolioId;
    if (assetId) query.asset = assetId;
    if (type) query.type = type;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    const skip = (page - 1) * limit;
    
    const [transactions, total] = await Promise.all([
      AssetTransaction.find(query)
        .populate('asset', 'symbol name type')
        .populate('portfolio', 'name')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      AssetTransaction.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get realized gains report
router.get('/transactions/gains', auth, async (req, res) => {
  try {
    const { year, portfolioId } = req.query;
    const startDate = year ? new Date(`${year}-01-01`) : undefined;
    const endDate = year ? new Date(`${year}-12-31`) : undefined;
    
    const gains = await AssetTransaction.getRealizedGains(
      portfolioId,
      req.user._id,
      startDate,
      endDate
    );
    
    res.json({ success: true, data: gains });
  } catch (error) {
    console.error('Error fetching gains:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get dividend history
router.get('/transactions/dividends', auth, async (req, res) => {
  try {
    const { year, portfolioId } = req.query;
    const startDate = year ? new Date(`${year}-01-01`) : undefined;
    const endDate = year ? new Date(`${year}-12-31`) : undefined;
    
    const dividends = await AssetTransaction.getDividendHistory(
      portfolioId || null,
      req.user._id,
      startDate,
      endDate
    );
    
    res.json({ success: true, data: dividends });
  } catch (error) {
    console.error('Error fetching dividends:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ASSET ROUTES ============

// Search assets
router.get('/assets/search', auth, validateSearchAssets, async (req, res) => {
  try {
    const { query, type, limit } = req.validated;
    const assets = await investmentService.searchAssets(query, type);
    res.json({ success: true, data: assets.slice(0, limit) });
  } catch (error) {
    console.error('Error searching assets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search crypto (external API)
router.get('/assets/search/crypto', auth, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query required' });
    }
    const results = await investmentService.searchCrypto(query);
    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Error searching crypto:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get asset details
router.get('/assets/:assetId', auth, async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.assetId);
    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    
    // Get additional data
    const [returns, volatility, movingAverages] = await Promise.all([
      PriceHistory.calculateReturns(asset._id),
      PriceHistory.calculateVolatility(asset._id),
      PriceHistory.calculateMovingAverages(asset._id)
    ]);
    
    res.json({
      success: true,
      data: {
        ...asset.toObject(),
        returns,
        volatility,
        movingAverages
      }
    });
  } catch (error) {
    console.error('Error fetching asset:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get asset price history
router.get('/assets/:assetId/history', auth, validatePriceHistory, async (req, res) => {
  try {
    const { interval, days, startDate, endDate } = req.validated;
    
    const history = await PriceHistory.getChartData(req.params.assetId, {
      interval,
      days,
      startDate,
      endDate
    });
    
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching price history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update asset price manually
router.post('/assets/price/manual', auth, validateManualPriceUpdate, async (req, res) => {
  try {
    const { assetId, price } = req.validated;
    
    const asset = await Asset.findById(assetId);
    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    
    await asset.updatePrice(price, {}, 'manual');
    res.json({ success: true, data: asset });
  } catch (error) {
    console.error('Error updating price:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Refresh asset price
router.post('/assets/:assetId/refresh', auth, async (req, res) => {
  try {
    const asset = await investmentService.updateAssetPrice(req.params.assetId);
    res.json({ success: true, data: asset });
  } catch (error) {
    console.error('Error refreshing price:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Import historical data for asset
router.post('/assets/:assetId/import-history', auth, async (req, res) => {
  try {
    const { days = 365 } = req.body;
    const result = await investmentService.importHistoricalData(req.params.assetId, days);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error importing history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ WATCHLIST ROUTES ============

// Get watchlist
router.get('/watchlist', auth, async (req, res) => {
  try {
    const watchlist = await investmentService.getWatchlist(req.user._id);
    res.json({ success: true, data: watchlist });
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add to watchlist
router.post('/watchlist', auth, validateAddToWatchlist, async (req, res) => {
  try {
    const { symbol, type } = req.validated;
    const asset = await investmentService.addToWatchlist(req.user._id, symbol, type);
    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove from watchlist
router.delete('/watchlist/:assetId', auth, async (req, res) => {
  try {
    await investmentService.removeFromWatchlist(req.user._id, req.params.assetId);
    res.json({ success: true, message: 'Removed from watchlist' });
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ DASHBOARD ROUTES ============

// Get investment dashboard summary
router.get('/dashboard', auth, async (req, res) => {
  try {
    const portfolios = await Portfolio.find({ user: req.user._id })
      .populate('holdings.asset');
    
    let totalValue = 0;
    let totalDayChange = 0;
    const assetAllocation = {};
    
    for (const portfolio of portfolios) {
      await portfolio.calculateTotalValue();
      totalValue += portfolio.totalValue;
      totalDayChange += portfolio.performance?.dayChange || 0;
      
      for (const holding of portfolio.holdings) {
        if (holding.asset) {
          const type = holding.asset.type;
          assetAllocation[type] = (assetAllocation[type] || 0) + holding.currentValue;
        }
      }
    }
    
    // Get watchlist
    const watchlist = await investmentService.getWatchlist(req.user._id);
    
    // Get recent transactions
    const recentTransactions = await AssetTransaction.find({ user: req.user._id })
      .populate('asset', 'symbol name')
      .sort({ date: -1 })
      .limit(5);
    
    res.json({
      success: true,
      data: {
        totalValue,
        totalDayChange,
        dayChangePercent: totalValue > 0 ? (totalDayChange / totalValue) * 100 : 0,
        portfolioCount: portfolios.length,
        assetAllocation,
        watchlist: watchlist.slice(0, 5),
        recentTransactions
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
