const cron = require('node-cron');
const MultiSigWallet = require('../models/MultiSigWallet');
const multiSigOrchestrator = require('../services/multiSigOrchestrator');
const approvalRepository = require('../repositories/approvalRepository');
const EventEmitter = require('events');

/**
 * Consensus Reconciler Job
 * Issue #797: Monitoring stalled quorums and triggering escalation alerts.
 * Runs periodically to ensure pending operations don't get stuck.
 */

class ConsensusReconciler extends EventEmitter {
    constructor() {
        super();
        this.isRunning = false;
        this.lastRunAt = null;

        // Configuration
        this.config = {
            // Hours before first escalation
            firstEscalationHours: 4,
            // Hours between subsequent escalations
            subsequentEscalationHours: 4,
            // Max escalation levels before auto-expiring
            maxEscalationLevels: 3,
            // Batch size for processing
            batchSize: 50,
            // Expiration buffer (minutes before expiry to warn)
            expirationWarningMinutes: 60
        };
    }

    /**
     * Start the reconciler cron job
     */
    start() {
        // Run every 30 minutes
        cron.schedule('*/30 * * * *', async () => {
            await this.run();
        });

        console.log('[ConsensusReconciler] Started - running every 30 minutes');

        // Also run immediately on startup
        this.run().catch(err => console.error('[ConsensusReconciler] Startup run error:', err));
    }

