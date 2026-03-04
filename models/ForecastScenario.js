const mongoose = require('mongoose');

/**
 * ForecastScenario Model
 * Issue #678: Stores "What-If" parameters for stress testing liquidity.
 */
const forecastScenarioSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,

  // Impact parameters
  adjustments: {
    incomeChangePct: { type: Number, default: 0 }, // e.g., -50 for 50% loss
    expenseChangePct: { type: Number, default: 0 },
    oneTimeImpacts: [{
      amount: Number,
      category: String,
      date: Date,
      label: String
    }]
  },

  // Simulation settings
  config: {
    timeHorizonDays: { type: Number, default: 90 },
    iterationCount: { type: Number, default: 1000 },
    confidenceInterval: { type: Number, default: 95 }
  },

  lastRunAt: Date,
  lastResultSnapshot: mongoose.Schema.Types.Mixed,

  isDefault: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('ForecastScenario', forecastScenarioSchema);
