const axios = require('axios');
const OAuthClient = require('intuit-oauth');
const { XeroClient } = require('xero-node');
const AccountingConnection = require('../models/AccountingConnection');
const Expense = require('../models/Expense');

class AccountingService {
  constructor() {
    // QuickBooks OAuth client
    this.qbClient = new OAuthClient({
      clientId: process.env.QUICKBOOKS_CLIENT_ID,
      clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
      redirectUri: process.env.QUICKBOOKS_REDIRECT_URI,
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
    });

    // Xero client
    this.xeroClient = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID,
      clientSecret: process.env.XERO_CLIENT_SECRET,
      redirectUris: [process.env.XERO_REDIRECT_URI],
      scopes: ['accounting.transactions', 'accounting.contacts']
    });
  }

  // QuickBooks methods
  async getQuickBooksAuthUrl(userId) {
    const authUri = this.qbClient.authorizeUri({
      scope: ['com.intuit.quickbooks.accounting'],
      state: `user_${userId}`
    });
    return authUri;
  }

  async handleQuickBooksCallback(code, state) {
    const userId = state.replace('user_', '');
    const authResponse = await this.qbClient.createToken(code);
    const tokenData = authResponse.getJson();

    const connection = new AccountingConnection({
      user: userId,
      platform: 'quickbooks',
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      realmId: tokenData.realmId,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
    });

    await connection.save();
    return connection;
  }

  async refreshQuickBooksToken(connection) {
    this.qbClient.setToken({
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
      token_type: 'Bearer',
      expires_in: Math.floor((connection.expiresAt - Date.now()) / 1000)
    });

    const authResponse = await this.qbClient.refresh();
    const tokenData = authResponse.getJson();

    connection.accessToken = tokenData.access_token;
    connection.refreshToken = tokenData.refresh_token;
    connection.expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    await connection.save();

    return connection;
  }

  // Xero methods
  async getXeroAuthUrl(userId) {
    const consentUrl = await this.xeroClient.buildConsentUrl();
    return `${consentUrl}&state=user_${userId}`;
  }

  async handleXeroCallback(code, state) {
    const userId = state.replace('user_', '');
    const tokenSet = await this.xeroClient.apiCallback(code);

    const connections = await this.xeroClient.updateTenants();
    const tenantId = connections[0].tenantId;

    const connection = new AccountingConnection({
      user: userId,
      platform: 'xero',
      accessToken: tokenSet.access_token,
      refreshToken: tokenSet.refresh_token,
      tenantId: tenantId,
      expiresAt: new Date(Date.now() + tokenSet.expires_in * 1000)
    });

    await connection.save();
    return connection;
  }

  async refreshXeroToken(connection) {
    await this.xeroClient.setTokenSet({
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
      expires_at: connection.expiresAt.getTime() / 1000
    });

    const tokenSet = await this.xeroClient.refreshToken();
    connection.accessToken = tokenSet.access_token;
    connection.refreshToken = tokenSet.refresh_token;
    connection.expiresAt = new Date(tokenSet.expires_at * 1000);
    await connection.save();

    return connection;
  }

  // Sync expenses to accounting platform
  async syncExpensesToAccounting(userId, platform) {
    const connection = await AccountingConnection.findOne({ user: userId, platform });
    if (!connection) throw new Error('No accounting connection found');

    // Refresh token if needed
    if (connection.expiresAt < new Date()) {
      if (platform === 'quickbooks') {
        await this.refreshQuickBooksToken(connection);
      } else {
        await this.refreshXeroToken(connection);
      }
    }

    const expenses = await Expense.find({ user: userId, syncedToAccounting: { $ne: true } });

    for (const expense of expenses) {
      if (platform === 'quickbooks') {
        await this.syncToQuickBooks(expense, connection);
      } else {
        await this.syncToXero(expense, connection);
      }
      expense.syncedToAccounting = true;
      await expense.save();
    }

    return { synced: expenses.length };
  }

  async syncToQuickBooks(expense, connection) {
    // Implement QuickBooks API call to create expense
    const qbUrl = `https://quickbooks.api.intuit.com/v3/company/${connection.realmId}/purchase`;

    const expenseData = {
      "AccountRef": {
        "value": "1", // Default expense account
        "name": "Expense"
      },
      "PaymentType": "Cash",
      "TxnDate": expense.date.toISOString().split('T')[0],
      "Line": [{
        "Amount": expense.amount,
        "DetailType": "AccountBasedExpenseLineDetail",
        "AccountBasedExpenseLineDetail": {
          "AccountRef": {
            "value": "1"
          }
        }
      }]
    };

    await axios.post(qbUrl, expenseData, {
      headers: {
        'Authorization': `Bearer ${connection.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async syncToXero(expense, connection) {
    // Implement Xero API call
    await this.xeroClient.setTokenSet({
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken
    });

    const expenseData = {
      Type: 'ACCPAY',
      Contact: {
        Name: expense.merchant || 'Expense'
      },
      Date: expense.date.toISOString().split('T')[0],
      DueDate: expense.date.toISOString().split('T')[0],
      LineItems: [{
        Description: expense.description,
        Quantity: 1,
        UnitAmount: expense.amount,
        AccountCode: '400' // Expense account
      }],
      Status: 'AUTHORISED'
    };

    await this.xeroClient.accountingApi.createInvoices(connection.tenantId, { invoices: [expenseData] });
  }

  // Get connected platforms for user
  async getUserConnections(userId) {
    return await AccountingConnection.find({ user: userId });
  }

  // Disconnect platform
  async disconnectPlatform(userId, platform) {
    await AccountingConnection.findOneAndDelete({ user: userId, platform });
  }
}

module.exports = new AccountingService();