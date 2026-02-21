const mongoose = require('mongoose');

/**
 * JobState Model
 * Issue #719: Persistent state tracking for background jobs to ensure reliability.
 */
const jobStateSchema = new mongoose.Schema({
    jobName: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    status: {
        type: String,
        enum: ['idle', 'running', 'failed', 'completed'],
        default: 'idle'
    },
    lastRunAt: Date,
    lastCompletedAt: Date,
    nextRunAt: Date,
    executionCount: {
        type: Number,
        default: 0
    },
    failureCount: {
        type: Number,
        default: 0
    },
    lastError: {
        message: String,
        stack: String,
        timestamp: Date
    },
    averageDurationMs: {
        type: Number,
        default: 0
    },
    config: {
        interval: String, // cron expression
        retryLimit: { type: Number, default: 3 },
        enabled: { type: Boolean, default: true }
    },
    history: [{
        status: String,
        durationMs: Number,
        timestamp: { type: Date, default: Date.now },
        errorMessage: String
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('JobState', jobStateSchema);
