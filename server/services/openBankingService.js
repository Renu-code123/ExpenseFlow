const BankConnection = require('../models/BankConnection');
const LinkedAccount = require('../models/LinkedAccount');
const ImportedTransaction = require('../models/ImportedTransaction');
const MerchantDatabase = require('../models/MerchantDatabase');
const AuditLog = require('../models/AuditLog');

// Provider SDKs (would be actual SDK imports in production)
// const { PlaidApi, Configuration, PlaidEnvironments } = require('plaid');

class OpenBankingService {
  constructor() {
    this.providers = {
      plaid: new PlaidProvider(),
      yodlee: new YodleeProvider(),
      truelayer: new TrueLayerProvider()
    };
  }

  // ==================== Connection Management ====================

  /**
   * Create a link token for bank connection initialization
   */
  async createLinkToken(userId, provider = 'plaid', options = {}) {
    const providerClient = this.providers[provider];
    if (!providerClient) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    try {
      const linkToken = await providerClient.createLinkToken(userId, options);
      
      await AuditLog.create({
        user: userId,
        action: 'bank_link_initiated',
        resourceType: 'BankConnection',
        details: { provider, ...options },
        status: 'success'
      });

      return linkToken;
    } catch (error) {
      await AuditLog.create({
        user: userId,
        action: 'bank_link_initiated',
        resourceType: 'BankConnection',
        details: { provider, error: error.message },
        status: 'failure'
      });
      throw error;
    }
  }

  /**
   * Exchange public token for access token and create connection
   */
  async exchangePublicToken(userId, publicToken, provider = 'plaid', metadata = {}) {
    const providerClient = this.providers[provider];
    
    try {
      // Exchange token
      const { accessToken, itemId } = await providerClient.exchangePublicToken(publicToken);
      
      // Get institution info
      const institutionInfo = await providerClient.getInstitution(metadata.institution?.institution_id);
      
      // Create bank connection
      const connection = await BankConnection.create({
        user: userId,
        provider,
        accessToken,
        itemId,
        institution: {
          id: metadata.institution?.institution_id,
          name: metadata.institution?.name || institutionInfo?.name,
          logo: institutionInfo?.logo,
          primaryColor: institutionInfo?.primary_color,
          url: institutionInfo?.url,
          country: institutionInfo?.country_codes?.[0] || 'US'
        },
        status: 'active',
        consent: {
          scopes: metadata.accounts?.map(a => a.subtype) || [],
          grantedAt: new Date()
        },
        syncConfig: {
          frequency: 'daily',
          lastSyncAt: null,
          nextSyncAt: new Date()
        }
      });

      connection.addAuditEntry('created', { provider, institutionId: metadata.institution?.institution_id });
      await connection.save();

      // Fetch and create linked accounts
      const accounts = await this.syncAccounts(connection._id);

      await AuditLog.create({
        user: userId,
        action: 'bank_connected',
        resourceType: 'BankConnection',
        resourceId: connection._id,
        details: { 
          provider, 
          institution: connection.institution.name,
          accountCount: accounts.length 
        },
        status: 'success'
      });

      return { connection, accounts };
    } catch (error) {
      await AuditLog.create({
        user: userId,
        action: 'bank_connected',
        resourceType: 'BankConnection',
        details: { provider, error: error.message },
        status: 'failure'
      });
      throw error;
    }
  }

