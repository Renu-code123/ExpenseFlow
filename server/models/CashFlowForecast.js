const mongoose = require('mongoose');

const cashFlowForecastSchema = new mongoose.Schema(
  {
    // User reference
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Forecast date
    forecastDate: {
      type: Date,
      required: true,
      index: true
    },
    forecastPeriod: {
      start: {
        type: Date,
        required: true
      },
      end: {
        type: Date,
        required: true
      }
    },
    periodType: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
      default: 'monthly'
    },

    // Predicted values
    predictedIncome: {
      type: Number,
      required: true,
      default: 0
    },
    predictedExpenses: {
      type: Number,
      required: true,
      default: 0
    },
    predictedBalance: {
      type: Number,
      required: true,
      default: 0
    },
    predictedNetCashFlow: {
      type: Number,
      default: 0
    },

    // Current values (for comparison)
    currentBalance: {
      type: Number,
      default: 0
    },
    previousBalance: {
      type: Number,
      default: 0
    },

    // Confidence metrics
    confidence: {
      overall: {
        type: Number,
        min: 0,
        max: 1,
        default: 0
      },
      income: {
        type: Number,
        min: 0,
        max: 1,
        default: 0
      },
      expenses: {
        type: Number,
        min: 0,
        max: 1,
        default: 0
      },
      balance: {
        type: Number,
        min: 0,
        max: 1,
        default: 0
      }
    },
    confidenceLevel: {
      type: String,
      enum: ['very_low', 'low', 'medium', 'high', 'very_high'],
      default: 'medium'
    },

    // Contributing factors
    factors: {
      type: [
        {
          name: String,
          type: {
            type: String,
            enum: ['income', 'expense', 'seasonal', 'trend', 'event', 'external']
          },
          impact: {
            type: Number,
            description: 'Impact magnitude (-1 to 1)'
          },
          weight: {
            type: Number,
            description: 'Weight in final prediction (0 to 1)'
          },
          description: String,
          confidence: Number
        }
      ],
      default: []
    },

    // Scenario predictions
    scenarios: {
      optimistic: {
        income: Number,
        expenses: Number,
        balance: Number,
        probability: {
          type: Number,
          min: 0,
          max: 1
        }
      },
      baseline: {
        income: Number,
        expenses: Number,
        balance: Number,
        probability: {
          type: Number,
          min: 0,
          max: 1
        }
      },
      pessimistic: {
        income: Number,
        expenses: Number,
        balance: Number,
        probability: {
          type: Number,
          min: 0,
          max: 1
        }
      }
    },

    // Breakdown by category
    incomeBreakdown: {
      type: [
        {
          category: String,
          source: String,
          amount: Number,
          confidence: Number
        }
      ],
      default: []
    },
    expenseBreakdown: {
      type: [
        {
          category: String,
          amount: Number,
          confidence: Number,
          isRecurring: Boolean
        }
      ],
      default: []
    },

    // Model and algorithm info
    modelInfo: {
      algorithm: {
        type: String,
        enum: ['time_series', 'linear_regression', 'arima', 'prophet', 'lstm', 'ensemble'],
        default: 'time_series'
      },
      version: String,
      trainingData: {
        startDate: Date,
        endDate: Date,
        recordCount: Number
      },
      features: [String],
      accuracy: {
        type: Number,
        min: 0,
        max: 1
      },
      mape: {
        type: Number,
        description: 'Mean Absolute Percentage Error'
      }
    },

    // Risk assessment
    risks: {
      type: [
        {
          type: {
            type: String,
            enum: ['low_balance', 'overdraft', 'high_variance', 'unexpected_expense', 'income_shortfall']
          },
          severity: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical']
          },
          probability: Number,
          impact: Number,
          description: String,
          mitigation: String
        }
      ],
      default: []
    },

    // Recommendations
    recommendations: {
      type: [
        {
          type: {
            type: String,
            enum: ['save', 'reduce_spending', 'increase_income', 'adjust_budget', 'emergency_fund']
          },
          priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'urgent']
          },
          title: String,
          description: String,
          expectedImpact: Number,
          actionable: Boolean
        }
      ],
      default: []
    },

    // Actual values (for tracking accuracy)
    actualIncome: {
      type: Number,
      default: null
    },
    actualExpenses: {
      type: Number,
      default: null
    },
    actualBalance: {
      type: Number,
      default: null
    },
    actualRecordedAt: Date,

    // Accuracy metrics
    accuracy: {
      incomeError: {
        type: Number,
        description: 'Percentage error for income prediction'
      },
      expenseError: {
        type: Number,
        description: 'Percentage error for expense prediction'
      },
      balanceError: {
        type: Number,
        description: 'Percentage error for balance prediction'
      },
      overallAccuracy: {
        type: Number,
        min: 0,
        max: 1
      }
    },

    // Generation metadata
    generatedAt: {
      type: Date,
      default: Date.now
    },
    generatedBy: {
      type: String,
      enum: ['scheduled', 'manual', 'triggered', 'api'],
      default: 'scheduled'
    },
    processingTime: {
      type: Number,
      description: 'Time taken to generate forecast in milliseconds'
    },

    // Status
    status: {
      type: String,
      enum: ['draft', 'active', 'outdated', 'verified', 'archived'],
      default: 'active',
      index: true
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    verifiedAt: Date,

    // External factors considered
    externalFactors: {
      economicIndicators: mongoose.Schema.Types.Mixed,
      seasonalEvents: [String],
      holidays: [Date],
      customEvents: [
        {
          name: String,
          date: Date,
          impact: String
        }
      ]
    },

    // Metadata
    notes: String,
    tags: [String]
  },
  {
    timestamps: true,
    collection: 'cash_flow_forecasts'
  }
);

