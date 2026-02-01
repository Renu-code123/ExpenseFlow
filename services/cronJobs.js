const cron = require('node-cron');
const User = require('../models/User');
const Expense = require('../models/Expense');
const BankConnection = require('../models/BankConnection');
const Account = require('../models/Account');
const BalanceHistory = require('../models/BalanceHistory');
const NetWorthSnapshot = require('../models/NetWorthSnapshot');
const emailService = require('../services/emailService');
const currencyService = require('../services/currencyService');
const InvoiceService = require('../services/invoiceService');
const ReminderService = require('../services/reminderService');
const intelligenceService = require('../services/intelligenceService');
const subscriptionService = require('../services/subscriptionService');
const wellnessService = require('../services/wellnessService');
const analysisEngine = require('../services/analysisEngine');

class CronJobs {
  static init() {
    // Process recurring expenses - Daily at 6 AM
    cron.schedule('0 6 * * *', async () => {
      console.log('[CronJobs] Processing recurring expenses...');
      await this.processRecurringExpenses();
    });

    // Send recurring expense reminders - Daily at 9 AM
    cron.schedule('0 9 * * *', async () => {
      console.log('[CronJobs] Sending recurring expense reminders...');
      await this.sendRecurringReminders();
    });
    
    // Generate recurring invoices - Daily at 6 AM
    cron.schedule('0 6 * * *', async () => {
      console.log('[CronJobs] Generating recurring invoices...');
      await this.generateRecurringInvoices();
    });
    
    // Send payment reminders - Daily at 10 AM
    cron.schedule('0 10 * * *', async () => {
      console.log('[CronJobs] Sending payment reminders...');
      await this.sendPaymentReminders();
    });
    
    // Apply late fees - Daily at 12 AM (midnight)
    cron.schedule('0 0 * * *', async () => {
      console.log('[CronJobs] Applying late fees to overdue invoices...');
      await this.applyLateFees();
    });

    // Weekly report - Every Sunday at 9 AM
    cron.schedule('0 9 * * 0', async () => {
      console.log('[CronJobs] Sending weekly reports...');
      await this.sendWeeklyReports();
    });
    
    // Daily intelligence analysis and insights - Every day at 8 AM
    cron.schedule('0 8 * * *', async () => {
      console.log('[CronJobs] Running daily intelligence analysis...');
      await this.runIntelligenceAnalysis();
    });

    // Monthly report - 1st day of month at 10 AM
    cron.schedule('0 10 1 * *', async () => {
      console.log('[CronJobs] Sending monthly reports...');
      await this.sendMonthlyReports();
    });

    // Budget alerts - Daily at 8 PM
    cron.schedule('0 20 * * *', async () => {
      console.log('[CronJobs] Checking budget alerts...');
      await this.checkBudgetAlerts();
    });

    // Update exchange rates - Every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      console.log('[CronJobs] Updating exchange rates...');
      await this.updateExchangeRates();
    });

    // Create daily balance snapshots - Daily at 11:55 PM
    cron.schedule('55 23 * * *', async () => {
      console.log('[CronJobs] Creating daily balance snapshots...');
      await this.createDailyBalanceSnapshots();
    });

    // Calculate net worth snapshots - Daily at 11:59 PM
    cron.schedule('59 23 * * *', async () => {
      console.log('[CronJobs] Creating net worth snapshots...');
      await this.createNetWorthSnapshots();
    });

    // Historical revaluation (update past snapshots with current rates) - Weekly on Sunday at 3 AM
    cron.schedule('0 3 * * 0', async () => {
      console.log('[CronJobs] Running historical revaluation...');
      await this.runHistoricalRevaluation();
    });

    // Quarterly tax estimate reminders - 1st of each quarter month at 9 AM
    cron.schedule('0 9 1 1,4,7,10 *', async () => {
      console.log('[CronJobs] Sending quarterly tax estimate reminders...');
      await this.sendQuarterlyTaxReminders();
    });

    // Year-end tax planning - December 1st at 9 AM
    cron.schedule('0 9 1 12 *', async () => {
      console.log('[CronJobs] Sending year-end tax planning reminders...');
      await this.sendYearEndTaxPlanningReminders();
    });

    // Tax document generation reminder - March 1st at 9 AM
    cron.schedule('0 9 1 3 *', async () => {
      console.log('[CronJobs] Sending tax document preparation reminders...');
      await this.sendTaxDocumentReminders();
    });

    // Process bill reminders - Daily at 9 AM
    cron.schedule('0 9 * * *', async () => {
      console.log('[CronJobs] Processing bill reminders...');
      await this.processBillReminders();
    });

    // Check overdue bills - Daily at midnight
    cron.schedule('0 0 * * *', async () => {
      console.log('[CronJobs] Checking overdue bills...');
      await this.checkOverdueBills();
    });

    // Process auto-pay bills - Daily at 6 AM
    cron.schedule('0 6 * * *', async () => {
      console.log('[CronJobs] Processing auto-pay bills...');
      await this.processAutoPayBills();
    });

    // Sync calendar events - Daily at 6 AM
    cron.schedule('0 6 * * *', async () => {
      console.log('[CronJobs] Syncing calendar events...');
      await this.syncCalendarEvents();
    });

    // Process pending reminders - Every hour
    cron.schedule('0 * * * *', async () => {
      console.log('[CronJobs] Processing pending reminders...');
      await this.processPendingReminders();
    });

    // Send subscription renewal reminders - Daily at 8 AM
    cron.schedule('0 8 * * *', async () => {
      console.log('[CronJobs] Sending subscription renewal reminders...');
      await this.sendSubscriptionReminders();
    });

    // Send trial ending reminders - Daily at 9 AM
    cron.schedule('0 9 * * *', async () => {
      console.log('[CronJobs] Sending trial ending reminders...');
      await this.sendTrialReminders();
    });

    // Financial wellness deep scan - Weekly on Sunday at 2 AM (Issue #481)
    cron.schedule('0 2 * * 0', async () => {
      console.log('[CronJobs] Running weekly financial wellness scan...');
      await this.runWeeklyWellnessScan();
    });

    // Daily smart insights generation - Every day at 7 AM (Issue #481)
    cron.schedule('0 7 * * *', async () => {
      console.log('[CronJobs] Generating daily smart insights...');
      await this.generateDailyInsights();
    });

    console.log('Cron jobs initialized successfully');
  }

  static async processRecurringExpenses() {
    console.log('Processing recurring expenses (Placeholder)');
    // Implementation would go here
  }

  static async sendRecurringReminders() {
    console.log('Sending recurring reminders (Placeholder)');
    // Implementation would go here
  }
  
  static async generateRecurringInvoices() {
    try {
      console.log('[CronJobs] Generating recurring invoices...');
      const result = await InvoiceService.generateRecurringInvoices();
      console.log(`[CronJobs] Generated ${result.count} recurring invoices`);
    } catch (error) {
      console.error('[CronJobs] Error generating recurring invoices:', error);
    }
  }
  
  static async sendPaymentReminders() {
    try {
      console.log('[CronJobs] Sending payment reminders...');
      const result = await ReminderService.processAllReminders();
      console.log(`[CronJobs] Sent ${result.success.length} reminders, ${result.failed.length} failed`);
    } catch (error) {
      console.error('[CronJobs] Error sending payment reminders:', error);
    }
  }
  
  static async applyLateFees() {
    try {
      console.log('[CronJobs] Applying late fees...');
      const User = require('../models/User');
      const users = await User.find({});
      
      let totalApplied = 0;
      for (const user of users) {
        try {
          const result = await InvoiceService.applyLateFees(user._id);
          totalApplied += result.count;
        } catch (error) {
          console.error(`[CronJobs] Error applying late fees for user ${user._id}:`, error);
        }
      }
      
      console.log(`[CronJobs] Applied late fees to ${totalApplied} invoices`);
    } catch (error) {
      console.error('[CronJobs] Error applying late fees:', error);
    }
  }
  
  static async generateRecurringInvoices() {
    try {
      console.log('[CronJobs] Generating recurring invoices...');
      const result = await InvoiceService.generateRecurringInvoices();
      console.log(`[CronJobs] Generated ${result.count} recurring invoices`);
    } catch (error) {
      console.error('[CronJobs] Error generating recurring invoices:', error);
    }
  }
  
  static async sendPaymentReminders() {
    try {
      console.log('[CronJobs] Sending payment reminders...');
      const result = await ReminderService.processAllReminders();
      console.log(`[CronJobs] Sent ${result.success.length} reminders, ${result.failed.length} failed`);
    } catch (error) {
      console.error('[CronJobs] Error sending payment reminders:', error);
    }
  }
  
  static async applyLateFees() {
    try {
      console.log('[CronJobs] Applying late fees...');
      const User = require('../models/User');
      const users = await User.find({});
      
      let totalApplied = 0;
      for (const user of users) {
        try {
          const result = await InvoiceService.applyLateFees(user._id);
          totalApplied += result.count;
        } catch (error) {
          console.error(`[CronJobs] Error applying late fees for user ${user._id}:`, error);
        }
      }
      
      console.log(`[CronJobs] Applied late fees to ${totalApplied} invoices`);
    } catch (error) {
      console.error('[CronJobs] Error applying late fees:', error);
    }
  }

  static async updateExchangeRates() {
    try {
      // Fetch all rates (fiat + crypto)
      const result = await currencyService.fetchAllRates();
      
      if (result.fiat) {
        console.log('[CronJobs] Fiat exchange rates updated successfully');
      }
      
      if (result.crypto) {
        console.log('[CronJobs] Crypto prices updated successfully');
      }

      console.log('[CronJobs] Exchange rates update completed');
    } catch (error) {
      console.error('[CronJobs] Exchange rates update error:', error);
    }
  }

  /**
   * Create daily balance snapshots for all accounts
   * Issue #337: Multi-Account Liquidity Management
   */
  static async createDailyBalanceSnapshots() {
    try {
      const accounts = await Account.find({ isActive: true });
      let successCount = 0;
      let errorCount = 0;

      for (const account of accounts) {
        try {
          await BalanceHistory.createDailySnapshot(account);
          successCount++;
        } catch (error) {
          console.error(`[CronJobs] Failed to create snapshot for account ${account._id}:`, error.message);
          errorCount++;
        }
      }

      console.log(`[CronJobs] Daily balance snapshots: ${successCount} successful, ${errorCount} failed`);
    } catch (error) {
      console.error('[CronJobs] Daily balance snapshots error:', error);
    }
  }

  /**
   * Create net worth snapshots for all users
   * Issue #337: Historical Revaluation Engine
   */
  static async createNetWorthSnapshots() {
    try {
      // Get all users with active accounts
      const usersWithAccounts = await Account.distinct('userId', { isActive: true });
      let successCount = 0;
      let errorCount = 0;

      // Ensure we have latest exchange rates
      await currencyService.fetchAllRates().catch(() => {});
      const rates = await currencyService.getAllRates('USD');

      for (const userId of usersWithAccounts) {
        try {
          // Get user's accounts
          const accounts = await Account.find({
            userId,
            isActive: true,
            includeInNetWorth: true
          });

          if (accounts.length === 0) continue;

          // Determine user's preferred base currency (default USD)
          const user = await User.findById(userId);
          const baseCurrency = user?.preferences?.currency || 'USD';

          // Create snapshot
          await NetWorthSnapshot.createSnapshot(userId, accounts, rates.rates, baseCurrency);
          successCount++;
        } catch (error) {
          console.error(`[CronJobs] Failed to create net worth snapshot for user ${userId}:`, error.message);
          errorCount++;
        }
      }

      console.log(`[CronJobs] Net worth snapshots: ${successCount} successful, ${errorCount} failed`);
    } catch (error) {
      console.error('[CronJobs] Net worth snapshots error:', error);
    }
  }

  /**
   * Historical Revaluation - Update past snapshots with exchange rate changes
   * Issue #337: Historical Revaluation Engine
   */
  static async runHistoricalRevaluation() {
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      // Get current rates
      await currencyService.fetchAllRates().catch(() => {});
      const currentRates = await currencyService.getAllRates('USD');

      // Find snapshots from the past week that might need revaluation
      const snapshots = await NetWorthSnapshot.find({
        date: { $gte: oneWeekAgo },
        'dataQuality.missingRates.0': { $exists: true } // Has missing rates
      });

      let updatedCount = 0;

      for (const snapshot of snapshots) {
        const missingRates = snapshot.dataQuality?.missingRates || [];
        let hasUpdates = false;

        for (const currency of missingRates) {
          if (currentRates.rates[currency]) {
            snapshot.exchangeRates.set(currency, currentRates.rates[currency]);
            hasUpdates = true;
          }
        }

        if (hasUpdates) {
          // Recalculate totals with new rates
          let totalAssets = 0;
          let totalLiabilities = 0;

          for (const account of snapshot.accounts) {
            const rate = account.currency === snapshot.baseCurrency ? 1 :
              (snapshot.exchangeRates.get(account.currency) || currentRates.rates[account.currency] || 1);
            
            const balanceInBase = account.balance * rate;
            const effectiveBalance = ['credit_card', 'loan'].includes(account.type)
              ? -Math.abs(balanceInBase)
              : balanceInBase;

            account.balanceInBaseCurrency = effectiveBalance;
            account.exchangeRate = rate;

            if (effectiveBalance >= 0) {
              totalAssets += effectiveBalance;
            } else {
              totalLiabilities += Math.abs(effectiveBalance);
            }
          }

          snapshot.totalAssets = totalAssets;
          snapshot.totalLiabilities = totalLiabilities;
          snapshot.totalNetWorth = totalAssets - totalLiabilities;
          snapshot.dataQuality.missingRates = missingRates.filter(
            c => !currentRates.rates[c]
          );
          snapshot.snapshotSource = 'revaluation';

          await snapshot.save();
          updatedCount++;
        }
      }

      console.log(`[CronJobs] Historical revaluation: ${updatedCount} snapshots updated`);
    } catch (error) {
      console.error('[CronJobs] Historical revaluation error:', error);
    }
  }

  static async sendWeeklyReports() {
    try {
      const users = await User.find({});
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      for (const user of users) {
        const weeklyExpenses = await Expense.aggregate([
          {
            $match: {
              user: user._id,
              date: { $gte: oneWeekAgo },
              type: 'expense'
            }
          },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
              amount: { $sum: '$amount' }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        const totalSpent = weeklyExpenses.reduce((sum, day) => sum + day.amount, 0);
        const avgDaily = totalSpent / 7;

        const reportData = {
          weeklyExpenses: weeklyExpenses.map(day => ({
            date: day._id,
            amount: day.amount
          })),
          totalSpent,
          avgDaily
        };

        await emailService.sendWeeklyReport(user, reportData);
      }
    } catch (error) {
      console.error('Weekly report error:', error);
    }
  }

  static async sendMonthlyReports() {
    try {
      const users = await User.find({});
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      for (const user of users) {
        const monthlyData = await Expense.aggregate([
          {
            $match: {
              user: user._id,
              date: { $gte: startOfMonth }
            }
          },
          {
            $group: {
              _id: '$type',
              total: { $sum: '$amount' }
            }
          }
        ]);

        const categoryData = await Expense.aggregate([
          {
            $match: {
              user: user._id,
              date: { $gte: startOfMonth },
              type: 'expense'
            }
          },
          {
            $group: {
              _id: '$category',
              amount: { $sum: '$amount' }
            }
          },
          { $sort: { amount: -1 } },
          { $limit: 5 }
        ]);

        const totalExpenses = monthlyData.find(d => d._id === 'expense')?.total || 0;
        const totalIncome = monthlyData.find(d => d._id === 'income')?.total || 0;
        const balance = totalIncome - totalExpenses;

        const reportData = {
          totalExpenses,
          totalIncome,
          balance,
          topCategories: categoryData.map(cat => ({
            name: cat._id,
            amount: cat.amount
          }))
        };

        await emailService.sendMonthlyReport(user, reportData);
      }
    } catch (error) {
      console.error('Monthly report error:', error);
    }
  }

  static async checkBudgetAlerts() {
    try {
      // This would require a Budget model - simplified version
      const users = await User.find({});
      const startOfMonth = new Date();
      startOfMonth.setDate(1);

      for (const user of users) {
        const categorySpending = await Expense.aggregate([
          {
            $match: {
              user: user._id,
              date: { $gte: startOfMonth },
              type: 'expense'
            }
          },
          {
            $group: {
              _id: '$category',
              spent: { $sum: '$amount' }
            }
          }
        ]);

        // Example budget limits (in real app, this would come from Budget model)
        const budgetLimits = {
          food: 10000,
          transport: 5000,
          entertainment: 3000,
          shopping: 8000
        };

        for (const category of categorySpending) {
          const budget = budgetLimits[category._id];
          if (budget && category.spent > budget * 0.8) { // 80% threshold
            await emailService.sendBudgetAlert(
              user,
              category._id,
              category.spent,
              budget
            );
          }
        }
      }
    } catch (error) {
      console.error('Budget alert error:', error);
    }
  }

  static async sendQuarterlyTaxReminders() {
    try {
      const profiles = await TaxProfile.getProfilesNeedingQuarterlyEstimates();
      
      for (const profile of profiles) {
        const upcomingPayments = profile.estimated_tax_payments.filter(
          p => !p.paid && p.due_date >= new Date() && p.due_date <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        );
        
        if (upcomingPayments.length > 0) {
          for (const payment of upcomingPayments) {
            await emailService.sendEmail({
              to: profile.user.email,
              subject: `Q${payment.quarter} Estimated Tax Payment Due`,
              html: `
                <h2>Quarterly Estimated Tax Payment Reminder</h2>
                <p>Hi ${profile.user.name},</p>
                <p>Your Q${payment.quarter} estimated tax payment of <strong>₹${payment.amount.toFixed(2)}</strong> is due on ${payment.due_date.toDateString()}.</p>
                <p>Please make sure to submit your payment before the deadline to avoid penalties.</p>
                <p><a href="${process.env.FRONTEND_URL}/tax/estimated">View Payment Details</a></p>
              `
            });
          }
        }
      }
      
      console.log(`Sent quarterly tax reminders to ${profiles.length} users`);
    } catch (error) {
      console.error('Quarterly tax reminder error:', error);
    }
  }

  static async sendYearEndTaxPlanningReminders() {
    try {
      const users = await User.find({});
      const currentYear = new Date().getFullYear();
      
      for (const user of users) {
        try {
          const profile = await TaxProfile.getUserProfile(user._id);
          
          if (profile) {
            // Generate year-end checklist
            const harvest = await taxOptimizationService.identifyTaxLossHarvestingOpportunities(user._id, currentYear);
            const contributionRoom = taxOptimizationService.calculateContributionRoom(profile);
            
            await emailService.sendEmail({
              to: user.email,
              subject: 'Year-End Tax Planning Checklist',
              html: `
                <h2>Year-End Tax Planning Reminders</h2>
                <p>Hi ${user.name},</p>
                <p>As we approach the end of the year, here are some tax optimization opportunities:</p>
                <ul>
                  ${harvest.length > 0 ? `<li><strong>Tax Loss Harvesting:</strong> ${harvest.length} opportunities identified with potential savings of ₹${harvest[0].potential_savings?.toFixed(2) || 0}</li>` : ''}
                  ${contributionRoom.total > 0 ? `<li><strong>Retirement Contributions:</strong> ₹${contributionRoom.total.toFixed(2)} remaining contribution room</li>` : ''}
                  <li><strong>Charitable Donations:</strong> Make contributions before December 31st</li>
                  <li><strong>Business Expenses:</strong> Review and document all deductible expenses</li>
                </ul>
                <p>Deadline: December 31, ${currentYear}</p>
                <p><a href="${process.env.FRONTEND_URL}/tax/year-end">View Full Checklist</a></p>
              `
            });
          }
        } catch (userError) {
          console.error(`Error processing user ${user._id}:`, userError);
        }
      }
      
      console.log(`Sent year-end tax planning reminders to ${users.length} users`);
    } catch (error) {
      console.error('Year-end tax planning reminder error:', error);
    }
  }

  static async sendTaxDocumentReminders() {
    try {
      const users = await User.find({});
      const lastYear = new Date().getFullYear() - 1;
      
      for (const user of users) {
        const profile = await TaxProfile.getUserProfile(user._id);
        
        if (profile) {
          await emailService.sendEmail({
            to: user.email,
            subject: `${lastYear} Tax Document Preparation`,
            html: `
              <h2>Tax Season is Here!</h2>
              <p>Hi ${user.name},</p>
              <p>It's time to prepare your ${lastYear} tax documents. ExpenseFlow can help you generate:</p>
              <ul>
                <li>Tax Summary Report</li>
                <li>Capital Gains Schedule (Schedule D)</li>
                <li>Business Income & Expenses (Schedule C)</li>
                <li>Year-End Tax Optimization Report</li>
              </ul>
              <p>Filing Deadline: April 15, ${new Date().getFullYear()}</p>
              <p><a href="${process.env.FRONTEND_URL}/tax/documents">Generate Tax Documents</a></p>
            `
          });
        }
      }
      
      console.log(`Sent tax document reminders to ${users.length} users`);
    } catch (error) {
      console.error('Tax document reminder error:', error);
    }
  }

  static async processBillReminders() {
    try {
      const BillService = require('./billService');
      const result = await BillService.sendBillReminders();
      console.log(`[CronJobs] Bill reminders processed: ${result.success.length} sent, ${result.failed.length} failed`);
    } catch (error) {
      console.error('[CronJobs] Bill reminders error:', error);
    }
  }

  static async checkOverdueBills() {
    try {
      const Bill = require('../models/Bill');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Update bills that are now overdue
      const result = await Bill.updateMany(
        {
          status: 'active',
          next_due_date: { $lt: today }
        },
        {
          status: 'overdue'
        }
      );
      
      console.log(`[CronJobs] Updated ${result.modifiedCount} bills to overdue status`);
      
      // Create overdue reminders
      const overdueBills = await Bill.find({ status: 'overdue' }).populate('user', 'email name');
      const ReminderSchedule = require('../models/ReminderSchedule');
      
      for (const bill of overdueBills) {
        await ReminderSchedule.createOverdueReminder(bill);
      }
      
      console.log(`[CronJobs] Created overdue reminders for ${overdueBills.length} bills`);
    } catch (error) {
      console.error('[CronJobs] Check overdue bills error:', error);
    }
  }

  static async processAutoPayBills() {
    try {
      const BillService = require('./billService');
      const result = await BillService.processAutoPay();
      console.log(`[CronJobs] Auto-pay processed: ${result.success.length} successful, ${result.failed.length} failed`);
    } catch (error) {
      console.error('[CronJobs] Auto-pay processing error:', error);
    }
  }

  static async syncCalendarEvents() {
    try {
      const User = require('../models/User');
      const CalendarEvent = require('../models/CalendarEvent');
      
      const users = await User.find({});
      
      for (const user of users) {
        try {
          await CalendarEvent.syncBillEvents(user._id);
        } catch (userError) {
          console.error(`[CronJobs] Calendar sync error for user ${user._id}:`, userError);
        }
      }
      
      console.log(`[CronJobs] Calendar synced for ${users.length} users`);
    } catch (error) {
      console.error('[CronJobs] Calendar sync error:', error);
    }
  }

  static async processPendingReminders() {
    try {
      const ReminderService = require('./billReminderService');
      const result = await ReminderService.processPendingReminders();
      console.log(`[CronJobs] Reminders processed: ${result.success.length} sent, ${result.failed.length} failed`);
    } catch (error) {
      console.error('[CronJobs] Pending reminders error:', error);
    }
  }
  
  static async runIntelligenceAnalysis() {
    try {
      const users = await User.find({ 
        intelligencePreferences: { $exists: true },
        'intelligencePreferences.enablePredictiveAnalysis': true 
      });
      
      let analyzed = 0;
      let alertsSent = 0;
      
      for (const user of users) {
        try {
          // Generate insights
          const insights = await intelligenceService.generateInsights(user._id);
          
          // Send email for critical alerts
          const criticalInsights = insights.insights.filter(i => i.priority === 'critical' || i.priority === 'high');
          
          if (criticalInsights.length > 0 && user.intelligencePreferences.emailAlerts) {
            await emailService.sendEmail({
              to: user.email,
              subject: `⚠️ ExpenseFlow: ${criticalInsights.length} Important Financial Alert${criticalInsights.length > 1 ? 's' : ''}`,
              template: 'intelligence-alert',
              data: {
                userName: user.name,
                insights: criticalInsights,
                insightCount: criticalInsights.length
              }
            });
            alertsSent++;
          }
          
          analyzed++;
        } catch (userError) {
          console.error(`[CronJobs] Intelligence analysis error for user ${user._id}:`, userError);
        }
      }
      
      console.log(`[CronJobs] Intelligence analysis complete: ${analyzed} users analyzed, ${alertsSent} alerts sent`);
    } catch (error) {
      console.error('[CronJobs] Intelligence analysis error:', error);
    }
  }

  static async sendSubscriptionReminders() {
    try {
      const count = await subscriptionService.sendRenewalReminders();
      console.log(`[CronJobs] Sent ${count} subscription renewal reminders`);
    } catch (error) {
      console.error('[CronJobs] Error sending subscription reminders:', error);
    }
  }

  static async sendTrialReminders() {
    try {
      const count = await subscriptionService.sendTrialReminders();
      console.log(`[CronJobs] Sent ${count} trial ending reminders`);
    } catch (error) {
      console.error('[CronJobs] Error sending trial reminders:', error);
    }
  }

  static async runWeeklyWellnessScan() {
    try {
      console.log('[CronJobs] Starting weekly wellness scan...');
      const User = require('../models/User');
      const users = await User.find({});
      
      let scanned = 0;
      let scoresGenerated = 0;
      
      for (const user of users) {
        try {
          // Calculate health score
          const healthScore = await wellnessService.calculateHealthScore(user._id, { timeWindow: 30 });
          
          // Run comprehensive analysis
          await analysisEngine.runComprehensiveAnalysis(user._id);
          
          scoresGenerated++;
          scanned++;
        } catch (userError) {
          console.error(`[CronJobs] Wellness scan error for user ${user._id}:`, userError);
        }
      }
      
      console.log(`[CronJobs] Weekly wellness scan complete: ${scanned} users scanned, ${scoresGenerated} scores generated`);
    } catch (error) {
      console.error('[CronJobs] Weekly wellness scan error:', error);
    }
  }

  static async generateDailyInsights() {
    try {
      console.log('[CronJobs] Generating daily insights...');
      const User = require('../models/User');
      const users = await User.find({});
      
      let processed = 0;
      let insightsGenerated = 0;
      
      for (const user of users) {
        try {
          // Analyze spending velocity
          const velocityResult = await analysisEngine.analyzeSpendingVelocity(user._id, { timeWindow: 7 });
          insightsGenerated += velocityResult.insights?.length || 0;
          
          // Analyze budget predictions
          const budgetResult = await analysisEngine.analyzeBudgetPredictions(user._id);
          insightsGenerated += budgetResult.insights?.length || 0;
          
          processed++;
        } catch (userError) {
          console.error(`[CronJobs] Insight generation error for user ${user._id}:`, userError);
        }
      }
      
      console.log(`[CronJobs] Daily insights complete: ${processed} users processed, ${insightsGenerated} insights generated`);
    } catch (error) {
      console.error('[CronJobs] Daily insights error:', error);
    }
  }
}

module.exports = CronJobs;
