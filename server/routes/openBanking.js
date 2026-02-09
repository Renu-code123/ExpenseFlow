const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  validateCreateLinkToken,
  validateExchangeToken,
  validateConnectionId,
  validateAccountId,
  validateTransactionId,
  validateUpdateSyncConfig,
  validateUpdateAccountPreferences,
  validateSearchInstitutions,
  validateReviewTransactions,
  validateMatchTransaction,
  validateConvertTransactions,
  validateBulkCategorize,
  validateReconcileAccount,
  validateGetTransactions,
  validateWebhook,
  validateCompleteReauth,
  validateDateRange
} = require('../middleware/bankingValidator');

const openBankingService = require('../services/openBankingService');
const transactionImportService = require('../services/transactionImportService');
const LinkedAccount = require('../models/LinkedAccount');
const ImportedTransaction = require('../models/ImportedTransaction');
const BankConnection = require('../models/BankConnection');

// ==================== Connection Management ====================

/**
 * @route   POST /api/banking/link/token
 * @desc    Create a link token for bank connection
 * @access  Private
 */
router.post('/link/token', auth, validateCreateLinkToken, async (req, res) => {
  try {
    const { provider, products, countries, language, accountTypes } = req.body;
    
    const linkToken = await openBankingService.createLinkToken(req.user.id, provider, {
      products,
      countries,
      language,
      accountTypes
    });

    res.json({
      success: true,
      linkToken: linkToken.linkToken,
      expiration: linkToken.expiration
    });
  } catch (error) {
    console.error('Create link token error:', error);
    res.status(500).json({ error: 'Failed to create link token', details: error.message });
  }
});

/**
 * @route   POST /api/banking/link/exchange
 * @desc    Exchange public token for access token and create connection
 * @access  Private
 */
router.post('/link/exchange', auth, validateExchangeToken, async (req, res) => {
  try {
    const { publicToken, provider, metadata } = req.body;
    
    const result = await openBankingService.exchangePublicToken(
      req.user.id,
      publicToken,
      provider,
      metadata
    );

    res.status(201).json({
      success: true,
      connection: {
        id: result.connection._id,
        institution: result.connection.institution,
        status: result.connection.status
      },
      accounts: result.accounts.map(a => ({
        id: a._id,
        name: a.name,
        type: a.type,
        mask: a.mask,
        balance: a.balances.current
      }))
    });
  } catch (error) {
    console.error('Exchange token error:', error);
    res.status(500).json({ error: 'Failed to connect bank', details: error.message });
  }
});

/**
 * @route   GET /api/banking/connections
 * @desc    Get all bank connections for user
 * @access  Private
 */
router.get('/connections', auth, async (req, res) => {
  try {
    const connections = await openBankingService.getUserConnections(req.user.id);
    
    res.json({
      success: true,
      connections
    });
  } catch (error) {
    console.error('Get connections error:', error);
    res.status(500).json({ error: 'Failed to fetch connections' });
  }
});

/**
 * @route   GET /api/banking/connections/:connectionId
 * @desc    Get connection status and details
 * @access  Private
 */
router.get('/connections/:connectionId', auth, validateConnectionId, async (req, res) => {
  try {
    const status = await openBankingService.getConnectionStatus(
      req.params.connectionId,
      req.user.id
    );

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Get connection status error:', error);
    res.status(error.message === 'Connection not found' ? 404 : 500)
      .json({ error: error.message });
  }
});

/**
 * @route   PUT /api/banking/connections/:connectionId/sync-config
 * @desc    Update connection sync configuration
 * @access  Private
 */
router.put('/connections/:connectionId/sync-config', auth, validateConnectionId, validateUpdateSyncConfig, async (req, res) => {
  try {
    const connection = await BankConnection.findOneAndUpdate(
      { _id: req.params.connectionId, user: req.user.id },
      { $set: { 'syncConfig': { ...req.body } } },
      { new: true }
    );

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    res.json({
      success: true,
      syncConfig: connection.syncConfig
    });
  } catch (error) {
    console.error('Update sync config error:', error);
    res.status(500).json({ error: 'Failed to update sync configuration' });
  }
});

/**
 * @route   POST /api/banking/connections/:connectionId/sync
 * @desc    Trigger manual sync for a connection
 * @access  Private
 */
router.post('/connections/:connectionId/sync', auth, validateConnectionId, async (req, res) => {
  try {
    // Verify ownership
    const connection = await BankConnection.findOne({
      _id: req.params.connectionId,
      user: req.user.id
    });

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Sync balances
    await openBankingService.syncBalances(req.params.connectionId);
    
    // Sync transactions
    const results = await transactionImportService.syncTransactions(req.params.connectionId);

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Manual sync error:', error);
    res.status(500).json({ error: 'Sync failed', details: error.message });
  }
});

