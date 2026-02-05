const mongoose = require('mongoose');

const forecastScenarioSchema = new mongoose.Schema(
  {
    // User reference
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Scenario identification
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: String,
    scenarioType: {
      type: String,
      enum: ['optimistic', 'baseline', 'pessimistic', 'custom', 'what_if'],
      default: 'custom',
      index: true
    },

    // Time period
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    duration: {
      type: Number,
      description: 'Duration in months'
    },

    // Assumptions
    assumptions: {
      type: [
        {
          category: {
            type: String,
            enum: ['income', 'expense', 'investment', 'debt', 'external', 'other']
          },
          name: String,
          description: String,
          value: mongoose.Schema.Types.Mixed,
          impact: {
            type: String,
            enum: ['positive', 'negative', 'neutral']
          },
          likelihood: {
            type: Number,
            min: 0,
            max: 1,
            description: 'Probability of this assumption being true'
          }
        }
      ],
      default: []
    },

    // Adjustments to baseline
    adjustments: {
      income: {
        type: [
          {
            source: String,
            sourceId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'IncomeSource'
            },
            changeType: {
              type: String,
              enum: ['percentage', 'fixed_amount', 'new_source', 'remove_source']
            },
            value: Number,
            description: String,
            effectiveDate: Date
          }
        ],
        default: []
      },
      expenses: {
        type: [
          {
            category: String,
            changeType: {
              type: String,
              enum: ['percentage', 'fixed_amount', 'remove_category']
            },
            value: Number,
            description: String,
            effectiveDate: Date
          }
        ],
        default: []
      },
      savings: {
        rate: Number,
        target: Number,
        method: {
          type: String,
          enum: ['percentage', 'fixed', 'surplus']
        }
      },
      debt: {
        type: [
          {
            debtName: String,
            changeType: {
              type: String,
              enum: ['payoff', 'refinance', 'consolidate', 'increase_payment']
            },
            value: Number,
            description: String
          }
        ],
        default: []
      }
    },

    // Scenario results
    results: {
      totalIncome: {
        type: Number,
        default: 0
      },
      totalExpenses: {
        type: Number,
        default: 0
      },
      netCashFlow: {
        type: Number,
        default: 0
      },
      endingBalance: {
        type: Number,
        default: 0
      },
      savingsAccumulated: {
        type: Number,
        default: 0
      },
      
      // Monthly breakdown
      monthlyBreakdown: {
        type: [
          {
            month: Date,
            income: Number,
            expenses: Number,
            netCashFlow: Number,
            balance: Number,
            savings: Number
          }
        ],
        default: []
      },

      // Category breakdown
      incomeByCategory: mongoose.Schema.Types.Mixed,
      expensesByCategory: mongoose.Schema.Types.Mixed,

      // Key metrics
      averageMonthlyIncome: Number,
      averageMonthlyExpenses: Number,
      savingsRate: Number,
      runwayMonths: {
        type: Number,
        description: 'Months of expenses covered by ending balance'
      }
    },

    // Comparison with baseline
    comparisonWithBaseline: {
      incomeDifference: Number,
      expenseDifference: Number,
      balanceDifference: Number,
      savingsDifference: Number,
      percentageChange: Number
    },

    // Goals and targets
    goals: {
      type: [
        {
          name: String,
          targetAmount: Number,
          targetDate: Date,
          achieved: Boolean,
          achievedDate: Date,
          shortfall: Number
        }
      ],
      default: []
    },

    // Risk assessment
    risks: {
      type: [
        {
          name: String,
          description: String,
          probability: {
            type: Number,
            min: 0,
            max: 1
          },
          impact: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical']
          },
          mitigation: String
        }
      ],
      default: []
    },

    // Recommendations
    recommendations: {
      type: [
        {
          priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical']
          },
          action: String,
          expectedBenefit: Number,
          timeframe: String
        }
      ],
      default: []
    },

    // Analysis
    analysis: {
      strengths: [String],
      weaknesses: [String],
      opportunities: [String],
      threats: [String],
      summary: String
    },

    // Calculation metadata
    calculationDetails: {
      algorithm: String,
      version: String,
      parameters: mongoose.Schema.Types.Mixed,
      computationTime: Number,
      dataQuality: {
        type: Number,
        min: 0,
        max: 1
      }
    },

    // Status
    status: {
      type: String,
      enum: ['draft', 'active', 'archived', 'superseded'],
      default: 'draft',
      index: true
    },
    isShared: {
      type: Boolean,
      default: false
    },
    sharedWith: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],

    // Versioning
    version: {
      type: Number,
      default: 1
    },
    previousVersion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ForecastScenario'
    },
    baseScenario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ForecastScenario',
      description: 'Reference to baseline scenario if this is a variant'
    },

    // User interaction
    favorite: {
      type: Boolean,
      default: false
    },
    notes: String,
    tags: [String]
  },
  {
    timestamps: true,
    collection: 'forecast_scenarios'
  }
);