// Indexes
cashFlowForecastSchema.index({ user: 1, forecastDate: 1 });
cashFlowForecastSchema.index({ user: 1, status: 1 });
cashFlowForecastSchema.index({ forecastDate: -1 });
cashFlowForecastSchema.index({ 'forecastPeriod.start': 1, 'forecastPeriod.end': 1 });
cashFlowForecastSchema.index({ generatedAt: -1 });

// Virtuals
cashFlowForecastSchema.virtual('daysUntilForecast').get(function() {
  return Math.ceil((this.forecastDate - new Date()) / (1000 * 60 * 60 * 24));
});

cashFlowForecastSchema.virtual('isInPast').get(function() {
  return this.forecastDate < new Date();
});

// Methods
cashFlowForecastSchema.methods.getConfidenceLevel = function() {
  const conf = this.confidence.overall;
  if (conf >= 0.8) return 'very_high';
  if (conf >= 0.6) return 'high';
  if (conf >= 0.4) return 'medium';
  if (conf >= 0.2) return 'low';
  return 'very_low';
};

cashFlowForecastSchema.methods.recordActuals = function(income, expenses, balance) {
  this.actualIncome = income;
  this.actualExpenses = expenses;
  this.actualBalance = balance;
  this.actualRecordedAt = new Date();
  
  // Calculate accuracy
  this.accuracy.incomeError = Math.abs((income - this.predictedIncome) / income) * 100;
  this.accuracy.expenseError = Math.abs((expenses - this.predictedExpenses) / expenses) * 100;
  this.accuracy.balanceError = Math.abs((balance - this.predictedBalance) / balance) * 100;
  
  const avgError = (this.accuracy.incomeError + this.accuracy.expenseError + this.accuracy.balanceError) / 3;
  this.accuracy.overallAccuracy = Math.max(0, 1 - (avgError / 100));
  
  this.status = 'verified';
  this.isVerified = true;
  this.verifiedAt = new Date();
  
  return this.save();
};

