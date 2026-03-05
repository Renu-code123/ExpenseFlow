const mongoose = require('mongoose');

/**
 * TelemetryMetric Model
 * Issue #755: High-throughput storage for performance logs and forensic events.
 * Captures latency, memory usage, and cross-tenant access attempts.
 */
const telemetryMetricSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['performance', 'security', 'system', 'audit'],
        required: true,
        index: true
    },
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    action: {
        type: String,
        required: true,
        index: true
    },
    latencyMs: Number,
    statusCode: Number,
    path: String,
    method: String,
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },
    severity: {
        type: String,
        enum: ['info', 'low', 'medium', 'high', 'critical'],
        default: 'info'
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true,
    timeseries: {
        timeField: 'timestamp',
        metaField: 'type',
        granularity: 'minutes'
    }
});

module.exports = mongoose.model('TelemetryMetric', telemetryMetricSchema);
