const mongoose = require('mongoose');

/**
 * TreasuryVault Model
 * Represents a centralized cash/asset pool for enterprise treasury management
 */
const treasuryVaultSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    vaultName: {
        type: String,
        required: true,
        trim: true
    },
    vaultType: {
        type: String,
        enum: ['operating', 'reserve', 'investment', 'forex'],
        default: 'operating'
    },
    currency: {
        type: String,
        required: true,
        default: 'INR',
        uppercase: true
    },
    balance: {
        type: Number,
        required: true,
        default: 0
    },
    allocatedFunds: {
        type: Number,
        default: 0
    },
    availableLiquidity: {
        type: Number,
        default: 0
    },
    linkedAccounts: [{
        accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
        allocationPercentage: { type: Number, min: 0, max: 100 }
    }],
    restrictions: {
        minBalance: { type: Number, default: 0 },
        maxWithdrawal: { type: Number, default: null },
        requiresApproval: { type: Boolean, default: false }
    },
    metadata: {
        purpose: String,
        riskProfile: { type: String, enum: ['conservative', 'moderate', 'aggressive'], default: 'moderate' },
        autoRebalance: { type: Boolean, default: false }
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Pre-save hook to calculate available liquidity
treasuryVaultSchema.pre('save', function (next) {
    this.availableLiquidity = this.balance - this.allocatedFunds;
    next();
});

// Index for performance
treasuryVaultSchema.index({ userId: 1, vaultType: 1 });
treasuryVaultSchema.index({ currency: 1, isActive: 1 });

module.exports = mongoose.model('TreasuryVault', treasuryVaultSchema);
