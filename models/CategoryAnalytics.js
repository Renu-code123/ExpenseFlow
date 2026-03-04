const mongoose = require('mongoose');

const categoryAnalyticsSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    totalPredictions: {
        type: Number,
        default: 0
    },
    correctPredictions: {
        type: Number,
        default: 0
    },
    accuracy: {
        type: Number,
        default: 0,
        min: 0,
        max: 1
    },
    methodBreakdown: {
        tensorflow: {
            predictions: { type: Number, default: 0 },
            correct: { type: Number, default: 0 },
            accuracy: { type: Number, default: 0 }
        },
        pattern: {
            predictions: { type: Number, default: 0 },
            correct: { type: Number, default: 0 },
            accuracy: { type: Number, default: 0 }
        },
        'rule-based': {
            predictions: { type: Number, default: 0 },
            correct: { type: Number, default: 0 },
            accuracy: { type: Number, default: 0 }
        }
    },
    categoryBreakdown: {
        food: {
            predictions: { type: Number, default: 0 },
            correct: { type: Number, default: 0 },
            accuracy: { type: Number, default: 0 }
        },
        transport: {
            predictions: { type: Number, default: 0 },
            correct: { type: Number, default: 0 },
            accuracy: { type: Number, default: 0 }
        },
        entertainment: {
            predictions: { type: Number, default: 0 },
            correct: { type: Number, default: 0 },
            accuracy: { type: Number, default: 0 }
        },
        utilities: {
            predictions: { type: Number, default: 0 },
            correct: { type: Number, default: 0 },
            accuracy: { type: Number, default: 0 }
        },
        healthcare: {
            predictions: { type: Number, default: 0 },
            correct: { type: Number, default: 0 },
            accuracy: { type: Number, default: 0 }
        },
        shopping: {
            predictions: { type: Number, default: 0 },
            correct: { type: Number, default: 0 },
            accuracy: { type: Number, default: 0 }
        },
        other: {
            predictions: { type: Number, default: 0 },
            correct: { type: Number, default: 0 },
            accuracy: { type: Number, default: 0 }
        }
    },
    averageConfidence: {
        type: Number,
        default: 0
    },
    trainingDataUsed: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Indexes
categoryAnalyticsSchema.index({ user: 1, date: -1 });
categoryAnalyticsSchema.index({ user: 1, date: 1 });

// Static method to record prediction
categoryAnalyticsSchema.statics.recordPrediction = async function(userId, prediction, actualCategory, confidence) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let analytics = await this.findOne({
        user: userId,
        date: today
    });

    if (!analytics) {
        analytics = new this({
            user: userId,
            date: today
        });
    }

    analytics.totalPredictions += 1;
    const isCorrect = prediction.category === actualCategory;
    if (isCorrect) {
        analytics.correctPredictions += 1;
    }

    // Update method breakdown
    if (analytics.methodBreakdown[prediction.method]) {
        analytics.methodBreakdown[prediction.method].predictions += 1;
        if (isCorrect) {
            analytics.methodBreakdown[prediction.method].correct += 1;
        }
        analytics.methodBreakdown[prediction.method].accuracy =
            analytics.methodBreakdown[prediction.method].correct /
            analytics.methodBreakdown[prediction.method].predictions;
    }

    // Update category breakdown
    if (analytics.categoryBreakdown[actualCategory]) {
        analytics.categoryBreakdown[actualCategory].predictions += 1;
        if (isCorrect) {
            analytics.categoryBreakdown[actualCategory].correct += 1;
        }
        analytics.categoryBreakdown[actualCategory].accuracy =
            analytics.categoryBreakdown[actualCategory].correct /
            analytics.categoryBreakdown[actualCategory].predictions;
    }

    // Update overall accuracy
    analytics.accuracy = analytics.correctPredictions / analytics.totalPredictions;

    // Update average confidence
    analytics.averageConfidence = (
        (analytics.averageConfidence * (analytics.totalPredictions - 1)) + confidence
    ) / analytics.totalPredictions;

    return await analytics.save();
};

// Static method to get user analytics
categoryAnalyticsSchema.statics.getUserAnalytics = async function(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analytics = await this.find({
        user: userId,
        date: { $gte: startDate }
    }).sort({ date: -1 });

    if (analytics.length === 0) {
        return {
            totalPredictions: 0,
            overallAccuracy: 0,
            averageConfidence: 0,
            methodBreakdown: {},
            categoryBreakdown: {},
            dailyStats: []
        };
    }

    // Aggregate stats
    const totalPredictions = analytics.reduce((sum, day) => sum + day.totalPredictions, 0);
    const totalCorrect = analytics.reduce((sum, day) => sum + day.correctPredictions, 0);
    const overallAccuracy = totalCorrect / totalPredictions;

    const averageConfidence = analytics.reduce((sum, day) => sum + day.averageConfidence, 0) / analytics.length;

    // Aggregate method breakdown
    const methodBreakdown = {};
    analytics.forEach(day => {
        Object.keys(day.methodBreakdown).forEach(method => {
            if (!methodBreakdown[method]) {
                methodBreakdown[method] = { predictions: 0, correct: 0 };
            }
            methodBreakdown[method].predictions += day.methodBreakdown[method].predictions;
            methodBreakdown[method].correct += day.methodBreakdown[method].correct;
        });
    });

    Object.keys(methodBreakdown).forEach(method => {
        methodBreakdown[method].accuracy = methodBreakdown[method].correct / methodBreakdown[method].predictions;
    });

    // Aggregate category breakdown
    const categoryBreakdown = {};
    analytics.forEach(day => {
        Object.keys(day.categoryBreakdown).forEach(category => {
            if (!categoryBreakdown[category]) {
                categoryBreakdown[category] = { predictions: 0, correct: 0 };
            }
            categoryBreakdown[category].predictions += day.categoryBreakdown[category].predictions;
            categoryBreakdown[category].correct += day.categoryBreakdown[category].correct;
        });
    });

    Object.keys(categoryBreakdown).forEach(category => {
        categoryBreakdown[category].accuracy = categoryBreakdown[category].correct / categoryBreakdown[category].predictions;
    });

    return {
        totalPredictions,
        overallAccuracy,
        averageConfidence,
        methodBreakdown,
        categoryBreakdown,
        dailyStats: analytics.map(day => ({
            date: day.date,
            predictions: day.totalPredictions,
            accuracy: day.accuracy,
            confidence: day.averageConfidence
        }))
    };
};

module.exports = mongoose.model('CategoryAnalytics', categoryAnalyticsSchema);
