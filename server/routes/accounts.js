/**
 * Account Routes
 * Issue #337: Multi-Account Liquidity Management & Historical Revaluation
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const Account = require('../models/Account');
const BalanceHistory = require('../models/BalanceHistory');
const NetWorthSnapshot = require('../models/NetWorthSnapshot');
const Transfer = require('../models/Transfer');
const currencyService = require('../services/currencyService');
const {requireAuth,getUserId}=require('../middleware/clerkAuth');

// Validation Schemas
const accountSchema = Joi.object({
  name: Joi.string().required().max(100),
  type: Joi.string().required().valid(
    'cash', 'checking', 'savings', 'credit_card', 'investment', 'loan', 'wallet', 'crypto', 'other'
  ),
  subtype: Joi.string().valid('personal', 'business', 'joint', 'emergency_fund', 'retirement', 'brokerage', 'defi', 'exchange'),
  currency: Joi.string().required().uppercase().min(3).max(5),
  balance: Joi.number().default(0),
  creditLimit: Joi.number().min(0).allow(null),
  interestRate: Joi.number().min(0).max(100).allow(null),
  institution: Joi.object({
    name: Joi.string().max(100),
    logo: Joi.string().uri(),
    color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/)
  }),
  accountNumber: Joi.string().max(50),
  includeInNetWorth: Joi.boolean().default(true),
  includeInBudget: Joi.boolean().default(true),
  icon: Joi.string().max(50),
  color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/),
  group: Joi.string().max(50),
  notes: Joi.string().max(500)
});

const transferSchema = Joi.object({
  fromAccountId: Joi.string().required().hex().length(24),
  toAccountId: Joi.string().required().hex().length(24),
  amount: Joi.number().required().positive(),
  description: Joi.string().max(500),
  category: Joi.string().valid(
    'atm_withdrawal', 'atm_deposit', 'account_transfer', 'investment',
    'loan_payment', 'credit_payment', 'savings', 'currency_exchange',
    'crypto_purchase', 'crypto_sale', 'other'
  ),
  date: Joi.date().max('now'),
  fee: Joi.number().min(0).default(0)
});

// ============================================
// Account CRUD Operations
// ============================================

/**
 * GET /api/accounts
 * Get all accounts for current user
 */
