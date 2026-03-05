const mongoose = require('mongoose');

/**
 * PrivacyBridge Model
 * Issue #844: Managing noise-injection parameters and privacy budget for differential privacy.
 */
const privacyBridgeSchema = new mongoose.Schema({
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', index: true, unique: true },
    privacyBudgetUsed: { type: Number, default: 0 }, // Epsilon consumed over time
    privacyBudgetLimit: { type: Number, default: 10.0 }, // Maximum allowed epsilon usage
    lastRefreshAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    allowBenchmarking: { type: Boolean, default: false } // Opt-in to contribute to industry data
}, {
    timestamps: true
});

module.exports = mongoose.model('PrivacyBridge', privacyBridgeSchema);
