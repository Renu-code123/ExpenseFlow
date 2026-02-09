const BankConnection = require('../models/BankConnection');
const LinkedAccount = require('../models/LinkedAccount');
const ImportedTransaction = require('../models/ImportedTransaction');
const Expense = require('../models/Expense');
const MerchantDatabase = require('../models/MerchantDatabase');
const TaxCategory = require('../models/TaxCategory');
const AuditLog = require('../models/AuditLog');

class TransactionImportService {
  constructor() {
    this.categoryMappings = this.initializeCategoryMappings();
  }

  // ==================== Transaction Sync ====================

  /**
   * Sync transactions for a bank connection
   */
  async syncTransactions(connectionId, options = {}) {
    const connection = await BankConnection.findById(connectionId);
    if (!connection) throw new Error('Connection not found');

    const openBankingService = require('./openBankingService');
    const providerClient = openBankingService.providers[connection.provider];
    const accessToken = connection.getDecryptedToken();

    const accounts = await LinkedAccount.find({ 
      bankConnection: connectionId,
      'preferences.autoImportTransactions': true 
    });

    const batchId = `sync-${Date.now()}`;
    const results = {
      imported: 0,
      duplicates: 0,
      errors: 0,
      byAccount: {}
    };

    try {
      // Use transaction sync API if available
      let cursor = null;
      let hasMore = true;

      while (hasMore) {
        const syncResult = await providerClient.syncTransactions(accessToken, cursor);
        
        // Process added transactions
        for (const txn of syncResult.added || []) {
          try {
            const result = await this.importTransaction(txn, connection, accounts, batchId);
            results.imported += result.imported ? 1 : 0;
            results.duplicates += result.duplicate ? 1 : 0;
            
            const accountId = txn.account_id;
            if (!results.byAccount[accountId]) {
              results.byAccount[accountId] = { imported: 0, duplicates: 0 };
            }
            results.byAccount[accountId].imported += result.imported ? 1 : 0;
          } catch (error) {
            results.errors += 1;
            console.error('Transaction import error:', error);
          }
        }

        // Handle modified transactions
        for (const txn of syncResult.modified || []) {
          await this.updateTransaction(txn, connection);
        }

        // Handle removed transactions
        for (const txnId of syncResult.removed || []) {
          await ImportedTransaction.updateOne(
            { transactionId: txnId, bankConnection: connectionId },
            { status: 'cancelled' }
          );
        }

        cursor = syncResult.nextCursor;
        hasMore = syncResult.hasMore;

        // Update cursor on accounts
        for (const account of accounts) {
          account.sync.transactionCursor = cursor;
          await account.save();
        }
      }

      // Update connection sync time
      connection.syncConfig.lastSyncAt = new Date();
      connection.syncConfig.nextSyncAt = connection.calculateNextSync();
      connection.addAuditEntry('synced', { results });
      connection.updateHealth(true);
      await connection.save();

      await AuditLog.create({
        user: connection.user,
        action: 'transactions_synced',
        resourceType: 'BankConnection',
        resourceId: connectionId,
        details: results,
        status: 'success'
      });

      return results;
    } catch (error) {
      connection.updateHealth(false);
      await connection.save();

      await AuditLog.create({
        user: connection.user,
        action: 'transactions_synced',
        resourceType: 'BankConnection',
        resourceId: connectionId,
        details: { error: error.message },
        status: 'failure'
      });

      throw error;
    }
  }

