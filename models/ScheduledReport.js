const mongoose = require('mongoose');

/**
 * Scheduled Report Model
 * Issue #659: Persists user-defined recurring report configurations
 */
const scheduledReportSchema = new mongoose.Schema({
    userId: {
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
    template: {
        type: String,
        enum: ['monthlySummary', 'taxReport', 'inventoryAudit'],
        default: 'monthlySummary'
    },
    format: {
        type: String,
        enum: ['pdf', 'xlsx', 'csv', 'json'],
        default: 'pdf'
    },
    frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'quarterly'],
        required: true
    },
    recipients: [{
        type: String // Emails
    }],
    filter: {
        workspaceId: mongoose.Schema.Types.ObjectId,
        category: String,
        minAmount: Number
    },
    lastRun: Date,
    nextRun: {
        type: Date,
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['active', 'paused', 'failed'],
        default: 'active'
    },
    deliveryChannel: {
        type: String,
        enum: ['email', 'slack', 'webhook'],
        default: 'email'
    }
}, {
    timestamps: true
});

// Helper to calculate next run date
scheduledReportSchema.methods.calculateNextRun = function () {
    const next = new Date(this.nextRun || new Date());
    switch (this.frequency) {
        case 'daily': next.setDate(next.getDate() + 1); break;
        case 'weekly': next.setDate(next.getDate() + 7); break;
        case 'monthly': next.setMonth(next.getMonth() + 1); break;
        case 'quarterly': next.setMonth(next.getMonth() + 3); break;
    }
    return next;
};

module.exports = mongoose.model('ScheduledReport', scheduledReportSchema);