  /**
   * Sync accounts from bank connection
   */
  async syncAccounts(connectionId) {
    const connection = await BankConnection.findById(connectionId);
    if (!connection) throw new Error('Connection not found');

    const providerClient = this.providers[connection.provider];
    const accessToken = connection.getDecryptedToken();

    try {
      const providerAccounts = await providerClient.getAccounts(accessToken);
      const accounts = [];

      for (const acct of providerAccounts) {
        const accountData = {
          user: connection.user,
          bankConnection: connection._id,
          accountId: acct.account_id,
          mask: acct.mask,
          name: acct.name,
          officialName: acct.official_name,
          type: this.mapAccountType(acct.type),
          subtype: acct.subtype,
          balances: {
            current: acct.balances?.current || 0,
            available: acct.balances?.available,
            limit: acct.balances?.limit,
            isoCurrencyCode: acct.balances?.iso_currency_code || 'USD',
            lastUpdated: new Date()
          },
          status: 'active'
        };

        const account = await LinkedAccount.findOneAndUpdate(
          { accountId: acct.account_id, bankConnection: connection._id },
          accountData,
          { upsert: true, new: true }
        );

        accounts.push(account);
      }

      connection.updateHealth(true);
      await connection.save();

      return accounts;
    } catch (error) {
      connection.updateHealth(false);
      await connection.save();
      throw error;
    }
  }

  /**
   * Sync balances for all accounts in a connection
   */
  async syncBalances(connectionId) {
    const connection = await BankConnection.findById(connectionId);
    if (!connection) throw new Error('Connection not found');

    const providerClient = this.providers[connection.provider];
    const accessToken = connection.getDecryptedToken();

    try {
      const balances = await providerClient.getBalances(accessToken);
      
      for (const balance of balances) {
        const account = await LinkedAccount.findOne({
          bankConnection: connection._id,
          accountId: balance.account_id
        });

        if (account) {
          account.updateBalance(
            balance.balances.current,
            balance.balances.available,
            balance.balances.limit
          );
          account.sync.lastBalanceSync = new Date();
          await account.save();
        }
      }

      connection.updateHealth(true);
      connection.syncConfig.lastSyncAt = new Date();
      connection.syncConfig.nextSyncAt = connection.calculateNextSync();
      await connection.save();

      return balances;
    } catch (error) {
      connection.updateHealth(false);
      await connection.save();
      throw error;
    }
  }

  /**
   * Get connection status and health info
   */
  async getConnectionStatus(connectionId, userId) {
    const connection = await BankConnection.findOne({ _id: connectionId, user: userId });
    if (!connection) throw new Error('Connection not found');

    const accounts = await LinkedAccount.find({ bankConnection: connectionId });
    const pendingTransactions = await ImportedTransaction.countDocuments({
      bankConnection: connectionId,
      reviewStatus: 'pending'
    });

    return {
      connection: {
        id: connection._id,
        provider: connection.provider,
        institution: connection.institution,
        status: connection.status,
        health: connection.health,
        lastSync: connection.syncConfig.lastSyncAt,
        nextSync: connection.syncConfig.nextSyncAt,
        needsReauth: connection.needsReauth()
      },
      accounts: accounts.map(a => ({
        id: a._id,
        name: a.name,
        type: a.type,
        balance: a.balances.current,
        lastUpdated: a.balances.lastUpdated
      })),
      pendingTransactions
    };
  }

  /**
   * Disconnect a bank connection
   */
  async disconnectBank(connectionId, userId, reason) {
    const connection = await BankConnection.findOne({ _id: connectionId, user: userId });
    if (!connection) throw new Error('Connection not found');

    // Revoke access with provider
    const providerClient = this.providers[connection.provider];
    try {
      await providerClient.removeItem(connection.getDecryptedToken());
    } catch (error) {
      console.error('Error revoking provider access:', error);
    }

    // Update connection status
    connection.status = 'disconnected';
    connection.addAuditEntry('disconnected', { reason });
    await connection.save();

    // Deactivate linked accounts
    await LinkedAccount.updateMany(
      { bankConnection: connectionId },
      { status: 'inactive' }
    );

    await AuditLog.create({
      user: userId,
      action: 'bank_disconnected',
      resourceType: 'BankConnection',
      resourceId: connection._id,
      details: { reason, institution: connection.institution.name },
      status: 'success'
    });

    return { success: true };
  }

