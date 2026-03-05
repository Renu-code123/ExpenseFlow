const mongoose = require('mongoose');

const seasonalPatternSchema = new mongoose.Schema(
  {
    // User reference
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Pattern identification
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: String,

    // Category or merchant
    category: {
      type: String,
      enum: [
        'food', 'transport', 'shopping', 'entertainment', 'utilities',
        'health', 'education', 'salary', 'transfer', 'subscription',
        'investment', 'loan', 'other', 'all'
      ],
      default: 'all',
      index: true
    },
    merchant: String,
    
    // Pattern type
    patternType: {
      type: String,
      enum: ['seasonal', 'trend', 'cyclical', 'irregular', 'combined'],
      default: 'seasonal'
    },

    // Monthly factors (multiplicative factors for each month)
    monthlyFactors: {
      type: [Number],
      default: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      validate: {
        validator: function(arr) {
          return arr.length === 12;
        },
        message: 'monthlyFactors must have exactly 12 elements'
      },
      description: 'Adjustment factors for Jan-Dec (1 = baseline, >1 = higher, <1 = lower)'
    },

    // Day of week factors
    dayOfWeekFactors: {
      type: [Number],
      default: [1, 1, 1, 1, 1, 1, 1],
      validate: {
        validator: function(arr) {
          return arr.length === 7;
        },
        message: 'dayOfWeekFactors must have exactly 7 elements'
      },
      description: 'Adjustment factors for Sun-Sat'
    },

    // Day of month factors
    dayOfMonthFactors: {
      type: [Number],
      default: Array(31).fill(1),
      validate: {
        validator: function(arr) {
          return arr.length === 31;
        },
        message: 'dayOfMonthFactors must have exactly 31 elements'
      },
      description: 'Adjustment factors for days 1-31'
    },

    // Holiday impact
    holidayImpact: {
      type: [
        {
          holiday: {
            type: String,
            enum: [
              'new_year', 'valentines', 'easter', 'independence_day', 
              'halloween', 'thanksgiving', 'black_friday', 'christmas',
              'diwali', 'holi', 'eid', 'custom'
            ]
          },
          customName: String,
          date: Date,
          daysBefore: {
            type: Number,
            default: 0
          },
          daysAfter: {
            type: Number,
            default: 0
          },
          factor: {
            type: Number,
            default: 1,
            description: 'Spending multiplier during this period'
          },
          impact: {
            type: String,
            enum: ['none', 'low', 'medium', 'high', 'extreme']
          }
        }
      ],
      default: []
    },

    // Week of month patterns
    weekOfMonthFactors: {
      type: [Number],
      default: [1, 1, 1, 1, 1],
      description: 'Factors for weeks 1-5 of month'
    },

    // Quarter patterns
    quarterlyFactors: {
      type: [Number],
      default: [1, 1, 1, 1],
      description: 'Factors for Q1-Q4'
    },

    // Statistical confidence
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
      description: 'Statistical confidence in pattern (0-1)'
    },
    dataPoints: {
      type: Number,
      default: 0,
      description: 'Number of historical data points used'
    },
    rsquared: {
      type: Number,
      min: 0,
      max: 1,
      description: 'R-squared value for pattern fit'
    },

    // Trend analysis
    trend: {
      direction: {
        type: String,
        enum: ['increasing', 'decreasing', 'stable', 'volatile']
      },
      slope: {
        type: Number,
        description: 'Rate of change over time'
      },
      correlation: {
        type: Number,
        min: -1,
        max: 1
      }
    },

    // Period analyzed
    analysisStartDate: {
      type: Date,
      required: true
    },
    analysisEndDate: {
      type: Date,
      required: true
    },
    lastAnalyzedAt: {
      type: Date,
      default: Date.now
    },

    // Peak periods
    peakPeriods: {
      type: [
        {
          name: String,
          startMonth: {
            type: Number,
            min: 1,
            max: 12
          },
          endMonth: {
            type: Number,
            min: 1,
            max: 12
          },
          factor: Number,
          reason: String
        }
      ],
      default: []
    },

    // Low periods
    lowPeriods: {
      type: [
        {
          name: String,
          startMonth: {
            type: Number,
            min: 1,
            max: 12
          },
          endMonth: {
            type: Number,
            min: 1,
            max: 12
          },
          factor: Number,
          reason: String
        }
      ],
      default: []
    },

    // External factors
    externalFactors: {
      type: [
        {
          name: String,
          type: {
            type: String,
            enum: ['weather', 'economy', 'personal', 'social', 'other']
          },
          impact: Number,
          correlation: Number
        }
      ],
      default: []
    },

    // Status
    isActive: {
      type: Boolean,
      default: true
    },
    lastUsedAt: Date,

    // Metadata
    tags: [String],
    notes: String
  },
  {
    timestamps: true,
    collection: 'seasonal_patterns'
  }
);

