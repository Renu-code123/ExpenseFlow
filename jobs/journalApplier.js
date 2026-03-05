const cron = require('node-cron');
const mongoose = require('mongoose');
const WriteJournal = require('../models/WriteJournal');
const consensusEngine = require('../services/consensusEngine');
const logger = require('../utils/structuredLogger');

/**
 * Journal Applier Background Job
 * Issue #769: Background worker finalizing journals into the main DB.
 * Orchestrates the transition from "JOURNALED" to "APPLIED" state using consensus logic.
 */
class JournalApplier {
    constructor() {
        this.isProcessing = false;
        this.modelMap = {
            'TRANSACTION': 'Transaction',
            'EXPENSE': 'Expense',
            'WORKSPACE': 'Workspace',
            'USER': 'User'
        };
    }

    start() {
        // Run every 30 seconds to flush the journal buffer
        cron.schedule('*/30 * * * * *', async () => {
            if (this.isProcessing) return;
            this.isProcessing = true;

            try {
                await this.processBuffer();
            } catch (err) {
                logger.error('[JournalApplier] Buffer processing failed', { error: err.message });
            } finally {
                this.isProcessing = false;
            }
        });
        console.log('✓ Journal Applier scheduled');
    }

    async processBuffer() {
        const pending = await WriteJournal.find({ status: 'PENDING' })
            .sort({ createdAt: 1 })
            .limit(50);

        if (pending.length === 0) return;

        logger.info(`[JournalApplier] Applying ${pending.length} pending operations`);

        for (const journal of pending) {
            try {
                await this.applyEntry(journal);
            } catch (err) {
                logger.error(`[JournalApplier] Failed to apply journal ${journal._id}`, { error: err.message });
                journal.status = 'CONFLICT';
                journal.retryCount += 1;
                await journal.save();
            }
        }
    }

    async applyEntry(journal) {
        const modelName = this.modelMap[journal.entityType];
        if (!modelName) throw new Error(`Unknown entity type: ${journal.entityType}`);

        const Model = mongoose.model(modelName);
        let entity = await Model.findById(journal.entityId);

        // Special case for CREATE: entity won't exist yet
        if (journal.operation === 'CREATE') {
            if (entity) {
                journal.status = 'STALE'; // Already exists
            } else {
                await Model.create({ ...journal.payload, _id: journal.entityId, vectorClock: journal.vectorClock });
                journal.status = 'APPLIED';
            }
        } else {
            if (!entity) {
                journal.status = 'STALE';
            } else {
                const result = await consensusEngine.reconcile(entity, journal);

                if (result.action === 'APPLY') {
                    if (journal.operation === 'UPDATE') {
                        Object.assign(entity, journal.payload);
                    } else if (journal.operation === 'DELETE') {
                        await entity.remove();
                        journal.status = 'APPLIED';
                        await journal.save();
                        return;
                    }

                    // Unified clock update logic
                    entity.vectorClock = journal.vectorClock;
                    await entity.save();
                    journal.status = 'APPLIED';
                } else if (result.action === 'CONFLICT') {
                    journal.status = 'CONFLICT';
                } else {
                    journal.status = 'STALE';
                }
            }
        }

        journal.appliedAt = new Date();
        await journal.save();
    }
}

module.exports = new JournalApplier();