  /**
   * Initiate re-authentication flow
   */
  async initiateReauth(connectionId, userId) {
    const connection = await BankConnection.findOne({ _id: connectionId, user: userId });
    if (!connection) throw new Error('Connection not found');

    const providerClient = this.providers[connection.provider];
    
    const linkToken = await providerClient.createLinkToken(userId, {
      accessToken: connection.getDecryptedToken(),
      updateMode: true
    });

    connection.addAuditEntry('reauth', { initiated: true });
    await connection.save();

    return linkToken;
  }

  /**
   * Complete re-authentication
   */
  async completeReauth(connectionId, userId, publicToken) {
    const connection = await BankConnection.findOne({ _id: connectionId, user: userId });
    if (!connection) throw new Error('Connection not found');

    // For update mode, we just need to verify the token works
    connection.status = 'active';
    connection.error = undefined;
    connection.health.consecutiveFailures = 0;
    connection.health.isHealthy = true;
    connection.addAuditEntry('reconnected', {});
    await connection.save();

    // Sync accounts and balances
    await this.syncAccounts(connectionId);
    await this.syncBalances(connectionId);

    return { success: true };
  }

  // ==================== Webhook Handling ====================

  /**
   * Handle webhook from provider
   */
  async handleWebhook(provider, payload, signature) {
    const providerClient = this.providers[provider];
    
    // Verify webhook signature
    if (!providerClient.verifyWebhook(payload, signature)) {
      throw new Error('Invalid webhook signature');
    }

    const webhookType = payload.webhook_type;
    const itemId = payload.item_id;

    const connection = await BankConnection.findOne({ itemId, provider });
    if (!connection) {
      console.warn('Webhook received for unknown connection:', itemId);
      return;
    }

    connection.webhook.lastReceivedAt = new Date();

    switch (webhookType) {
      case 'TRANSACTIONS':
        await this.handleTransactionWebhook(connection, payload);
        break;
      
      case 'ITEM':
        await this.handleItemWebhook(connection, payload);
        break;
      
      case 'AUTH':
        await this.handleAuthWebhook(connection, payload);
        break;
      
      default:
        console.log('Unhandled webhook type:', webhookType);
    }

    await connection.save();
  }

  async handleTransactionWebhook(connection, payload) {
    const code = payload.webhook_code;
    
    switch (code) {
      case 'INITIAL_UPDATE':
      case 'HISTORICAL_UPDATE':
      case 'DEFAULT_UPDATE':
        // Trigger transaction sync
        const transactionImportService = require('./transactionImportService');
        await transactionImportService.syncTransactions(connection._id);
        break;
      
      case 'TRANSACTIONS_REMOVED':
        // Handle removed transactions
        await ImportedTransaction.updateMany(
          { 
            bankConnection: connection._id,
            transactionId: { $in: payload.removed_transactions }
          },
          { status: 'cancelled' }
        );
        break;
    }

    connection.addAuditEntry('synced', { 
      trigger: 'webhook', 
      code,
      newTransactions: payload.new_transactions
    });
  }

  async handleItemWebhook(connection, payload) {
    const code = payload.webhook_code;
    
    switch (code) {
      case 'ERROR':
        connection.status = 'error';
        connection.error = {
          code: payload.error?.error_code,
          message: payload.error?.error_message,
          displayMessage: payload.error?.display_message,
          occurredAt: new Date()
        };
        connection.updateHealth(false);
        break;
      
      case 'PENDING_EXPIRATION':
        // Send notification to user about upcoming expiration
        connection.status = 'requires_reauth';
        break;
      
      case 'USER_PERMISSION_REVOKED':
        connection.status = 'disconnected';
        break;
    }

    connection.addAuditEntry('updated', { webhookCode: code });
  }

  async handleAuthWebhook(connection, payload) {
    if (payload.webhook_code === 'AUTOMATICALLY_VERIFIED') {
      await LinkedAccount.updateMany(
        { bankConnection: connection._id },
        { 'verification.status': 'verified', 'verification.verifiedAt': new Date() }
      );
    }
  }

