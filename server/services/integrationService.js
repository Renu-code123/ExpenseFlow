const Integration = require('../models/Integration');
const axios = require('axios');

class IntegrationService {
  async connectQuickBooks(userId, authCode) {
    const integration = new Integration({
      user: userId,
      type: 'accounting',
      provider: 'quickbooks',
      credentials: { accessToken: authCode },
      status: 'active'
    });
    return await integration.save();
  }

  async connectStripe(userId, apiKey) {
    const integration = new Integration({
      user: userId,
      type: 'payment',
      provider: 'stripe',
      credentials: { apiKey },
      status: 'active'
    });
    return await integration.save();
  }

  async syncBankTransactions(userId) {
    const bankIntegrations = await Integration.find({ 
      user: userId, 
      type: 'bank', 
      status: 'active' 
    });

    for (const integration of bankIntegrations) {
      try {
        // Mock bank API call
        const transactions = await this.fetchBankTransactions(integration);
        await this.processTransactions(userId, transactions);
        
        integration.lastSync = new Date();
        integration.syncCount++;
        await integration.save();
      } catch (error) {
        integration.status = 'error';
        await integration.save();
      }
    }
  }

  async fetchBankTransactions(integration) {
    // Mock implementation - would call actual bank API
    return [
      { amount: 25.50, description: 'Coffee Shop', date: new Date() },
      { amount: 120.00, description: 'Grocery Store', date: new Date() }
    ];
  }

  async processTransactions(userId, transactions) {
    const Expense = require('../models/Expense');
    
    for (const transaction of transactions) {
      const expense = new Expense({
        user: userId,
        amount: transaction.amount,
        description: transaction.description,
        date: transaction.date,
        category: 'other',
        type: 'expense',
        source: 'bank_sync'
      });
      await expense.save();
    }
  }

  async exportToQuickBooks(userId, expenses) {
    const integration = await Integration.findOne({ 
      user: userId, 
      provider: 'quickbooks',
      status: 'active'
    });

    if (!integration) throw new Error('QuickBooks not connected');

    // Mock QuickBooks API call
    return { success: true, exported: expenses.length };
  }
}

module.exports = new IntegrationService();