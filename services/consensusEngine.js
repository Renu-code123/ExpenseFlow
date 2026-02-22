const vectorClockUtils = require('../utils/vectorClockUtils');
const hashGenerator = require('../utils/hashGenerator');
const SyncConflict = require('../models/SyncConflict');
const logger = require('../utils/structuredLogger');

/**
 * Consensus Engine
 * Issue #730: Core logic for resolving state conflicts in a distributed environment.
 * Implements Vector Clock comparisons and Conflict Graveyard management.
 */
class ConsensusEngine {
    /**
     * Attempts to merge client state with server state
     * @param {Object} transaction - The existing server document
     * @param {Object} clientUpdate - The incoming update from client
     * @param {Object} clientClock - The vector clock from the client
     * @returns {Object} Result { action: 'update'|'ignore'|'conflict', data: Object }
     */
    async reconcile(transaction, clientUpdate, clientClock, deviceId) {
        const serverClock = transaction.vectorClock.toJSON();

        // 1. Determine causal relationship
        const relation = vectorClockUtils.compare(clientClock, serverClock);

        logger.debug('[ConsensusEngine] Comparing clocks', {
            transactionId: transaction._id,
            deviceId,
            relation
        });

        // 2. Scenario A: Client is behind (Older data) -> Ignore
        if (relation === 'smaller') {
            return { action: 'ignore', reason: 'stale_update' };
        }

        // 3. Scenario B: Client is strictly ahead (Causal update) -> Apply
        if (relation === 'greater') {
            const mergedClock = vectorClockUtils.increment(
                vectorClockUtils.merge(serverClock, clientClock),
                'server' // Update server's view
            );

            return {
                action: 'update',
                data: {
                    ...clientUpdate,
                    vectorClock: mergedClock,
                    'syncMetadata.checksum': hashGenerator.generateTransactionHash(clientUpdate)
                }
            };
        }

        // 4. Scenario C: Conflict (Concurrent updates) -> Move to Graveyard
        if (relation === 'concurrent' || relation === 'equal') {
            // Even if clocks are "equal", if data is different, it's a conflict
            const clientHash = hashGenerator.generateTransactionHash(clientUpdate);
            if (relation === 'equal' && transaction.syncMetadata.checksum === clientHash) {
                return { action: 'ignore', reason: 'redundant_update' };
            }

            logger.warn('[ConsensusEngine] Conflict detected', { transactionId: transaction._id });

            // Create a conflict record for manual resolution
            await SyncConflict.create({
                transactionId: transaction._id,
                userId: transaction.user,
                serverState: transaction.toObject(),
                clientState: clientUpdate,
                vectorClocks: {
                    server: serverClock,
                    client: clientClock
                },
                checksum: clientHash
            });

            return {
                action: 'conflict',
                data: {
                    'syncMetadata.syncStatus': 'conflict',
                    'syncMetadata.conflictsCount': (transaction.syncMetadata.conflictsCount || 0) + 1
                }
            };
        }

        return { action: 'ignore', reason: 'unknown_relation' };
    }

    /**
     * Manually resolve a conflict
     */
    async resolveConflict(conflictId, strategy, resolvedData) {
        const conflict = await SyncConflict.findById(conflictId).populate('transactionId');
        if (!conflict) throw new Error('Conflict record not found');

        const tx = conflict.transactionId;
        let finalData;

        switch (strategy) {
            case 'client_wins':
                finalData = conflict.clientState;
                break;
            case 'server_wins':
                finalData = conflict.serverState;
                break;
            case 'merge':
                finalData = { ...conflict.serverState, ...resolvedData };
                break;
            default:
                throw new Error('Invalid resolution strategy');
        }

        // Update transaction and mark conflict as resolved
        tx.set(finalData);
        tx.syncMetadata.syncStatus = 'synced';
        tx.syncMetadata.conflictsCount = Math.max(0, tx.syncMetadata.conflictsCount - 1);

        // Bump clock on resolution
        tx.vectorClock.set('server', (tx.vectorClock.get('server') || 0) + 1);

        await tx.save();

        conflict.status = 'resolved';
        conflict.resolutionStrategy = strategy;
        conflict.resolvedAt = new Date();
        await conflict.save();

        return { success: true, transaction: tx };
    }
}

module.exports = new ConsensusEngine();