  // ==================== Helpers ====================

  mapAccountType(providerType) {
    const typeMap = {
      'depository': 'checking',
      'credit': 'credit',
      'loan': 'loan',
      'investment': 'investment',
      'mortgage': 'mortgage',
      'brokerage': 'brokerage'
    };
    return typeMap[providerType] || 'other';
  }

  /**
   * Get all connections for user
   */
  async getUserConnections(userId) {
    const connections = await BankConnection.find({ user: userId })
      .select('-accessToken -auditLog');
    
    const connectionsWithAccounts = await Promise.all(
      connections.map(async (conn) => {
        const accounts = await LinkedAccount.find({ bankConnection: conn._id });
        return {
          ...conn.toObject(),
          accounts: accounts.map(a => ({
            id: a._id,
            name: a.preferences.nickname || a.name,
            type: a.type,
            subtype: a.subtype,
            balance: a.balances.current,
            mask: a.mask
          }))
        };
      })
    );

    return connectionsWithAccounts;
  }

  /**
   * Get supported institutions
   */
  async searchInstitutions(query, provider = 'plaid', country = 'US') {
    const providerClient = this.providers[provider];
    return providerClient.searchInstitutions(query, country);
  }
}

// ==================== Provider Implementations ====================

class PlaidProvider {
  constructor() {
    this.clientId = process.env.PLAID_CLIENT_ID;
    this.secret = process.env.PLAID_SECRET;
    this.environment = process.env.PLAID_ENV || 'sandbox';
    this.baseUrl = this.getBaseUrl();
  }

  getBaseUrl() {
    const urls = {
      sandbox: 'https://sandbox.plaid.com',
      development: 'https://development.plaid.com',
      production: 'https://production.plaid.com'
    };
    return urls[this.environment];
  }

  async createLinkToken(userId, options = {}) {
    // In production, use actual Plaid SDK
    const response = await this.makeRequest('/link/token/create', {
      user: { client_user_id: userId.toString() },
      client_name: 'ExpenseFlow',
      products: options.products || ['transactions'],
      country_codes: options.countries || ['US'],
      language: options.language || 'en',
      ...(options.accessToken && { access_token: options.accessToken }),
      ...(options.updateMode && { update: { account_selection_enabled: true } })
    });

    return {
      linkToken: response.link_token,
      expiration: response.expiration
    };
  }

  async exchangePublicToken(publicToken) {
    const response = await this.makeRequest('/item/public_token/exchange', {
      public_token: publicToken
    });

    return {
      accessToken: response.access_token,
      itemId: response.item_id
    };
  }

  async getAccounts(accessToken) {
    const response = await this.makeRequest('/accounts/get', {
      access_token: accessToken
    });
    return response.accounts;
  }

  async getBalances(accessToken) {
    const response = await this.makeRequest('/accounts/balance/get', {
      access_token: accessToken
    });
    return response.accounts;
  }

  async getTransactions(accessToken, startDate, endDate, options = {}) {
    const response = await this.makeRequest('/transactions/get', {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: {
        count: options.count || 500,
        offset: options.offset || 0
      }
    });

    return {
      transactions: response.transactions,
      totalTransactions: response.total_transactions,
      accounts: response.accounts
    };
  }

  async syncTransactions(accessToken, cursor = null) {
    const response = await this.makeRequest('/transactions/sync', {
      access_token: accessToken,
      ...(cursor && { cursor })
    });

    return {
      added: response.added,
      modified: response.modified,
      removed: response.removed,
      nextCursor: response.next_cursor,
      hasMore: response.has_more
    };
  }

  async getInstitution(institutionId) {
    if (!institutionId) return null;
    
    const response = await this.makeRequest('/institutions/get_by_id', {
      institution_id: institutionId,
      country_codes: ['US']
    });
    return response.institution;
  }