// Indexes
seasonalPatternSchema.index({ user: 1, category: 1 });
seasonalPatternSchema.index({ user: 1, isActive: 1 });
seasonalPatternSchema.index({ lastAnalyzedAt: -1 });

// Methods
seasonalPatternSchema.methods.getFactorForDate = function(date) {
  const d = new Date(date);
  const month = d.getMonth(); // 0-11
  const dayOfWeek = d.getDay(); // 0-6
  const dayOfMonth = d.getDate() - 1; // 0-30
  
  const monthFactor = this.monthlyFactors[month] || 1;
  const dowFactor = this.dayOfWeekFactors[dayOfWeek] || 1;
  const domFactor = this.dayOfMonthFactors[dayOfMonth] || 1;
  
  // Calculate compound factor
  const factor = monthFactor * dowFactor * domFactor;
  
  // Check for holiday impact
  const holidayFactor = this.getHolidayFactor(date);
  
  return factor * holidayFactor;
};

seasonalPatternSchema.methods.getHolidayFactor = function(date) {
  let factor = 1;
  
  this.holidayImpact.forEach(holiday => {
    if (!holiday.date) return;
    
    const holidayDate = new Date(holiday.date);
    const daysDiff = Math.floor((date - holidayDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff >= -holiday.daysBefore && daysDiff <= holiday.daysAfter) {
      factor *= holiday.factor;
    }
  });
  
  return factor;
};

seasonalPatternSchema.methods.getMonthlyFactor = function(month) {
  return this.monthlyFactors[month] || 1;
};

seasonalPatternSchema.methods.getPeakMonths = function() {
  const peaks = [];
  this.monthlyFactors.forEach((factor, index) => {
    if (factor > 1.2) { // 20% above baseline
      peaks.push({
        month: index + 1,
        factor: factor,
        monthName: new Date(2000, index, 1).toLocaleString('default', { month: 'long' })
      });
    }
  });
  return peaks;
};

seasonalPatternSchema.methods.getLowMonths = function() {
  const lows = [];
  this.monthlyFactors.forEach((factor, index) => {
    if (factor < 0.8) { // 20% below baseline
      lows.push({
        month: index + 1,
        factor: factor,
        monthName: new Date(2000, index, 1).toLocaleString('default', { month: 'long' })
      });
    }
  });
  return lows;
};

seasonalPatternSchema.methods.applyToAmount = function(baseAmount, date) {
  const factor = this.getFactorForDate(date);
  return baseAmount * factor;
};

seasonalPatternSchema.methods.getPredictedAmounts = function(baseAmount, dates) {
  return dates.map(date => ({
    date: date,
    amount: this.applyToAmount(baseAmount, date),
    factor: this.getFactorForDate(date)
  }));
};

seasonalPatternSchema.methods.getAverageFactor = function() {
  const allFactors = [
    ...this.monthlyFactors,
    ...this.dayOfWeekFactors,
    ...this.dayOfMonthFactors
  ];
  return allFactors.reduce((sum, f) => sum + f, 0) / allFactors.length;
};

seasonalPatternSchema.methods.isSignificant = function() {
  return this.confidence >= 0.7 && this.dataPoints >= 12;
};

// Static methods
seasonalPatternSchema.statics.getUserPatterns = function(userId) {
  return this.find({ user: userId, isActive: true });
};

seasonalPatternSchema.statics.getPatternForCategory = function(userId, category) {
  return this.findOne({
    user: userId,
    category,
    isActive: true
  }).sort({ confidence: -1 });
};

seasonalPatternSchema.statics.getSignificantPatterns = function(userId) {
  return this.find({
    user: userId,
    isActive: true,
    confidence: { $gte: 0.7 },
    dataPoints: { $gte: 12 }
  });
};

seasonalPatternSchema.statics.needsUpdate = function(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  return this.find({
    isActive: true,
    lastAnalyzedAt: { $lt: cutoffDate }
  });
};

module.exports = mongoose.model('SeasonalPattern', seasonalPatternSchema);