cashFlowForecastSchema.methods.getScenarioProbability = function(scenario) {
  return this.scenarios[scenario]?.probability || 0;
};

cashFlowForecastSchema.methods.getBestScenario = function() {
  const scenarios = ['optimistic', 'baseline', 'pessimistic'];
  let best = scenarios[0];
  let highestBalance = this.scenarios[best]?.balance || -Infinity;
  
  scenarios.forEach(s => {
    if (this.scenarios[s]?.balance > highestBalance) {
      highestBalance = this.scenarios[s].balance;
      best = s;
    }
  });
  
  return best;
};

cashFlowForecastSchema.methods.getWorstScenario = function() {
  const scenarios = ['optimistic', 'baseline', 'pessimistic'];
  let worst = scenarios[0];
  let lowestBalance = this.scenarios[worst]?.balance || Infinity;
  
  scenarios.forEach(s => {
    if (this.scenarios[s]?.balance < lowestBalance) {
      lowestBalance = this.scenarios[s].balance;
      worst = s;
    }
  });
  
  return worst;
};

cashFlowForecastSchema.methods.getCriticalRisks = function() {
  return this.risks.filter(r => r.severity === 'critical' || r.severity === 'high');
};

cashFlowForecastSchema.methods.getUrgentRecommendations = function() {
  return this.recommendations.filter(r => r.priority === 'urgent' || r.priority === 'high');
};

cashFlowForecastSchema.methods.markOutdated = function() {
  this.status = 'outdated';
  return this.save();
};

// Static methods
cashFlowForecastSchema.statics.getUserForecasts = function(userId, startDate, endDate) {
  return this.find({
    user: userId,
    forecastDate: {
      $gte: startDate,
      $lte: endDate
    },
    status: { $in: ['active', 'verified'] }
  }).sort({ forecastDate: 1 });
};

cashFlowForecastSchema.statics.getLatestForecast = function(userId) {
  return this.findOne({
    user: userId,
    status: 'active'
  }).sort({ generatedAt: -1 });
};

cashFlowForecastSchema.statics.getForecastForDate = function(userId, date) {
  return this.findOne({
    user: userId,
    'forecastPeriod.start': { $lte: date },
    'forecastPeriod.end': { $gte: date },
    status: 'active'
  });
};

cashFlowForecastSchema.statics.getUpcomingForecasts = function(userId, days = 30) {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);
  
  return this.find({
    user: userId,
    forecastDate: {
      $gte: new Date(),
      $lte: endDate
    },
    status: 'active'
  }).sort({ forecastDate: 1 });
};

cashFlowForecastSchema.statics.getHistoricalAccuracy = async function(userId, months = 6) {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  
  const forecasts = await this.find({
    user: userId,
    isVerified: true,
    verifiedAt: { $gte: startDate }
  });
  
  if (forecasts.length === 0) return null;
  
  const avgAccuracy = forecasts.reduce((sum, f) => sum + (f.accuracy.overallAccuracy || 0), 0) / forecasts.length;
  const avgIncomeError = forecasts.reduce((sum, f) => sum + (f.accuracy.incomeError || 0), 0) / forecasts.length;
  const avgExpenseError = forecasts.reduce((sum, f) => sum + (f.accuracy.expenseError || 0), 0) / forecasts.length;
  
  return {
    totalForecasts: forecasts.length,
    averageAccuracy: avgAccuracy,
    averageIncomeError: avgIncomeError,
    averageExpenseError: avgExpenseError,
    period: `${months} months`
  };
};

cashFlowForecastSchema.statics.markOutdatedForecasts = async function() {
  const result = await this.updateMany(
    {
      forecastDate: { $lt: new Date() },
      status: 'active'
    },
    {
      $set: { status: 'outdated' }
    }
  );
  
  return result.modifiedCount;
};

module.exports = mongoose.model('CashFlowForecast', cashFlowForecastSchema);