  async searchInstitutions(query, country = 'US') {
    const response = await this.makeRequest('/institutions/search', {
      query,
      products: ['transactions'],
      country_codes: [country]
    });
    return response.institutions;
  }

  async removeItem(accessToken) {
    return this.makeRequest('/item/remove', {
      access_token: accessToken
    });
  }

  verifyWebhook(payload, signature) {
    // In production, implement proper webhook verification
    const crypto = require('crypto');
    const webhookSecret = process.env.PLAID_WEBHOOK_SECRET;
    
    if (!webhookSecret) return true; // Skip in development
    
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    return signature === expectedSignature;
  }

  async makeRequest(endpoint, data) {
    // Simulated response for development
    // In production, use actual HTTP client
    console.log(`Plaid API call: ${endpoint}`, data);
    
    // Return mock data for development
    return this.getMockResponse(endpoint, data);
  }

  getMockResponse(endpoint, data) {
    // Mock responses for development/testing
    const mocks = {
      '/link/token/create': {
        link_token: 'link-sandbox-' + Date.now(),
        expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      },
      '/item/public_token/exchange': {
        access_token: 'access-sandbox-' + Date.now(),
        item_id: 'item-' + Date.now()
      },
      '/accounts/get': {
        accounts: [
          {
            account_id: 'acc-checking-1',
            mask: '1234',
            name: 'Checking Account',
            official_name: 'Personal Checking',
            type: 'depository',
            subtype: 'checking',
            balances: { current: 5000, available: 4800, iso_currency_code: 'USD' }
          },
          {
            account_id: 'acc-savings-1',
            mask: '5678',
            name: 'Savings Account',
            official_name: 'High Yield Savings',
            type: 'depository',
            subtype: 'savings',
            balances: { current: 15000, available: 15000, iso_currency_code: 'USD' }
          }
        ]
      },
      '/accounts/balance/get': {
        accounts: [
          { account_id: 'acc-checking-1', balances: { current: 5100, available: 4900 } },
          { account_id: 'acc-savings-1', balances: { current: 15050, available: 15050 } }
        ]
      },
      '/transactions/sync': {
        added: [],
        modified: [],
        removed: [],
        next_cursor: 'cursor-' + Date.now(),
        has_more: false
      }
    };

    return mocks[endpoint] || {};
  }
}

class YodleeProvider {
  // Yodlee implementation (similar structure)
  async createLinkToken(userId, options = {}) {
    return { linkToken: 'yodlee-link-' + Date.now(), expiration: null };
  }
  
  async exchangePublicToken(publicToken) {
    return { accessToken: 'yodlee-access-' + Date.now(), itemId: 'yodlee-item-' + Date.now() };
  }
  
  async getAccounts(accessToken) { return []; }
  async getBalances(accessToken) { return []; }
  async getTransactions(accessToken, startDate, endDate) { return { transactions: [] }; }
  async getInstitution(id) { return null; }
  async searchInstitutions(query) { return []; }
  async removeItem(accessToken) { return {}; }
  verifyWebhook(payload, signature) { return true; }
}

class TrueLayerProvider {
  // TrueLayer implementation (similar structure)
  async createLinkToken(userId, options = {}) {
    return { linkToken: 'truelayer-link-' + Date.now(), expiration: null };
  }
  
  async exchangePublicToken(publicToken) {
    return { accessToken: 'truelayer-access-' + Date.now(), itemId: 'truelayer-item-' + Date.now() };
  }
  
  async getAccounts(accessToken) { return []; }
  async getBalances(accessToken) { return []; }
  async getTransactions(accessToken, startDate, endDate) { return { transactions: [] }; }
  async getInstitution(id) { return null; }
  async searchInstitutions(query) { return []; }
  async removeItem(accessToken) { return {}; }
  verifyWebhook(payload, signature) { return true; }
}

module.exports = new OpenBankingService();