  /**
   * Import a single transaction
   */
  async importTransaction(txn, connection, accounts, batchId) {
    const account = accounts.find(a => a.accountId === txn.account_id);
    if (!account) return { skipped: true };

    // Check for duplicates
    const existing = await ImportedTransaction.findOne({
      transactionId: txn.transaction_id,
      bankConnection: connection._id
    });

    if (existing) {
      return { duplicate: true };
    }

    // Prepare transaction data
    const transactionData = {
      user: connection.user,
      linkedAccount: account._id,
      bankConnection: connection._id,
      transactionId: txn.transaction_id,
      amount: txn.amount,
      isoCurrencyCode: txn.iso_currency_code || 'USD',
      date: new Date(txn.date),
      authorizedDate: txn.authorized_date ? new Date(txn.authorized_date) : null,
      merchant: {
        name: txn.merchant_name || txn.name,
        location: txn.location ? {
          address: txn.location.address,
          city: txn.location.city,
          region: txn.location.region,
          postalCode: txn.location.postal_code,
          country: txn.location.country,
          lat: txn.location.lat,
          lon: txn.location.lon,
          storeNumber: txn.location.store_number
        } : undefined
      },
      description: {
        original: txn.name,
        clean: this.cleanDescription(txn.name)
      },
      category: {
        primary: txn.category?.[0],
        detailed: txn.category?.join(' > '),
        source: 'provider'
      },
      type: txn.amount > 0 ? 'debit' : 'credit',
      paymentChannel: txn.payment_channel,
      status: txn.pending ? 'pending' : 'posted',
      import: {
        batchId,
        importedAt: new Date(),
        source: 'sync'
      },
      rawData: txn
    };

    // Enrich transaction
    await this.enrichTransaction(transactionData);

    // Categorize for expense tracking
    const expenseCategory = await this.categorizeForExpense(transactionData);
    if (expenseCategory) {
      transactionData.expenseCategory = expenseCategory._id;
    }

    // Create imported transaction
    const imported = await ImportedTransaction.create(transactionData);

    // Check for auto-approval
    if (imported.shouldAutoApprove()) {
      imported.reviewStatus = 'auto_approved';
      await imported.save();
    }

    // Try to find matching expense
    await this.attemptMatch(imported);

    // Update account sync info
    account.sync.lastTransactionSync = new Date();
    if (!account.sync.newestSyncedDate || new Date(txn.date) > account.sync.newestSyncedDate) {
      account.sync.newestSyncedDate = new Date(txn.date);
    }
    if (!account.sync.oldestSyncedDate || new Date(txn.date) < account.sync.oldestSyncedDate) {
      account.sync.oldestSyncedDate = new Date(txn.date);
    }
    await account.save();

    return { imported: true, transaction: imported };
  }

  /**
   * Update an existing imported transaction
   */
  async updateTransaction(txn, connection) {
    const update = {
      amount: txn.amount,
      status: txn.pending ? 'pending' : 'posted',
      'description.original': txn.name,
      'merchant.name': txn.merchant_name || txn.name
    };

    if (txn.category) {
      update['category.primary'] = txn.category[0];
      update['category.detailed'] = txn.category.join(' > ');
    }

    await ImportedTransaction.updateOne(
      { transactionId: txn.transaction_id, bankConnection: connection._id },
      { $set: update }
    );
  }

  // ==================== Transaction Enrichment ====================

  /**
   * Enrich transaction with additional data
   */
  async enrichTransaction(txnData) {
    // Try to find merchant in database
    if (txnData.merchant.name) {
      const merchant = await MerchantDatabase.findOne({
        $or: [
          { name: { $regex: new RegExp(txnData.merchant.name, 'i') } },
          { aliases: { $regex: new RegExp(txnData.merchant.name, 'i') } }
        ]
      });

      if (merchant) {
        txnData.merchant.cleanName = merchant.cleanName;
        txnData.merchant.logo = merchant.logo;
        txnData.merchant.category = merchant.category;
        txnData.merchant.website = merchant.website;
        txnData.description.clean = merchant.cleanName;
      }
    }

    // Detect transaction patterns
    txnData.flags = txnData.flags || {};
    
    // Check for subscription patterns
    const subscriptionPatterns = [
      /netflix/i, /spotify/i, /amazon prime/i, /disney/i, /hulu/i,
      /apple\.com/i, /google \*cloud/i, /github/i, /dropbox/i
    ];
    txnData.flags.isSubscription = subscriptionPatterns.some(p => 
      p.test(txnData.merchant.name) || p.test(txnData.description.original)
    );

    // Check for transfer patterns
    const transferPatterns = [
      /transfer/i, /zelle/i, /venmo/i, /paypal/i, /cash app/i
    ];
    txnData.flags.isTransfer = transferPatterns.some(p => 
      p.test(txnData.description.original)
    );

    // Check for refund
    txnData.flags.isRefund = txnData.amount < 0 && (
      /refund/i.test(txnData.description.original) ||
      /return/i.test(txnData.description.original)
    );

    return txnData;
  }

