const mongoose = require('mongoose');

const dataWarehouseSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  period: {
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    week: Number,
    day: Number
  },
  granularity: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
    required: true
  },
  metrics: {
    totalExpenses: { type: Number, default: 0 },
    totalIncome: { type: Number, default: 0 },
    netCashFlow: { type: Number, default: 0 },
    transactionCount: { type: Number, default: 0 },
    averageTransactionSize: { type: Number, default: 0 },
    categoryBreakdown: [{
      category: String,
      amount: Number,
      percentage: Number,
      transactionCount: Number
    }],
    budgetUtilization: { type: Number, default: 0 },
    savingsRate: { type: Number, default: 0 }
  },
  trends: {
    expenseGrowth: { type: Number, default: 0 },
    incomeGrowth: { type: Number, default: 0 },
    volatility: { type: Number, default: 0 },
    seasonality: { type: Number, default: 0 }
  },
  kpis: {
    burnRate: { type: Number, default: 0 },
    runwayMonths: { type: Number, default: 0 },
    expenseRatio: { type: Number, default: 0 },
    diversificationIndex: { type: Number, default: 0 }
  },
  benchmarks: {
    industryAverage: { type: Number, default: 0 },
    peerComparison: { type: Number, default: 0 },
    historicalPerformance: { type: Number, default: 0 }
  },
  anomalies: [{
    type: {
      type: String,
      enum: ['spike', 'drop', 'pattern_break', 'outlier']
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    },
    description: String,
    value: Number,
    expectedValue: Number,
    confidence: Number
  }],
  predictions: {
    nextPeriodExpense: { type: Number, default: 0 },
    nextPeriodIncome: { type: Number, default: 0 },
    budgetForecast: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 }
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

dataWarehouseSchema.index({ workspaceId: 1, period: 1, granularity: 1 });
dataWarehouseSchema.index({ userId: 1, period: 1, granularity: 1 });
dataWarehouseSchema.index({ granularity: 1, 'period.year': 1, 'period.month': 1 });

module.exports = mongoose.model('DataWarehouse', dataWarehouseSchema);