/**
 * @route   POST /api/banking/connections/:connectionId/reauth
 * @desc    Initiate re-authentication flow
 * @access  Private
 */
router.post('/connections/:connectionId/reauth', auth, validateConnectionId, async (req, res) => {
  try {
    const linkToken = await openBankingService.initiateReauth(
      req.params.connectionId,
      req.user.id
    );

    res.json({
      success: true,
      linkToken: linkToken.linkToken,
      expiration: linkToken.expiration
    });
  } catch (error) {
    console.error('Reauth initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate re-authentication' });
  }
});

/**
 * @route   POST /api/banking/connections/:connectionId/reauth/complete
 * @desc    Complete re-authentication
 * @access  Private
 */
router.post('/connections/:connectionId/reauth/complete', auth, validateConnectionId, validateCompleteReauth, async (req, res) => {
  try {
    await openBankingService.completeReauth(
      req.params.connectionId,
      req.user.id,
      req.body.publicToken
    );

    res.json({ success: true, message: 'Re-authentication completed' });
  } catch (error) {
    console.error('Reauth completion error:', error);
    res.status(500).json({ error: 'Failed to complete re-authentication' });
  }
});

/**
 * @route   DELETE /api/banking/connections/:connectionId
 * @desc    Disconnect a bank connection
 * @access  Private
 */
router.delete('/connections/:connectionId', auth, validateConnectionId, async (req, res) => {
  try {
    await openBankingService.disconnectBank(
      req.params.connectionId,
      req.user.id,
      req.body.reason
    );

    res.json({ success: true, message: 'Bank disconnected successfully' });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect bank' });
  }
});

// ==================== Account Management ====================

/**
 * @route   GET /api/banking/accounts
 * @desc    Get all linked accounts
 * @access  Private
 */