// Indexes
forecastScenarioSchema.index({ user: 1, status: 1 });
forecastScenarioSchema.index({ user: 1, scenarioType: 1 });
forecastScenarioSchema.index({ startDate: 1, endDate: 1 });
forecastScenarioSchema.index({ favorite: -1 });
forecastScenarioSchema.index({ createdAt: -1 });

// Methods
forecastScenarioSchema.methods.calculateResults = function() {
  // This would integrate with forecast service to calculate results
  // For now, placeholder logic
  const months = Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24 * 30));
  this.duration = months;
  return this.save();
};

forecastScenarioSchema.methods.compareWith = function(otherScenario) {
  if (!otherScenario.results || !this.results) return null;

  return {
    incomeDifference: this.results.totalIncome - otherScenario.results.totalIncome,
    expenseDifference: this.results.totalExpenses - otherScenario.results.totalExpenses,
    balanceDifference: this.results.endingBalance - otherScenario.results.endingBalance,
    savingsDifference: this.results.savingsAccumulated - otherScenario.results.savingsAccumulated,
    percentageChange: ((this.results.endingBalance - otherScenario.results.endingBalance) / 
                       otherScenario.results.endingBalance) * 100
  };
};

forecastScenarioSchema.methods.addAssumption = function(category, name, description, value, impact) {
  this.assumptions.push({
    category,
    name,
    description,
    value,
    impact,
    likelihood: 0.5
  });
  return this.save();
};

forecastScenarioSchema.methods.addIncomeAdjustment = function(source, changeType, value, description) {
  this.adjustments.income.push({
    source,
    changeType,
    value,
    description,
    effectiveDate: new Date()
  });
  return this.save();
};

forecastScenarioSchema.methods.addExpenseAdjustment = function(category, changeType, value, description) {
  this.adjustments.expenses.push({
    category,
    changeType,
    value,
    description,
    effectiveDate: new Date()
  });
  return this.save();
};

forecastScenarioSchema.methods.addGoal = function(name, targetAmount, targetDate) {
  this.goals.push({
    name,
    targetAmount,
    targetDate,
    achieved: false
  });
  return this.save();
};

forecastScenarioSchema.methods.checkGoalAchievement = function() {
  this.goals.forEach(goal => {
    if (!goal.achieved && this.results.endingBalance >= goal.targetAmount) {
      goal.achieved = true;
      goal.achievedDate = new Date();
      goal.shortfall = 0;
    } else if (!goal.achieved) {
      goal.shortfall = goal.targetAmount - this.results.endingBalance;
    }
  });
  return this.save();
};

forecastScenarioSchema.methods.getSuccessRate = function() {
  if (this.goals.length === 0) return null;
  const achievedCount = this.goals.filter(g => g.achieved).length;
  return (achievedCount / this.goals.length) * 100;
};

forecastScenarioSchema.methods.archive = function() {
  this.status = 'archived';
  return this.save();
};

forecastScenarioSchema.methods.createVariant = function(name, description) {
  const Scenario = this.constructor;
  const variant = new Scenario({
    user: this.user,
    name,
    description,
    scenarioType: 'custom',
    startDate: this.startDate,
    endDate: this.endDate,
    baseScenario: this._id,
    assumptions: [...this.assumptions],
    adjustments: JSON.parse(JSON.stringify(this.adjustments))
  });
  return variant.save();
};

// Static methods
forecastScenarioSchema.statics.getUserScenarios = function(userId) {
  return this.find({ user: userId, status: { $ne: 'archived' } }).sort({ createdAt: -1 });
};

forecastScenarioSchema.statics.getActiveScenarios = function(userId) {
  return this.find({ user: userId, status: 'active' });
};

forecastScenarioSchema.statics.getFavorites = function(userId) {
  return this.find({ user: userId, favorite: true });
};

forecastScenarioSchema.statics.getByType = function(userId, scenarioType) {
  return this.find({ user: userId, scenarioType });
};

forecastScenarioSchema.statics.getBaselineScenario = function(userId) {
  return this.findOne({ user: userId, scenarioType: 'baseline', status: 'active' });
};

module.exports = mongoose.model('ForecastScenario', forecastScenarioSchema);
