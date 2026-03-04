const mongoose = require('mongoose');

/**
 * LedgerShard Model
 * Issue #842: Temporal-aware collection mapping for sharded event streams.
 * Tracks which time ranges and tenant clusters are routed to which MongoDB collections.
 */
const ledgerShardSchema = new mongoose.Schema({
    shardId: { type: String, required: true, unique: true }, // e.g., 'shard_2026_Q1_clusterA'
    collectionName: { type: String, required: true }, // e.g., 'financial_events_2026_q1'
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    tenantCluster: { type: String, default: 'GLOBAL' }, // For multi-cluster sharding
    status: {
        type: String,
        enum: ['active', 'read-only', 'archived', 'compacting'],
        default: 'active'
    },
    eventCount: { type: Number, default: 0 },
    storageSize: { type: Number, default: 0 }, // In bytes
    lastCompactedAt: { type: Date }
}, {
    timestamps: true
});

// Indexes for fast range lookup
ledgerShardSchema.index({ startTime: 1, endTime: 1 });
ledgerShardSchema.index({ tenantCluster: 1, status: 1 });

module.exports = mongoose.model('LedgerShard', ledgerShardSchema);