    /**
     * Main reconciliation run
     */
    async run() {
        if (this.isRunning) {
            console.log('[ConsensusReconciler] Already running, skipping');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();
        
        const stats = {
            checkedOperations: 0,
            escalatedOperations: 0,
            expiredOperations: 0,
            expiringWarnings: 0,
            errors: 0
        };

        try {
            console.log('[ConsensusReconciler] Starting reconciliation run...');

            // 1. Check for stalled operations needing escalation
            await this.processStallledOperations(stats);

            // 2. Check for expired operations
            await this.processExpiredOperations(stats);

            // 3. Check for operations about to expire
            await this.processExpiringOperations(stats);

            // 4. Verify integrity of recent operations
            await this.verifyRecentIntegrity(stats);

            this.lastRunAt = new Date();
            const duration = Date.now() - startTime;

            console.log(`[ConsensusReconciler] Completed in ${duration}ms:`, stats);

            this.emit('reconciliationComplete', {
                stats,
                duration,
                completedAt: this.lastRunAt
            });

        } catch (error) {
            console.error('[ConsensusReconciler] Run error:', error);
            stats.errors++;
            this.emit('reconciliationError', { error: error.message, stats });
        } finally {
            this.isRunning = false;
        }

        return stats;
    }

    /**
     * Process operations that need escalation
     */
    async processStallledOperations(stats) {
        const stalledOps = await approvalRepository.getStalledOperations(this.config.firstEscalationHours);
        
        for (const op of stalledOps) {
            stats.checkedOperations++;

            try {
                // Get full operation details
                const wallet = await MultiSigWallet.findOne({
                    'pendingOperations.operationId': op.operationId
                });

                if (!wallet) continue;

                const operation = wallet.pendingOperations.find(
                    o => o.operationId === op.operationId
                );

                if (!operation || operation.status !== 'PENDING') continue;

                // Calculate if escalation is needed
                const hoursSinceLastAction = this.calculateHoursSinceLastAction(operation);
                const shouldEscalate = this.shouldEscalate(operation, hoursSinceLastAction);

                if (shouldEscalate) {
                    const reason = this.generateEscalationReason(operation, hoursSinceLastAction);
                    
                    await multiSigOrchestrator.escalateOperation(op.operationId, reason);
                    
                    // Record in repository
                    await approvalRepository.recordEscalation({
                        operationId: op.operationId,
                        escalationLevel: operation.escalationLevel + 1,
                        reason,
                        notifiedUsers: wallet.authorizedSigners
                            .filter(s => s.canApprove && !operation.signatures.some(sig => sig.signerId.equals(s.userId)))
                            .map(s => s.userId)
                    });

                    stats.escalatedOperations++;

                    this.emit('operationEscalated', {
                        operationId: op.operationId,
                        escalationLevel: operation.escalationLevel + 1,
                        reason
                    });
                }

            } catch (error) {
                console.error(`[ConsensusReconciler] Error processing ${op.operationId}:`, error.message);
                stats.errors++;
            }
        }
    }

    /**
     * Process expired operations
     */
    async processExpiredOperations(stats) {
        const now = new Date();

        // Find all wallets with pending operations past their expiry
        const wallets = await MultiSigWallet.find({
            'pendingOperations.status': 'PENDING',
            'pendingOperations.expiresAt': { $lt: now }
        });

        for (const wallet of wallets) {
            const expiredOps = wallet.pendingOperations.filter(
                op => op.status === 'PENDING' && new Date(op.expiresAt) < now
            );

            for (const op of expiredOps) {
                stats.checkedOperations++;

                try {
                    // Mark as expired
                    op.status = 'EXPIRED';
                    op.resolvedAt = now;
                    wallet.stats.expiredOperations++;

                    // Record expiration trace
                    await approvalRepository.createTrace({
                        operationId: op.operationId,
                        workspaceId: wallet.workspaceId,
                        eventType: 'EXPIRED',
                        operationType: op.operationType,
                        amount: op.amount,
                        quorumState: {
                            required: op.requiredSignatures,
                            collected: op.signatures.filter(s => s.verified).length,
                            remaining: op.requiredSignatures - op.signatures.filter(s => s.verified).length,
                            eligible: op.totalEligibleSigners
                        },
                        metadata: {
                            expiresAt: op.expiresAt,
                            escalationLevel: op.escalationLevel
                        }
                    });

                    stats.expiredOperations++;

                    this.emit('operationExpired', {
                        operationId: op.operationId,
                        operationType: op.operationType,
                        amount: op.amount,
                        workspaceId: wallet.workspaceId
                    });

                } catch (error) {
                    console.error(`[ConsensusReconciler] Error expiring ${op.operationId}:`, error.message);
                    stats.errors++;
                }
            }

            if (expiredOps.length > 0) {
                await wallet.save();
            }
        }
    }

    /**
     * Warn about operations about to expire
     */
    async processExpiringOperations(stats) {
        const warningThreshold = new Date(Date.now() + this.config.expirationWarningMinutes * 60 * 1000);
        const now = new Date();

        const wallets = await MultiSigWallet.find({
            'pendingOperations.status': 'PENDING',
            'pendingOperations.expiresAt': { $gt: now, $lt: warningThreshold }
        });

        for (const wallet of wallets) {
            const expiringOps = wallet.pendingOperations.filter(
                op => op.status === 'PENDING' && 
                      new Date(op.expiresAt) > now && 
                      new Date(op.expiresAt) < warningThreshold
            );

            for (const op of expiringOps) {
                stats.checkedOperations++;

                const minutesRemaining = Math.round((new Date(op.expiresAt) - now) / (60 * 1000));
                const signaturesNeeded = op.requiredSignatures - op.signatures.filter(s => s.verified).length;

                this.emit('operationExpiringSoon', {
                    operationId: op.operationId,
                    operationType: op.operationType,
                    amount: op.amount,
                    workspaceId: wallet.workspaceId,
                    minutesRemaining,
                    signaturesNeeded,
                    pendingSigners: wallet.authorizedSigners
                        .filter(s => s.canApprove && !op.signatures.some(sig => sig.signerId.equals(s.userId)))
                        .map(s => s.userId)
                });

                stats.expiringWarnings++;
            }
        }
    }

    /**
     * Verify integrity of recent operations
     */
    async verifyRecentIntegrity(stats) {
        // Get operations from last 24 hours
        const recentOps = await approvalRepository.getStalledOperations(0);
        const uniqueOpIds = [...new Set(recentOps.map(o => o.operationId))];

        // Random sample for integrity check (10% or max 10)
        const sampleSize = Math.min(10, Math.ceil(uniqueOpIds.length * 0.1));
        const sampledIds = uniqueOpIds.sort(() => Math.random() - 0.5).slice(0, sampleSize);

        for (const operationId of sampledIds) {
            try {
                const integrity = await approvalRepository.verifyChainIntegrity(operationId);
                
                if (!integrity.valid) {
                    console.error(`[ConsensusReconciler] INTEGRITY VIOLATION: ${operationId} - ${integrity.reason}`);
                    
                    this.emit('integrityViolation', {
                        operationId,
                        reason: integrity.reason,
                        traceId: integrity.traceId
                    });
                    
                    stats.errors++;
                }
            } catch (error) {
                console.error(`[ConsensusReconciler] Integrity check error for ${operationId}:`, error.message);
            }
        }
    }

    /**
     * Calculate hours since last significant action on an operation
     */
    calculateHoursSinceLastAction(operation) {
        const lastAction = operation.lastEscalatedAt || 
                          operation.signatures[operation.signatures.length - 1]?.signedAt ||
                          operation.initiatedAt;

        return (Date.now() - new Date(lastAction)) / (60 * 60 * 1000);
    }

    /**
     * Determine if operation should be escalated
     */
    shouldEscalate(operation, hoursSinceLastAction) {
        // Don't escalate if max level reached
        if (operation.escalationLevel >= this.config.maxEscalationLevels) {
            return false;
        }

        // First escalation threshold
        if (operation.escalationLevel === 0) {
            return hoursSinceLastAction >= this.config.firstEscalationHours;
        }

        // Subsequent escalations
        return hoursSinceLastAction >= this.config.subsequentEscalationHours;
    }

    /**
     * Generate human-readable escalation reason
     */
    generateEscalationReason(operation, hoursSinceLastAction) {
        const signaturesNeeded = operation.requiredSignatures - 
            operation.signatures.filter(s => s.verified).length;

        const timeRemaining = Math.round((new Date(operation.expiresAt) - Date.now()) / (60 * 60 * 1000));

        return `Operation pending for ${Math.round(hoursSinceLastAction)} hours. ` +
               `${signaturesNeeded} more signature(s) needed. ` +
               `Expires in ${timeRemaining} hours.`;
    }

    /**
     * Get reconciler status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            lastRunAt: this.lastRunAt,
            config: this.config
        };
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('[ConsensusReconciler] Configuration updated:', this.config);
    }

    /**
     * Manual trigger for testing
     */
    async triggerManualRun() {
        console.log('[ConsensusReconciler] Manual run triggered');
        return this.run();
    }
}

module.exports = new ConsensusReconciler();
