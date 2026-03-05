const mongoose = require('mongoose');

const forecastSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    parameters: {
        period_type: {
            type: String,
            enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
            default: 'monthly'
        },
        category: {
            type: String,
            default: null
        },
        algorithm: {
            type: String,
            enum: ['moving_average', 'linear_regression', 'exponential_smoothing'],
            default: 'moving_average'
        },
        confidence_level: {
            type: Number,
            min: 80,
            max: 99,
            default: 95
        },
        historical_periods: {
            type: Number,
            min: 3,
            max: 24,
            default: 12
        }
    },
    results: {
        predictions: [{
            date: {
                type: Date,
                required: true
            },
            predicted_amount: {
                type: Number,
                required: true
            },
            confidence_lower: {
                type: Number,
                default: null
            },
            confidence_upper: {
                type: Number,
                default: null
            }
        }],
        aggregate_forecast: {
            total_predicted: {
                type: Number,
                default: 0
            },
            average_monthly: {
                type: Number,
                default: 0
            },
            trend: {
                type: String,
                enum: ['increasing', 'decreasing', 'stable', 'volatile'],
                default: 'stable'
            },
            trend_percentage: {
                type: Number,
                default: 0
            }
        },
        seasonal_factors: [{
            month: {
                type: Number,
                min: 1,
                max: 12
            },
            factor: {
                type: Number,
                default: 1.0
            }
        }],
        accuracy_score: {
            type: Number,
            min: 0,
            max: 100,
            default: null
        }
    },
    alerts: [{
        alert_type: {
            type: String,
            enum: ['budget_exceed', 'trend_change', 'seasonal_anomaly'],
            required: true
        },
        severity: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium'
        },
        message: {
            type: String,
            required: true
        },
        acknowledged: {
            type: Boolean,
            default: false
        },
        acknowledged_at: {
            type: Date,
            default: null
        },
        triggered_at: {
            type: Date,
            default: Date.now
        }
    }],
    recommendations: [{
        type: {
            type: String,
            enum: ['budget_adjustment', 'spending_reduction', 'category_review'],
            required: true
        },
        description: {
            type: String,
            required: true
        },
        priority: {
            type: String,
            enum: ['low', 'medium', 'high'],
            default: 'medium'
        }
    }]
}, {
    timestamps: true
});

// Index for efficient queries
forecastSchema.index({ user: 1, 'parameters.category': 1, createdAt: -1 });

// Methods
forecastSchema.methods.addAlert = function(alertData) {
    this.alerts.push({
        alert_type: alertData.type,
        severity: alertData.severity,
        message: alertData.message,
        triggered_at: new Date()
    });
};

forecastSchema.methods.acknowledgeAlert = function(alertId) {
    const alert = this.alerts.id(alertId);
    if (alert) {
        alert.acknowledged = true;
        alert.acknowledged_at = new Date();
    }
};

forecastSchema.methods.addRecommendation = function(recData) {
    this.recommendations.push({
        type: recData.type,
        description: recData.description,
        priority: recData.priority
    });
};

module.exports = mongoose.model('Forecast', forecastSchema);