router.get('/accounts', auth, async (req, res) => {
  try {
    const accounts = await LinkedAccount.find({ user: req.user.id, status: 'active' })
      .populate('bankConnection', 'institution status');

    res.json({
      success: true,
      accounts: accounts.map(a => ({
        id: a._id,
        name: a.preferences.nickname || a.name,
        officialName: a.officialName,
        type: a.type,
        subtype: a.subtype,
        mask: a.mask,
        balance: a.balances.current,
        available: a.balances.available,
        currency: a.balances.isoCurrencyCode,
        institution: a.bankConnection?.institution?.name,
        lastUpdated: a.balances.lastUpdated,
        issues: a.needsAttention()
      }))
    });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

/**
 * @route   GET /api/banking/accounts/summary
 * @desc    Get dashboard summary of all accounts
 * @access  Private
 */
router.get('/accounts/summary', auth, async (req, res) => {
  try {
    const summary = await LinkedAccount.getDashboardSummary(req.user.id);
    res.json({ success: true, ...summary });
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ error: 'Failed to fetch account summary' });
  }
});

/**
 * @route   GET /api/banking/accounts/:accountId
 * @desc    Get account details
 * @access  Private
 */
router.get('/accounts/:accountId', auth, validateAccountId, async (req, res) => {
  try {
    const account = await LinkedAccount.findOne({
      _id: req.params.accountId,
      user: req.user.id
    }).populate('bankConnection', 'institution status provider');

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const trend = account.getBalanceTrend(30);

    res.json({
      success: true,
      account: {
        id: account._id,
        name: account.preferences.nickname || account.name,
        officialName: account.officialName,
        type: account.type,
        subtype: account.subtype,
        mask: account.mask,
        balances: account.balances,
        trend,
        preferences: account.preferences,
        sync: account.sync,
        reconciliation: account.reconciliation,
        institution: account.bankConnection?.institution,
        issues: account.needsAttention()
      }
    });
  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

/**
 * @route   PUT /api/banking/accounts/:accountId/preferences
 * @desc    Update account preferences
 * @access  Private
 */
router.put('/accounts/:accountId/preferences', auth, validateAccountId, validateUpdateAccountPreferences, async (req, res) => {
  try {
    const account = await LinkedAccount.findOneAndUpdate(
      { _id: req.params.accountId, user: req.user.id },
      { $set: { preferences: { ...req.body } } },
      { new: true }
    );

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({
      success: true,
      preferences: account.preferences
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * @route   GET /api/banking/accounts/:accountId/balance-history
 * @desc    Get balance history for account
 * @access  Private
 */
router.get('/accounts/:accountId/balance-history', auth, validateAccountId, async (req, res) => {
  try {
    const account = await LinkedAccount.findOne({
      _id: req.params.accountId,
      user: req.user.id
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const days = parseInt(req.query.days) || 30;
    const trend = account.getBalanceTrend(days);

    res.json({
      success: true,
      accountId: account._id,
      currentBalance: account.balances.current,
      ...trend
    });
  } catch (error) {
    console.error('Get balance history error:', error);
    res.status(500).json({ error: 'Failed to fetch balance history' });
  }
});

// ==================== Transaction Management ====================

/**
 * @route   GET /api/banking/transactions
 * @desc    Get imported transactions
 * @access  Private
 */
router.get('/transactions', auth, validateGetTransactions, async (req, res) => {
  try {
    const {
      accountId, startDate, endDate, status, reviewStatus, matchStatus,
      category, minAmount, maxAmount, search, page, limit, sortBy, sortOrder
    } = req.query;

    const query = { user: req.user.id };

    if (accountId) query.linkedAccount = accountId;
    if (status) query.status = status;
    if (reviewStatus) query.reviewStatus = reviewStatus;
    if (matchStatus) query.matchStatus = matchStatus;
    if (category) query['category.primary'] = category;

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) query.amount.$gte = minAmount;
      if (maxAmount) query.amount.$lte = maxAmount;
    }

    if (search) {
      query.$or = [
        { 'merchant.name': { $regex: search, $options: 'i' } },
        { 'merchant.cleanName': { $regex: search, $options: 'i' } },
        { 'description.original': { $regex: search, $options: 'i' } },
        { 'description.clean': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy === 'merchant' ? 'merchant.name' : sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [transactions, total] = await Promise.all([
      ImportedTransaction.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('linkedAccount', 'name type mask')
        .populate('expenseCategory', 'name')
        .lean(),
      ImportedTransaction.countDocuments(query)
    ]);

    res.json({
      success: true,
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * @route   GET /api/banking/transactions/pending
 * @desc    Get transactions pending review
 * @access  Private
 */
router.get('/transactions/pending', auth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    
    const transactions = await ImportedTransaction.find({
      user: req.user.id,
      reviewStatus: 'pending'
    })
      .sort({ date: -1 })
      .limit(limit)
      .populate('linkedAccount', 'name type mask');

    const count = await ImportedTransaction.getPendingReviewCount(req.user.id);

    res.json({
      success: true,
      transactions,
      totalPending: count
    });
  } catch (error) {
    console.error('Get pending transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch pending transactions' });
  }
});

/**
 * @route   GET /api/banking/transactions/unmatched
 * @desc    Get unmatched transactions
 * @access  Private
 */
router.get('/transactions/unmatched', auth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const transactions = await ImportedTransaction.getUnmatched(req.user.id, limit);

    res.json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error('Get unmatched transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch unmatched transactions' });
  }
});

/**
 * @route   GET /api/banking/transactions/:transactionId
 * @desc    Get transaction details
 * @access  Private
 */
router.get('/transactions/:transactionId', auth, validateTransactionId, async (req, res) => {
  try {
    const transaction = await ImportedTransaction.findOne({
      _id: req.params.transactionId,
      user: req.user.id
    })
      .populate('linkedAccount', 'name type mask')
      .populate('matchedExpense')
      .populate('expenseCategory', 'name');

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({
      success: true,
      transaction
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

/**
 * @route   POST /api/banking/transactions/review
 * @desc    Bulk review transactions (approve/reject)
 * @access  Private
 */
router.post('/transactions/review', auth, validateReviewTransactions, async (req, res) => {
  try {
    const { transactionIds, status, notes } = req.body;

    if (status === 'approved') {
      await transactionImportService.bulkApprove(transactionIds, req.user.id, notes);
    } else {
      await transactionImportService.bulkReject(transactionIds, req.user.id, notes);
    }

    res.json({
      success: true,
      message: `${transactionIds.length} transactions ${status}`
    });
  } catch (error) {
    console.error('Review transactions error:', error);
    res.status(500).json({ error: 'Failed to review transactions' });
  }
});

/**
 * @route   POST /api/banking/transactions/:transactionId/match
 * @desc    Match transaction with an expense
 * @access  Private
 */
router.post('/transactions/:transactionId/match', auth, validateTransactionId, validateMatchTransaction, async (req, res) => {
  try {
    const result = await transactionImportService.matchTransactions(
      req.params.transactionId,
      req.body.expenseId,
      'manual'
    );

    res.json({
      success: true,
      transaction: result.importedTxn,
      expense: result.expense
    });
  } catch (error) {
    console.error('Match transaction error:', error);
    res.status(500).json({ error: 'Failed to match transaction' });
  }
});

/**
 * @route   DELETE /api/banking/transactions/:transactionId/match
 * @desc    Unmatch a transaction
 * @access  Private
 */
router.delete('/transactions/:transactionId/match', auth, validateTransactionId, async (req, res) => {
  try {
    await transactionImportService.unmatchTransaction(req.params.transactionId);
    res.json({ success: true, message: 'Transaction unmatched' });
  } catch (error) {
    console.error('Unmatch transaction error:', error);
    res.status(500).json({ error: 'Failed to unmatch transaction' });
  }
});

/**
 * @route   POST /api/banking/transactions/convert
 * @desc    Convert imported transactions to expenses
 * @access  Private
 */
router.post('/transactions/convert', auth, validateConvertTransactions, async (req, res) => {
  try {
    const { transactionIds, defaultCategory } = req.body;
    
    const result = await transactionImportService.convertToExpenses(
      transactionIds,
      req.user.id,
      { defaultCategory }
    );

    res.json({
      success: true,
      converted: result.expenses.length,
      errors: result.errors
    });
  } catch (error) {
    console.error('Convert transactions error:', error);
    res.status(500).json({ error: 'Failed to convert transactions' });
  }
});

/**
 * @route   POST /api/banking/transactions/categorize
 * @desc    Bulk categorize transactions
 * @access  Private
 */
router.post('/transactions/categorize', auth, validateBulkCategorize, async (req, res) => {
  try {
    const { transactionIds, categoryId } = req.body;
    
    const result = await transactionImportService.bulkCategorize(
      transactionIds,
      categoryId,
      req.user.id
    );

    res.json({
      success: true,
      updated: result.updated
    });
  } catch (error) {
    console.error('Categorize transactions error:', error);
    res.status(500).json({ error: 'Failed to categorize transactions' });
  }
});

// ==================== Reconciliation ====================

/**
 * @route   GET /api/banking/accounts/:accountId/reconciliation
 * @desc    Get reconciliation status for an account
 * @access  Private
 */
router.get('/accounts/:accountId/reconciliation', auth, validateAccountId, async (req, res) => {
  try {
    const status = await transactionImportService.getReconciliationStatus(
      req.params.accountId,
      req.user.id
    );

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Get reconciliation status error:', error);
    res.status(500).json({ error: 'Failed to fetch reconciliation status' });
  }
});

/**
 * @route   POST /api/banking/accounts/:accountId/reconcile
 * @desc    Mark account as reconciled
 * @access  Private
 */
router.post('/accounts/:accountId/reconcile', auth, validateAccountId, validateReconcileAccount, async (req, res) => {
  try {
    const account = await transactionImportService.reconcileAccount(
      req.params.accountId,
      req.user.id,
      req.body.reconciledBalance
    );

    res.json({
      success: true,
      reconciliation: account.reconciliation
    });
  } catch (error) {
    console.error('Reconcile account error:', error);
    res.status(500).json({ error: 'Failed to reconcile account' });
  }
});

// ==================== Institutions ====================

/**
 * @route   GET /api/banking/institutions/search
 * @desc    Search for supported institutions
 * @access  Private
 */
router.get('/institutions/search', auth, validateSearchInstitutions, async (req, res) => {
  try {
    const { query, provider, country } = req.query;
    
    const institutions = await openBankingService.searchInstitutions(query, provider, country);

    res.json({
      success: true,
      institutions
    });
  } catch (error) {
    console.error('Search institutions error:', error);
    res.status(500).json({ error: 'Failed to search institutions' });
  }
});

// ==================== Reports & Statistics ====================

/**
 * @route   GET /api/banking/stats
 * @desc    Get import statistics
 * @access  Private
 */
router.get('/stats', auth, validateDateRange, async (req, res) => {
  try {
    const days = req.query.days || 30;
    const stats = await ImportedTransaction.getImportStats(req.user.id, days);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * @route   GET /api/banking/reports/summary
 * @desc    Get import summary report
 * @access  Private
 */
router.get('/reports/summary', auth, validateDateRange, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const summary = await transactionImportService.getImportSummary(req.user.id, {
      start: startDate ? new Date(startDate) : undefined,
      end: endDate ? new Date(endDate) : undefined
    });

    res.json({
      success: true,
      ...summary
    });
  } catch (error) {
    console.error('Get summary report error:', error);
    res.status(500).json({ error: 'Failed to fetch summary report' });
  }
});

// ==================== Webhooks ====================

/**
 * @route   POST /api/banking/webhook/:provider
 * @desc    Handle webhooks from banking providers
 * @access  Public (verified by signature)
 */
router.post('/webhook/:provider', async (req, res) => {
  try {
    const provider = req.params.provider;
    const signature = req.headers['plaid-verification'] || 
                     req.headers['x-signature'] ||
                     req.headers['x-webhook-signature'];

    await openBankingService.handleWebhook(provider, req.body, signature);

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
