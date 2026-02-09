const mongoose = require('mongoose');

const budgetForecastSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    forecast_period: {
        start_date: {
            type: Date,
            required: true
        },
        end_date: {
            type: Date,
            required: true
        },
        period_type: {
            type: String,
            enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
            required: true
        }
    },
    category: {
        type: String,
        index: true
    },
    predictions: [{
        date: Date,
        predicted_amount: Number,
        confidence_lower: Number,
        confidence_upper: Number,
        confidence_level: {
            type: Number,
            default: 95
        }
    }],
    aggregate_forecast: {
        total_predicted: Number,
        average_monthly: Number,
        trend: {
            type: String,
            enum: ['increasing', 'decreasing', 'stable', 'volatile']
        },
        trend_percentage: Number
    },
    seasonal_factors: [{
        month: Number,
        factor: Number,
        event: String
    }],
    model_metadata: {
        algorithm: {
            type: String,
            enum: ['linear_regression', 'moving_average', 'exponential_smoothing', 'arima', 'prophet']
        },
        accuracy_score: Number,
        rmse: Number,
        mae: Number,
        training_data_points: Number,
        last_trained: Date
    },
    comparison: {
        vs_last_period: {
            amount_change: Number,
            percentage_change: Number
        },
        vs_budget: {
            budget_amount: Number,
            forecast_vs_budget: Number,
            will_exceed: Boolean
        }
    },
    alerts: [{
        alert_type: {
            type: String,
            enum: ['forecast_exceeds_budget', 'unusual_spike', 'trend_reversal', 'seasonal_peak']
        },
        severity: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical']
        },
        message: String,
        triggered_at: {
            type: Date,
            default: Date.now
        },
        acknowledged: {
            type: Boolean,
            default: false
        }
    }],
    recommendations: [{
        recommendation_type: {
            type: String,
            enum: ['increase_budget', 'decrease_budget', 'adjust_spending', 'save_more', 'review_category']
        },
        title: String,
        description: String,
        impact_amount: Number,
        priority: {
            type: String,
            enum: ['low', 'medium', 'high']
        }
    }],
    accuracy_tracking: [{
        prediction_date: Date,
        predicted_amount: Number,
        actual_amount: Number,
        error_percentage: Number,
        recorded_at: Date
    }],
    status: {
        type: String,
        enum: ['active', 'archived', 'expired'],
        default: 'active'
    }
}, {
    timestamps: true
});

// Indexes
budgetForecastSchema.index({ user: 1, 'forecast_period.start_date': 1, category: 1 });
budgetForecastSchema.index({ user: 1, status: 1 });
budgetForecastSchema.index({ 'forecast_period.end_date': 1 });

// Virtuals
budgetForecastSchema.virtual('is_expired').get(function() {
    return new Date() > this.forecast_period.end_date;
});

budgetForecastSchema.virtual('days_remaining').get(function() {
    const diff = this.forecast_period.end_date - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

budgetForecastSchema.virtual('forecast_accuracy').get(function() {
    if (this.accuracy_tracking.length === 0) return null;
    
    const totalError = this.accuracy_tracking.reduce((sum, track) => 
        sum + Math.abs(track.error_percentage), 0
    );
    
    return 100 - (totalError / this.accuracy_tracking.length);
});

// Methods
budgetForecastSchema.methods.addPrediction = function(date, amount, confidenceLower, confidenceUpper) {
    this.predictions.push({
        date,
        predicted_amount: amount,
        confidence_lower: confidenceLower,
        confidence_upper: confidenceUpper
    });
    return this.save();
};

budgetForecastSchema.methods.addAlert = function(alertType, severity, message) {
    this.alerts.push({
        alert_type: alertType,
        severity,
        message,
        triggered_at: new Date()
    });
    return this.save();
};

budgetForecastSchema.methods.acknowledgeAlert = function(alertId) {
    const alert = this.alerts.id(alertId);
    if (alert) {
        alert.acknowledged = true;
    }
    return this.save();
};

budgetForecastSchema.methods.trackAccuracy = function(predictionDate, predictedAmount, actualAmount) {
    const errorPercentage = ((actualAmount - predictedAmount) / predictedAmount) * 100;
    
    this.accuracy_tracking.push({
        prediction_date: predictionDate,
        predicted_amount: predictedAmount,
        actual_amount: actualAmount,
        error_percentage: errorPercentage,
        recorded_at: new Date()
    });
    
    // Update model accuracy score
    if (this.model_metadata) {
        const recentTracking = this.accuracy_tracking.slice(-10);
        const avgError = recentTracking.reduce((sum, t) => 
            sum + Math.abs(t.error_percentage), 0) / recentTracking.length;
        
        this.model_metadata.accuracy_score = 100 - avgError;
    }
    
    return this.save();
};

budgetForecastSchema.methods.addRecommendation = function(type, title, description, impactAmount, priority) {
    this.recommendations.push({
        recommendation_type: type,
        title,
        description,
        impact_amount: impactAmount,
        priority
    });
    return this.save();
};

// Static methods
budgetForecastSchema.statics.getUserForecasts = function(userId, status = 'active') {
    return this.find({ user: userId, status })
        .sort({ 'forecast_period.start_date': -1 });
};

budgetForecastSchema.statics.getCurrentForecasts = function(userId) {
    const now = new Date();
    return this.find({
        user: userId,
        status: 'active',
        'forecast_period.start_date': { $lte: now },
        'forecast_period.end_date': { $gte: now }
    });
};

budgetForecastSchema.statics.getUnacknowledgedAlerts = function(userId) {
    return this.find({
        user: userId,
        status: 'active',
        'alerts': {
            $elemMatch: {
                acknowledged: false,
                severity: { $in: ['high', 'critical'] }
            }
        }
    });
};

// Auto-expire old forecasts
budgetForecastSchema.pre('save', function(next) {
    if (this.is_expired && this.status === 'active') {
        this.status = 'expired';
    }
    next();
});

module.exports = mongoose.model('BudgetForecast', budgetForecastSchema);
