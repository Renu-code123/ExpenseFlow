const mongoose = require('mongoose');

/**
 * TreasuryNode Model
 * Issue #768: Per-tenant virtual account clusters.
 * Represent fractional liquidity pools within a single tenant account.
 */
const treasuryNodeSchema = new mongoose.Schema({
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true,
        index: true
    },
    nodeType: {
        type: String,
        required: true,
        enum: ['OPERATING', 'RESERVE', 'TAX', 'PAYROLL', 'INVESTMENT'],
        default: 'OPERATING'
    },
    balance: {
        type: Number,
        default: 0
    },
    currency: {
        type: String,
        required: true,
        default: 'USD'
    },
    reservedAmount: {
        type: Number,
        default: 0 // Funds locked for pending transactions
    },
    metadata: {
        targetReserveRatio: { type: Number, default: 0.2 }, // 20% target
        lastRebalancedAt: Date,
        burnRateProjection: Number
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'LOCKED', 'DEPLETED'],
        default: 'ACTIVE'
    },
    // Issue #866: Genetic DNA Tracking
    dnaRestrictedBuckets: [{
        sourceDna: { type: String, enum: ['VENTURE_CAPITAL', 'STATE_GRANT', 'REVENUE', 'LOAN', 'EQUITY'] },
        amount: { type: Number, default: 0 },
        isLocked: { type: Boolean, default: false }
    }],
    // Issue #910: Self-Healing Reconciliation
    lastReconciledState: {
        hash: String,
        reconciledAt: Date,
        driftDetected: { type: Number, default: 0 }
    },
    // Issue #959: JIT & Capital Efficiency
    yieldProfile: {
        annualRate: { type: Number, default: 0.01 }, // APY (e.g., 0.01 = 1%)
        yieldType: { type: String, enum: ['FIXED', 'VARIABLE', 'STAKED'], default: 'FIXED' }
    },
    fundingLatency: {
        ms: { type: Number, default: 500 }, // Time to pull funds into this node
        reliability: { type: Number, default: 0.99 } // 0-1 score
    }
}, {
    timestamps: true
});

// Composite index for fast lookup
treasuryNodeSchema.index({ workspaceId: 1, nodeType: 1 }, { unique: true });

// Virtual for available liquidity
treasuryNodeSchema.virtual('availableBalance').get(function () {
    return this.balance - this.reservedAmount;
});

module.exports = mongoose.model('TreasuryNode', treasuryNodeSchema);
