const mongoose = require('mongoose');

const financialHealthScoreSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace'
  },
  period: {
    year: { type: Number, required: true },
    month: { type: Number, required: true }
  },
  overallScore: {
    type: Number,
    min: 0,
    max: 100,
    required: true
  },
  scoreComponents: {
    cashFlowHealth: {
      score: { type: Number, min: 0, max: 100 },
      weight: { type: Number, default: 25 },
      factors: {
        consistency: Number,
        growth: Number,
        volatility: Number
      }
    },
    budgetCompliance: {
      score: { type: Number, min: 0, max: 100 },
      weight: { type: Number, default: 20 },
      factors: {
        adherence: Number,
        accuracy: Number,
        planning: Number
      }
    },
    spendingPatterns: {
      score: { type: Number, min: 0, max: 100 },
      weight: { type: Number, default: 20 },
      factors: {
        diversification: Number,
        efficiency: Number,
        trends: Number
      }
    },
    savingsRate: {
      score: { type: Number, min: 0, max: 100 },
      weight: { type: Number, default: 15 },
      factors: {
        rate: Number,
        consistency: Number,
        growth: Number
      }
    },
    riskManagement: {
      score: { type: Number, min: 0, max: 100 },
      weight: { type: Number, default: 20 },
      factors: {
        emergencyFund: Number,
        diversification: Number,
        volatility: Number
      }
    }
  },
  riskAssessment: {
    level: {
      type: String,
      enum: ['very_low', 'low', 'moderate', 'high', 'very_high'],
      required: true
    },
    factors: [{
      category: String,
      risk: String,
      impact: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical']
      },
      probability: {
        type: String,
        enum: ['unlikely', 'possible', 'likely', 'certain']
      },
      mitigation: String
    }],
    recommendations: [String]
  },
  benchmarks: {
    industryPercentile: Number,
    peerRanking: Number,
    historicalImprovement: Number
  },
  trends: {
    scoreHistory: [{
      period: { year: Number, month: Number },
      score: Number,
      change: Number
    }],
    trajectory: {
      type: String,
      enum: ['improving', 'stable', 'declining']
    },
    projectedScore: Number
  },
  insights: [{
    type: {
      type: String,
      enum: ['strength', 'weakness', 'opportunity', 'threat']
    },
    category: String,
    description: String,
    impact: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    actionable: Boolean,
    recommendation: String
  }],
  calculationMetadata: {
    dataPoints: Number,
    confidence: Number,
    lastCalculated: {
      type: Date,
      default: Date.now
    },
    version: {
      type: String,
      default: '1.0'
    }
  }
}, {
  timestamps: true
});

financialHealthScoreSchema.index({ userId: 1, period: 1 });
financialHealthScoreSchema.index({ workspaceId: 1, period: 1 });
financialHealthScoreSchema.index({ overallScore: -1 });
financialHealthScoreSchema.index({ 'riskAssessment.level': 1 });

module.exports = mongoose.model('FinancialHealthScore', financialHealthScoreSchema);