router.get('/',requireAuth, async (req, res) => {
  try {
    const { type, includeHidden, currency, group } = req.query;
    
    const query = {
      userId: req.user.id,
      isActive: true
    };
    
    if (type) query.type = type;
    if (includeHidden !== 'true') query.isHidden = false;
    if (currency) query.currency = currency.toUpperCase();
    if (group) query.group = group;
    
    const accounts = await Account.find(query)
      .select('-accountNumber')
      .sort({ sortOrder: 1, createdAt: 1 });
    
    // Calculate totals by currency
    const totals = await Account.getTotalBalance(req.user.id);
    
    res.json({
      accounts,
      totals,
      count: accounts.length
    });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

/**
 * GET /api/accounts/:id
 * Get single account details
 */
router.get('/:id',requireAuth, async (req, res) => {
  try {
    const account = await Account.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).select('-accountNumber');
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json({ account });
  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

/**
 * POST /api/accounts
 * Create new account
 */
router.post('/',requireAuth, async (req, res) => {
  try {
    const { error, value } = accountSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    // Validate currency
    if (!currencyService.isValidCurrency(value.currency)) {
      return res.status(400).json({ error: 'Invalid currency code' });
    }
    
    // Get next sort order
    const maxSort = await Account.findOne({ userId: req.user.id })
      .sort({ sortOrder: -1 })
      .select('sortOrder');
    
    const account = new Account({
      ...value,
      userId: req.user.id,
      sortOrder: (maxSort?.sortOrder || 0) + 1,
      openingBalance: value.balance,
      openingDate: new Date()
    });
    
    await account.save();
    
    // Create initial balance history entry
    await BalanceHistory.create({
      accountId: account._id,
      userId: req.user.id,
      previousBalance: 0,
      newBalance: account.balance,
      change: account.balance,
      currency: account.currency,
      changeType: 'opening_balance',
      description: 'Account created',
      source: 'manual'
    });
    
    res.status(201).json({
      message: 'Account created successfully',
      account
    });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

/**
 * PUT /api/accounts/:id
 * Update account
 */
router.put('/:id',requireAuth, async (req, res) => {
  try {
    const { error, value } = accountSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const account = await Account.findOne({
      _id: req.params.id,
      userId: req.user.id
    });
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    // Track balance change
    const balanceChanged = value.balance !== undefined && value.balance !== account.balance;
    const previousBalance = account.balance;
    
    // Update fields
    Object.assign(account, value);
    await account.save();
    
    // Record balance change if applicable
    if (balanceChanged) {
      await BalanceHistory.create({
        accountId: account._id,
        userId: req.user.id,
        previousBalance,
        newBalance: account.balance,
        change: account.balance - previousBalance,
        currency: account.currency,
        changeType: 'adjustment',
        description: 'Manual balance update',
        source: 'manual'
      });
    }
    
    res.json({
      message: 'Account updated successfully',
      account
    });
  } catch (error) {
    console.error('Update account error:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

/**
 * DELETE /api/accounts/:id
 * Soft delete account
 */
router.delete('/:id',requireAuth, async (req, res) => {
  try {
    const account = await Account.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { isActive: false },
      { new: true }
    );
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

/**
 * PATCH /api/accounts/:id/balance
 * Update account balance
 */
router.patch('/:id/balance',requireAuth, async (req, res) => {
  try {
    const { balance, description } = req.body;
    
    if (typeof balance !== 'number') {
      return res.status(400).json({ error: 'Balance must be a number' });
    }
    
    const account = await Account.findOne({
      _id: req.params.id,
      userId: req.user.id
    });
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    await account.updateBalance(balance, description || 'Balance update');
    
    res.json({
      message: 'Balance updated successfully',
      account
    });
  } catch (error) {
    console.error('Update balance error:', error);
    res.status(500).json({ error: 'Failed to update balance' });
  }
});

/**
 * PATCH /api/accounts/reorder
 * Reorder accounts
 */
router.patch('/reorder',requireAuth, async (req, res) => {
  try {
    const { accountIds } = req.body;
    
    if (!Array.isArray(accountIds)) {
      return res.status(400).json({ error: 'accountIds must be an array' });
    }
    
    const updates = accountIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, userId: req.user.id },
        update: { sortOrder: index }
      }
    }));
    
    await Account.bulkWrite(updates);
    
    res.json({ message: 'Accounts reordered successfully' });
  } catch (error) {
    console.error('Reorder accounts error:', error);
    res.status(500).json({ error: 'Failed to reorder accounts' });
  }
});

// ============================================
// Transfer Operations
// ============================================

/**
 * POST /api/accounts/transfer
 * Transfer between accounts
 */
router.post('/transfer',requireAuth, async (req, res) => {
  try {
    const { error, value } = transferSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const result = await Transfer.executeTransfer({
      userId: req.user.id,
      fromAccountId: value.fromAccountId,
      toAccountId: value.toAccountId,
      amount: value.amount,
      description: value.description,
      category: value.category,
      date: value.date,
      fee: value.fee
    });
    
    res.status(201).json({
      message: 'Transfer completed successfully',
      transfer: result.transfer,
      fromAccount: {
        id: result.fromAccount._id,
        name: result.fromAccount.name,
        balance: result.fromAccount.balance
      },
      toAccount: {
        id: result.toAccount._id,
        name: result.toAccount.name,
        balance: result.toAccount.balance
      }
    });
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({ error: error.message || 'Transfer failed' });
  }
});

/**
 * GET /api/accounts/transfers
 * Get transfer history
 */
router.get('/transfers/history',requireAuth, async (req, res) => {
  try {
    const { limit = 50, category, startDate, endDate } = req.query;
    
    const query = { userId: req.user.id };
    
    if (category) query.category = category;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    const transfers = await Transfer.find(query)
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .populate('fromAccount', 'name type icon color currency')
      .populate('toAccount', 'name type icon color currency');
    
    const summary = await Transfer.getTransferSummary(req.user.id, {
      startDate,
      endDate
    });
    
    res.json({
      transfers,
      summary,
      count: transfers.length
    });
  } catch (error) {
    console.error('Get transfers error:', error);
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

/**
 * POST /api/accounts/transfers/:id/reverse
 * Reverse a transfer
 */
router.post('/transfers/:id/reverse',requireAuth, async (req, res) => {
  try {
    const transfer = await Transfer.findOne({
      _id: req.params.id,
      userId: req.user.id
    });
    
    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }
    
    const { reason = 'User requested reversal' } = req.body;
    await transfer.reverse(reason);
    
    res.json({
      message: 'Transfer reversed successfully',
      transfer
    });
  } catch (error) {
    console.error('Reverse transfer error:', error);
    res.status(500).json({ error: error.message || 'Failed to reverse transfer' });
  }
});

// ============================================
// Balance History & Net Worth
// ============================================

/**
 * GET /api/accounts/:id/history
 * Get account balance history
 */
router.get('/:id/history',requireAuth, async (req, res) => {
  try {
    const { days = 30, changeType } = req.query;
    
    // Verify account ownership
    const account = await Account.findOne({
      _id: req.params.id,
      userId: req.user.id
    });
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const history = await BalanceHistory.getAccountHistory(req.params.id, {
      startDate,
      changeType,
      limit: 200
    });
    
    const dailySnapshots = await BalanceHistory.getDailySnapshots(req.params.id, parseInt(days));
    
    res.json({
      history,
      dailySnapshots,
      account: {
        id: account._id,
        name: account.name,
        currentBalance: account.balance,
        currency: account.currency
      }
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * GET /api/accounts/networth
 * Get net worth data
 */
router.get('/networth/summary',requireAuth, async (req, res) => {
  try {
    const { baseCurrency = 'USD' } = req.query;
    
    const stats = await NetWorthSnapshot.getNetWorthStats(req.user.id, baseCurrency);
    
    res.json(stats);
  } catch (error) {
    console.error('Get net worth error:', error);
    res.status(500).json({ error: 'Failed to fetch net worth' });
  }
});

/**
 * GET /api/accounts/networth/trend
 * Get net worth trend data for charts
 */
router.get('/networth/trend',requireAuth, async (req, res) => {
  try {
    const { days = 30, interval = 'daily', baseCurrency = 'USD' } = req.query;
    
    const trend = await NetWorthSnapshot.getNetWorthTrend(req.user.id, {
      days: parseInt(days),
      interval,
      baseCurrency
    });
    
    res.json({
      trend,
      period: { days: parseInt(days), interval },
      baseCurrency
    });
  } catch (error) {
    console.error('Get net worth trend error:', error);
    res.status(500).json({ error: 'Failed to fetch trend data' });
  }
});

/**
 * POST /api/accounts/networth/snapshot
 * Create manual net worth snapshot
 */
router.post('/networth/snapshot',requireAuth, async (req, res) => {
  try {
    const { baseCurrency = 'USD' } = req.body;
    
    const accounts = await Account.find({
      userId: req.user.id,
      isActive: true,
      includeInNetWorth: true
    });
    
    if (accounts.length === 0) {
      return res.status(400).json({ error: 'No accounts found for net worth calculation' });
    }
    
    // Get current rates
    const rates = await currencyService.getAllRates(baseCurrency);
    
    const snapshot = await NetWorthSnapshot.createSnapshot(
      req.user.id,
      accounts,
      rates.rates,
      baseCurrency
    );
    
    res.status(201).json({
      message: 'Snapshot created successfully',
      snapshot
    });
  } catch (error) {
    console.error('Create snapshot error:', error);
    res.status(500).json({ error: 'Failed to create snapshot' });
  }
});

// ============================================
// Currency Operations
// ============================================

/**
 * GET /api/accounts/currencies
 * Get supported currencies
 */
router.get('/currencies/list',requireAuth, async (req, res) => {
  try {
    const currencies = currencyService.getSupportedCurrencies();
    res.json(currencies);
  } catch (error) {
    console.error('Get currencies error:', error);
    res.status(500).json({ error: 'Failed to fetch currencies' });
  }
});

/**
 * GET /api/accounts/currencies/rates
 * Get current exchange rates
 */
router.get('/currencies/rates',requireAuth, async (req, res) => {
  try {
    const { baseCurrency = 'USD' } = req.query;
    const rates = await currencyService.getAllRates(baseCurrency);
    res.json(rates);
  } catch (error) {
    console.error('Get rates error:', error);
    res.status(500).json({ error: 'Failed to fetch rates' });
  }
});

/**
 * POST /api/accounts/currencies/convert
 * Convert currency amount
 */
router.post('/currencies/convert',requireAuth, async (req, res) => {
  try {
    const { amount, fromCurrency, toCurrency } = req.body;
    
    if (!amount || !fromCurrency || !toCurrency) {
      return res.status(400).json({ error: 'amount, fromCurrency, and toCurrency are required' });
    }
    
    const result = await currencyService.convertCurrency(amount, fromCurrency, toCurrency);
    res.json(result);
  } catch (error) {
    console.error('Convert currency error:', error);
    res.status(500).json({ error: error.message || 'Conversion failed' });
  }
});

// ============================================
// Dashboard & Statistics
// ============================================

/**
 * GET /api/accounts/dashboard
 * Get account dashboard data
 */
router.get('/dashboard/summary',requireAuth, async (req, res) => {
  try {
    const { baseCurrency = 'USD' } = req.query;
    
    const [accounts, totals, byType, netWorthStats, recentTransfers] = await Promise.all([
      Account.find({ userId: req.user.id, isActive: true, isHidden: false })
        .select('-accountNumber')
        .sort({ sortOrder: 1 })
        .limit(10),
      Account.getTotalBalance(req.user.id),
      Account.getAccountsByType(req.user.id),
      NetWorthSnapshot.getNetWorthStats(req.user.id, baseCurrency),
      Transfer.find({ userId: req.user.id })
        .sort({ date: -1 })
        .limit(5)
        .populate('fromAccount toAccount', 'name icon color')
    ]);
    
    res.json({
      accounts,
      totals,
      byType,
      netWorth: netWorthStats,
      recentTransfers,
      baseCurrency
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

module.exports = router;
