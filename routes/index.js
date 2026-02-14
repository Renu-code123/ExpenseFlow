/**
 * Route Registrations
 * Consolidates all route modules into a single file
 */

const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./auth');
const expenseRoutes = require('./expenses');
const expenseCreationRoutes = require('./expenseCreation');
const expenseUpdateRoutes = require('./expenseUpdate');
const expenseExportRoutes = require('./expenseExport');
const syncRoutes = require('./sync');
const splitsRoutes = require('./splits');
const groupsRoutes = require('./groups');
const clientRoutes = require('./clients');
const invoiceRoutes = require('./invoices');
const paymentRoutes = require('./payments');
const timeEntryRoutes = require('./time-entries');
const notificationRoutes = require('./notifications');
const receiptRoutes = require('./receipts');
const budgetRoutes = require('./budgets');
const goalRoutes = require('./goals');
const analyticsRoutes = require('./analytics');
const currencyRoutes = require('./currency');

// Import rate limiters from config/middleware
const { authLimiter, expenseLimiter, uploadLimiter } = require('../config/middleware');

/**
 * Register all routes with the router
 * @param {express.Application} app - Express application instance
 */
function configureRoutes(app) {
  // Auth routes with rate limiting
  app.use('/api/auth', authLimiter, authRoutes);

  // Expense routes with rate limiting
  app.use('/api/expenses', expenseLimiter, expenseRoutes);
  app.use('/api/expenses', expenseLimiter, expenseCreationRoutes);
  app.use('/api/expenses', expenseLimiter, expenseUpdateRoutes);
  app.use('/api/expenses', expenseLimiter, expenseExportRoutes);

  // Sync routes
  app.use('/api/sync', syncRoutes);

  // Notification routes
  app.use('/api/notifications', require('./notifications'));

  // Receipt routes with upload rate limiting
  app.use('/api/receipts', uploadLimiter, require('./receipts'));

  // Budget routes
  app.use('/api/budgets', require('./budgets'));

  // Goal routes
  app.use('/api/goals', require('./goals'));

  // Analytics routes
  app.use('/api/analytics', require('./analytics'));

  // Currency routes
  app.use('/api/currency', require('./currency'));

  // Split routes with rate limiting
  app.use('/api/splits', expenseLimiter, splitsRoutes);

  // Group routes with rate limiting
  app.use('/api/groups', expenseLimiter, groupsRoutes);

  // Client routes with rate limiting
  app.use('/api/clients', expenseLimiter, clientRoutes);

  // Invoice routes with rate limiting
  app.use('/api/invoices', expenseLimiter, invoiceRoutes);

  // Payment routes with rate limiting
  app.use('/api/payments', expenseLimiter, paymentRoutes);

  // Time entry routes with rate limiting
  app.use('/api/time-entries', expenseLimiter, timeEntryRoutes);

  // Additional routes from the original server.js
  // These might not exist yet, but are included for completeness
  // app.use('/api/shared-budgets', expenseLimiter, require('./sharedBudgets'));
  // app.use('/api/workspaces', require('./workspaces'));
  // app.use('/api/recurring', require('./recurring'));
  // app.use('/api/reports', require('./reports'));
  // app.use('/api/approvals', require('./approvals'));
  // app.use('/api/tax', require('./tax'));
  // app.use('/api/forecast', require('./forecasting'));
  // app.use('/api/ai', require('./ai'));
  // app.use('/api/insights', require('./insights'));
  // app.use('/api/gamification', require('./gamification'));
  // app.use('/api/investments', require('./investments'));
  // app.use('/api/portfolios', require('./portfolios'));
  // app.use('/api/open-banking', require('./openBanking'));
  // app.use('/api/integrations', require('./integrations'));
  // app.use('/api/security', require('./security'));
  // app.use('/api/audit-compliance', require('./auditCompliance'));
  // app.use('/api/fraud-detection', require('./fraudDetection'));
  // app.use('/api/subscriptions', require('./subscriptions'));
  // app.use('/api/accounting', require('./accounting'));
  // app.use('/api/collaboration', require('./collaboration'));
  // app.use('/api/contact', require('./contact'));
  // app.use('/api/export', require('./export'));
  // app.use('/api/multicurrency', require('./multicurrency'));
  // app.use('/api/shared-spaces', require('./sharedSpaces'));
}

module.exports = {
  configureRoutes
};