  /**
   * Clean transaction description
   */
  cleanDescription(original) {
    if (!original) return '';
    
    let clean = original;
    
    // Remove common prefixes
    clean = clean.replace(/^(POS|ACH|DEBIT|CREDIT|CARD|PURCHASE|PAYMENT|SQ \*|TST\*)\s*/gi, '');
    
    // Remove transaction numbers
    clean = clean.replace(/\s*#\d+/g, '');
    clean = clean.replace(/\s*\d{10,}/g, '');
    
    // Remove dates
    clean = clean.replace(/\s*\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, '');
    
    // Remove location codes
    clean = clean.replace(/\s+[A-Z]{2}\s*$/g, '');
    
    // Clean up spacing
    clean = clean.replace(/\s+/g, ' ').trim();
    
    // Title case
    clean = clean.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    
    return clean;
  }

  // ==================== Transaction Matching ====================

  /**
   * Attempt to match imported transaction with manual expense
   */
  async attemptMatch(importedTxn) {
    const potentialMatches = await importedTxn.findPotentialMatches();
    
    if (potentialMatches.length > 0) {
      importedTxn.potentialMatches = potentialMatches;
      
      // Auto-match if high confidence
      const bestMatch = potentialMatches[0];
      if (bestMatch.confidence >= 80) {
        await this.matchTransactions(importedTxn._id, bestMatch.expenseId, 'auto');
        return { matched: true, confidence: bestMatch.confidence };
      }
      
      importedTxn.matchStatus = 'unmatched';
      await importedTxn.save();
      return { matched: false, potentialMatches: potentialMatches.length };
    }

    importedTxn.matchStatus = 'unmatched';
    await importedTxn.save();
    return { matched: false };
  }

  /**
   * Manually match a transaction with an expense
   */
  async matchTransactions(importedTxnId, expenseId, matchType = 'manual') {
    const [importedTxn, expense] = await Promise.all([
      ImportedTransaction.findById(importedTxnId),
      Expense.findById(expenseId)
    ]);

    if (!importedTxn || !expense) {
      throw new Error('Transaction or expense not found');
    }

    // Update imported transaction
    importedTxn.matchedExpense = expense._id;
    importedTxn.matchStatus = matchType === 'auto' ? 'matched' : 'manual_match';
    importedTxn.matchConfidence = matchType === 'auto' ? 
      importedTxn.potentialMatches.find(m => m.expenseId.equals(expenseId))?.confidence : 100;
    await importedTxn.save();

    // Update expense with linked transaction
    expense.linkedTransaction = importedTxn._id;
    expense.metadata = expense.metadata || {};
    expense.metadata.importedFrom = 'bank';
    expense.metadata.bankAccountId = importedTxn.linkedAccount;
    await expense.save();

    return { importedTxn, expense };
  }

  /**
   * Unmatch a transaction
   */
  async unmatchTransaction(importedTxnId) {
    const importedTxn = await ImportedTransaction.findById(importedTxnId);
    if (!importedTxn) throw new Error('Transaction not found');

    if (importedTxn.matchedExpense) {
      await Expense.updateOne(
        { _id: importedTxn.matchedExpense },
        { $unset: { linkedTransaction: 1 } }
      );
    }

    importedTxn.matchedExpense = undefined;
    importedTxn.matchStatus = 'unmatched';
    importedTxn.matchConfidence = undefined;
    await importedTxn.save();

    return importedTxn;
  }

  // ==================== Transaction Categorization ====================

  /**
   * Categorize transaction for expense tracking
   */
  async categorizeForExpense(txnData) {
    const providerCategory = txnData.category?.primary?.toLowerCase();
    
    // Map provider categories to our expense categories
    const categoryMapping = this.categoryMappings[providerCategory];
    
    if (categoryMapping) {
      const category = await TaxCategory.findOne({
        $or: [
          { name: { $regex: new RegExp(categoryMapping, 'i') } },
          { keywords: categoryMapping.toLowerCase() }
        ]
      });
      return category;
    }

    // Try to match by merchant category
    if (txnData.merchant.category) {
      const category = await TaxCategory.findMatchingCategory(txnData.merchant.category);
      return category;
    }

    return null;
  }

  initializeCategoryMappings() {
    return {
      'food and drink': 'Food & Dining',
      'restaurants': 'Food & Dining',
      'coffee shops': 'Food & Dining',
      'groceries': 'Groceries',
      'transportation': 'Transportation',
      'gas stations': 'Transportation',
      'taxi': 'Transportation',
      'travel': 'Travel',
      'airlines': 'Travel',
      'hotels': 'Travel',
      'entertainment': 'Entertainment',
      'recreation': 'Entertainment',
      'shopping': 'Shopping',
      'clothing': 'Shopping',
      'health': 'Healthcare',
      'medical': 'Healthcare',
      'pharmacy': 'Healthcare',
      'utilities': 'Utilities',
      'phone': 'Utilities',
      'internet': 'Utilities',
      'insurance': 'Insurance',
      'education': 'Education',
      'personal care': 'Personal Care',
      'fitness': 'Fitness',
      'subscription': 'Subscriptions',
      'digital purchase': 'Subscriptions',
      'charity': 'Donations',
      'office supplies': 'Office Supplies',
      'business services': 'Business Expenses'
    };
  }

  // ==================== Bulk Operations ====================

  /**
   * Bulk approve transactions
   */
  async bulkApprove(transactionIds, userId, notes) {
    const result = await ImportedTransaction.bulkReview(
      transactionIds,
      'approved',
      userId,
      notes
    );

    await AuditLog.create({
      user: userId,
      action: 'transactions_bulk_approved',
      resourceType: 'ImportedTransaction',
      details: { count: transactionIds.length, notes },
      status: 'success'
    });

    return result;
  }

  /**
   * Bulk reject transactions
   */
  async bulkReject(transactionIds, userId, notes) {
    const result = await ImportedTransaction.bulkReview(
      transactionIds,
      'rejected',
      userId,
      notes
    );

    await AuditLog.create({
      user: userId,
      action: 'transactions_bulk_rejected',
      resourceType: 'ImportedTransaction',
      details: { count: transactionIds.length, notes },
      status: 'success'
    });

    return result;
  }

  /**
   * Bulk categorize transactions
   */
  async bulkCategorize(transactionIds, categoryId, userId) {
    await ImportedTransaction.updateMany(
      { _id: { $in: transactionIds } },
      { 
        $set: { 
          expenseCategory: categoryId,
          'category.source': 'manual'
        }
      }
    );

    return { updated: transactionIds.length };
  }

  /**
   * Convert imported transactions to expenses
   */
  async convertToExpenses(transactionIds, userId, options = {}) {
    const transactions = await ImportedTransaction.find({
      _id: { $in: transactionIds },
      user: userId,
      matchStatus: { $ne: 'matched' }
    }).populate('linkedAccount expenseCategory');

    const expenses = [];
    const errors = [];

    for (const txn of transactions) {
      try {
        const expense = await Expense.create({
          user: userId,
          amount: Math.abs(txn.amount),
          currency: txn.isoCurrencyCode,
          category: txn.expenseCategory?._id || options.defaultCategory,
          description: txn.description.clean || txn.merchant.cleanName || txn.merchant.name,
          date: txn.date,
          paymentMethod: this.mapPaymentMethod(txn.paymentChannel, txn.linkedAccount?.type),
          merchant: txn.merchant.cleanName || txn.merchant.name,
          linkedTransaction: txn._id,
          location: txn.merchant.location ? {
            address: txn.merchant.location.address,
            city: txn.merchant.location.city,
            country: txn.merchant.location.country
          } : undefined,
          tags: txn.tags,
          metadata: {
            importedFrom: 'bank',
            bankAccountId: txn.linkedAccount?._id,
            originalDescription: txn.description.original
          }
        });

        // Update transaction match status
        txn.matchedExpense = expense._id;
        txn.matchStatus = 'matched';
        txn.reviewStatus = 'approved';
        await txn.save();

        expenses.push(expense);
      } catch (error) {
        errors.push({ transactionId: txn._id, error: error.message });
      }
    }

    await AuditLog.create({
      user: userId,
      action: 'transactions_converted',
      resourceType: 'ImportedTransaction',
      details: { 
        converted: expenses.length, 
        errors: errors.length,
        expenseIds: expenses.map(e => e._id)
      },
      status: errors.length === 0 ? 'success' : 'partial'
    });

    return { expenses, errors };
  }

  mapPaymentMethod(channel, accountType) {
    if (accountType === 'credit') return 'credit_card';
    if (channel === 'online') return 'debit_card';
    if (channel === 'in_store') return 'debit_card';
    return 'bank_transfer';
  }

  // ==================== Reconciliation ====================

  /**
   * Get reconciliation status for an account
   */
  async getReconciliationStatus(accountId, userId) {
    const account = await LinkedAccount.findOne({ _id: accountId, user: userId });
    if (!account) throw new Error('Account not found');

    const pendingTransactions = await ImportedTransaction.countDocuments({
      linkedAccount: accountId,
      reviewStatus: 'pending'
    });

    const unmatchedTransactions = await ImportedTransaction.countDocuments({
      linkedAccount: accountId,
      matchStatus: 'unmatched'
    });

    const manualExpenses = await Expense.countDocuments({
      user: userId,
      linkedTransaction: { $exists: false },
      date: { $gte: account.sync.oldestSyncedDate }
    });

    return {
      account: {
        id: account._id,
        name: account.name,
        balance: account.balances.current,
        lastSynced: account.sync.lastTransactionSync
      },
      reconciliation: {
        isReconciled: account.reconciliation.isReconciled,
        lastReconciledAt: account.reconciliation.lastReconciledAt,
        reconciledBalance: account.reconciliation.reconciledBalance
      },
      pendingItems: {
        transactionsToReview: pendingTransactions,
        unmatchedTransactions,
        unmatchedManualExpenses: manualExpenses
      }
    };
  }

  /**
   * Mark account as reconciled
   */
  async reconcileAccount(accountId, userId, reconciledBalance) {
    const account = await LinkedAccount.findOne({ _id: accountId, user: userId });
    if (!account) throw new Error('Account not found');

    account.reconciliation.isReconciled = true;
    account.reconciliation.lastReconciledAt = new Date();
    account.reconciliation.reconciledBalance = reconciledBalance;
    account.reconciliation.pendingReview = 0;
    await account.save();

    await AuditLog.create({
      user: userId,
      action: 'account_reconciled',
      resourceType: 'LinkedAccount',
      resourceId: accountId,
      details: { reconciledBalance },
      status: 'success'
    });

    return account;
  }

  // ==================== Reports & Analytics ====================

  /**
   * Get import summary
   */
  async getImportSummary(userId, dateRange = {}) {
    const startDate = dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = dateRange.end || new Date();

    const stats = await ImportedTransaction.aggregate([
      {
        $match: {
          user: require('mongoose').Types.ObjectId(userId),
          'import.importedAt': { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$import.importedAt' } },
            reviewStatus: '$reviewStatus'
          },
          count: { $sum: 1 },
          totalAmount: { $sum: { $abs: '$amount' } }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          statuses: {
            $push: {
              status: '$_id.reviewStatus',
              count: '$count',
              amount: '$totalAmount'
            }
          },
          totalCount: { $sum: '$count' },
          totalAmount: { $sum: '$totalAmount' }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    const categoryBreakdown = await ImportedTransaction.aggregate([
      {
        $match: {
          user: require('mongoose').Types.ObjectId(userId),
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$category.primary',
          count: { $sum: 1 },
          totalAmount: { $sum: { $abs: '$amount' } }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    return {
      byDate: stats,
      byCategory: categoryBreakdown,
      summary: await ImportedTransaction.getImportStats(userId)
    };
  }
}

module.exports = new TransactionImportService();
