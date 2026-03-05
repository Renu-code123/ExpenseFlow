const cron = require('node-cron');
const LedgerShard = require('../models/LedgerShard');
const QuantumAnchor = require('../models/QuantumAnchor');
const pqcSignatureService = require('../services/pqcSignatureService');
const ledgerRepository = require('../repositories/ledgerRepository');
const LatticeMath = require('../utils/latticeMath');
const logger = require('../utils/structuredLogger');

/**
 * Anchor Generator Job
 * Issue #960: Recurring job to compute and sign state roots with PQC algorithms.
 */
class AnchorGenerator {
    start() {
        // Run every hour to anchor the latest ledger state
        cron.schedule('0 * * * *', async () => {
            logger.info('[PQC-Anchor] Starting quantum-resistant state anchoring...');
            await this.generateGlobalAnchors();
        });
    }

    async generateGlobalAnchors() {
        try {
            // Find active shards that need anchoring
            const activeShards = await LedgerShard.find({ status: 'active' });

            for (const shard of activeShards) {
                await this.anchorShard(shard);
            }
        } catch (err) {
            logger.error('[PQC-Anchor] Global anchoring failed:', err);
        }
    }

    async anchorShard(shard) {
        try {
            // 1. Get recent events from the shard
            const events = await ledgerRepository.getEventStream(null, {
                limit: 100,
                startTimestamp: new Date(Date.now() - 3600000), // Last hour
                shardCollection: shard.collectionName
            });

            if (events.length === 0) return;

            // 2. Compute Lattice State Root
            const stateRoot = LatticeMath.computeStateRoot(events);

            // 3. Generate PQC Signature
            const pqcSignature = await pqcSignatureService.signRoot(stateRoot);

            // 4. Create Anchor Record
            const lastAnchor = await QuantumAnchor.findOne({ shardId: shard.shardId }).sort({ snapshotSequence: -1 });
            const nextSequence = (lastAnchor?.snapshotSequence || 0) + 1;

            await QuantumAnchor.create({
                shardId: shard.shardId,
                snapshotSequence: nextSequence,
                stateRoot,
                pqcSignature,
                shardHeaderHash: events[events.length - 1]?.currentHash,
                metadata: { eventCount: events.length }
            });

            logger.info(`[PQC-Anchor] ✓ Anchored shard ${shard.shardId} at sequence ${nextSequence}`);
        } catch (err) {
            logger.error(`[PQC-Anchor] Failed to anchor shard ${shard.shardId}:`, err);
        }
    }
}

module.exports = new AnchorGenerator();
