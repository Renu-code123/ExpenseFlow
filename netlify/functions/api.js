const express = require('express');
const serverless = require('serverless-http');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// Import routes
const authRoutes = require('../../routes/auth');
const expenseRoutes = require('../../routes/expenses');
const syncRoutes = require('../../routes/sync');
const splitsRoutes = require('../../routes/splits');
const groupsRoutes = require('../../routes/groups');
const clientRoutes = require('../../routes/clients');
const invoiceRoutes = require('../../routes/invoices');
const paymentRoutes = require('../../routes/payments');
const timeEntryRoutes = require('../../routes/time-entries');
const budgetRoutes = require('../../routes/budgets');
const goalRoutes = require('../../routes/goals');
const goalAnalyticsRoutes = require('../../routes/goals-analytics');
const analyticsRoutes = require('../../routes/analytics');

const currencyRoutes = require('../../routes/currency');
const notificationRoutes = require('../../routes/notifications');
const receiptRoutes = require('../../routes/receipts');
const forecastingRoutes = require('../../routes/forecasting');
const forecastRoutes = require('../../routes/forecast');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "https://your-netlify-site.netlify.app",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database connection
let isConnected = false;

const connectToDatabase = async () => {
  if (isConnected) return;

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    isConnected = true;
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
};

// Connect to DB before handling requests
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Routes
app.use('/auth', authRoutes);
app.use('/expenses', expenseRoutes);
app.use('/sync', syncRoutes);
app.use('/splits', splitsRoutes);
app.use('/groups', groupsRoutes);
app.use('/clients', clientRoutes);
app.use('/invoices', invoiceRoutes);
app.use('/payments', paymentRoutes);
app.use('/time-entries', timeEntryRoutes);
app.use('/budgets', budgetRoutes);
app.use('/goals', goalRoutes);
app.use('/goals', goalAnalyticsRoutes);
app.use('/analytics', analyticsRoutes);

app.use('/currency', currencyRoutes);
app.use('/notifications', notificationRoutes);
app.use('/receipts', receiptRoutes);
app.use('/forecasting', forecastingRoutes);
app.use('/forecast', forecastRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Export the serverless function
module.exports.handler = serverless(app);
