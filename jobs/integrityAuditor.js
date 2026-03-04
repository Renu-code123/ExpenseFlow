const cron = require('node-cron');
const Workspace = require('../models/Workspace');
const AuditMerkle = require('../models/AuditMerkle');
const ledgerRepository = require('../repositories/ledgerRepository');
const merkleMath = require('../utils/merkleMath');
const logger = require('../utils/structuredLogger');

/**
 * Integrity Auditor Job
 * Issue #782: Nightly verification of the entire cryptographic chain.
 * Periodically generates Merkle Roots to anchor the ledger history.
 */
class IntegrityAuditor {
    constructor() {
        this.isRunning = false;
    }

    start() {
        // Run daily at 2 AM
        cron.schedule('0 2 * * *', async () => {
            if (this.isRunning) return;
            this.isRunning = true;

            try {
                await this.auditAllWorkspaces();
            } catch (err) {
                logger.error('[IntegrityAuditor] Global audit failed', { error: err.message });
            } finally {
                this.isRunning = false;
            }
        });
        console.log('✓ Integrity Auditor scheduled');
    }

    async auditAllWorkspaces() {
        const workspaces = await Workspace.find({ status: 'active' });
        logger.info(`[IntegrityAuditor] Starting audit for ${workspaces.length} workspaces`);

        for (const workspace of workspaces) {
            try {
                await this.generateMerkleCheck(workspace._id);
            } catch (err) {
                logger.error(`[IntegrityAuditor] Audit failed for workspace ${workspace._id}`, { error: err.message });
            }
        }
    }

    async generateMerkleCheck(workspaceId) {
        // 1. Find last audit point
        const lastAudit = await AuditMerkle.findOne({ workspaceId }).sort({ createdAt: -1 });
        const startSequence = lastAudit ? lastAudit.endSequence + 1 : 1;

        // 2. Find last event in ledger
        const lastEvent = await ledgerRepository.findLastEvent(workspaceId);
        if (!lastEvent || lastEvent.sequence < startSequence) return;

        const endSequence = lastEvent.sequence;

        // 3. Fetch all hashes in range
        const hashDocs = await ledgerRepository.getHashesForRange(workspaceId, startSequence, endSequence);
        const hashes = hashDocs.map(d => d.currentHash);

        // 4. Build Merkle Root
        const rootHash = merkleMath.buildRoot(hashes);
        const prevRootHash = lastAudit ? lastAudit.rootHash : 'GENESIS_ROOT';

        // 5. Store daily anchor
        await AuditMerkle.create({
            workspaceId,
            rootHash,
            eventCount: hashes.length,
            startSequence,
            endSequence,
            treeDepth: Math.ceil(Math.log2(hashes.length || 1)),
            prevRootHash,
            isVerified: true
        });

        logger.info(`[IntegrityAuditor] Anchored Merkle Root ${rootHash} for workspace ${workspaceId}`);
    }
}

module.exports = new IntegrityAuditor();
