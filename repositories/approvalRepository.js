const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Approval Repository
 * Issue #797: High-integrity storage for cryptographic approval traces.
 * Provides audit-grade persistence for multi-sig operations.
 */

// Schema for approval trace records
const approvalTraceSchema = new mongoose.Schema({
    traceId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    operationId: {
        type: String,
        required: true,
        index: true
    },
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        index: true
    },
    walletId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MultiSigWallet'
    },
    eventType: {
        type: String,
        enum: ['INITIATED', 'SIGNATURE', 'SIGNATURE_FAILED', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED', 'ESCALATED'],
        required: true,
        index: true
    },
    // Operation details
    operationType: {
        type: String,
        enum: ['VIRTUAL_TRANSFER', 'VAULT_WITHDRAWAL', 'POLICY_CHANGE', 'THRESHOLD_UPDATE', 'EMERGENCY_OVERRIDE', 'BULK_EXPENSE', 'TREASURY_REBALANCE']
    },
    amount: Number,
    // Actor information
    actorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    actorRole: String,
    // Signature details
    signatureHash: String,
    proofType: String,
    proofValid: Boolean,
    // Quorum state at time of event
    quorumState: {
        required: Number,
        collected: Number,
        remaining: Number,
        eligible: Number
    },
    // Metadata
    metadata: mongoose.Schema.Types.Mixed,
    // Device/session info for forensics
    deviceFingerprint: String,
    ipAddress: String,
    userAgent: String,
    // Cryptographic chain
    prevTraceHash: String,
    currentTraceHash: {
        type: String,
        required: true,
        index: true
    },
    // Timestamps
    eventTimestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Create the model
const ApprovalTrace = mongoose.models.ApprovalTrace || 
    mongoose.model('ApprovalTrace', approvalTraceSchema);

class ApprovalRepository {
    constructor() {
        // Cache for recent operation lookups
        this.operationCache = new Map();
        this.CACHE_TTL = 60000; // 1 minute
    }

    /**
     * Record operation initiation
     */
    async recordInitiation(data) {
        const {
            operationId,
            workspaceId,
            walletId,
            operationType,
            amount,
            initiatorId,
            quorum,
            expiresAt
        } = data;

        const trace = await this.createTrace({
            operationId,
            workspaceId,
            walletId,
            eventType: 'INITIATED',
            operationType,
            amount,
            actorId: initiatorId,
            quorumState: {
                required: quorum.m,
                collected: 0,
                remaining: quorum.m,
                eligible: quorum.n
            },
            metadata: {
                expiresAt,
                requiredProofTypes: quorum.requiredProofTypes || [],
                maxApprovalHours: quorum.maxApprovalHours || 24
            }
        });

        // Cache the operation
        this.cacheOperation(operationId, {
            status: 'PENDING',
            initiatedAt: trace.eventTimestamp,
            ...data
        });

        return trace;
    }

    /**
     * Record successful signature
     */
    async recordSignature(data) {
        const {
            operationId,
            signerId,
            signatureHash,
            proofType,
            verified,
            quorumReached,
            signaturesCollected,
            signaturesRequired
        } = data;

        const trace = await this.createTrace({
            operationId,
            eventType: quorumReached ? 'APPROVED' : 'SIGNATURE',
            actorId: signerId,
            signatureHash,
            proofType,
            proofValid: verified,
            quorumState: {
                required: signaturesRequired,
                collected: signaturesCollected,
                remaining: Math.max(0, signaturesRequired - signaturesCollected),
                eligible: null // Not tracked per signature
            },
            metadata: {
                quorumReached
            }
        });

        // Update cache
        if (quorumReached) {
            this.updateCachedOperation(operationId, { status: 'APPROVED' });
        }

        return trace;
    }

    /**
     * Record failed signature attempt
     */
    async recordFailedSignature(data) {
        const {
            operationId,
            signerId,
            proofType,
            reason,
            deviceFingerprint,
            ipAddress
        } = data;

        return this.createTrace({
            operationId,
            eventType: 'SIGNATURE_FAILED',
            actorId: signerId,
            proofType,
            proofValid: false,
            deviceFingerprint,
            ipAddress,
            metadata: {
                failureReason: reason
            }
        });
    }

    /**
     * Record rejection
     */
    async recordRejection(data) {
        const { operationId, userId, reason, isFinal } = data;

        const trace = await this.createTrace({
            operationId,
            eventType: 'REJECTED',
            actorId: userId,
            metadata: {
                reason,
                isFinal
            }
        });

        if (isFinal) {
            this.updateCachedOperation(operationId, { status: 'REJECTED' });
        }

        return trace;
    }

    /**
     * Record execution
     */
    async recordExecution(data) {
        const { operationId, executorId, executedAt } = data;

        const trace = await this.createTrace({
            operationId,
            eventType: 'EXECUTED',
            actorId: executorId,
            eventTimestamp: executedAt,
            metadata: {
                executedAt
            }
        });

        this.updateCachedOperation(operationId, { status: 'EXECUTED' });

        return trace;
    }

    /**
     * Record escalation
     */
    async recordEscalation(data) {
        const { operationId, escalationLevel, reason, notifiedUsers } = data;

        return this.createTrace({
            operationId,
            eventType: 'ESCALATED',
            metadata: {
                escalationLevel,
                reason,
                notifiedUsers
            }
        });
    }

    /**
     * Create a new trace record with cryptographic chaining
     */
    async createTrace(data) {
        // Get the previous trace for this operation (if any)
        const prevTrace = await ApprovalTrace.findOne({
            operationId: data.operationId
        }).sort({ eventTimestamp: -1 });

        const prevHash = prevTrace ? prevTrace.currentTraceHash : 'GENESIS';

        // Generate trace ID
        const traceId = this.generateTraceId(data.operationId, data.eventType);

        // Calculate hash for this trace
        const currentHash = this.calculateTraceHash(prevHash, data);

        const trace = await ApprovalTrace.create({
            traceId,
            ...data,
            prevTraceHash: prevHash,
            currentTraceHash: currentHash
        });

        return trace;
    }

    /**
     * Generate unique trace ID
     */
    generateTraceId(operationId, eventType) {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(4).toString('hex');
        return `AT-${operationId.slice(-8)}-${eventType.slice(0, 3)}-${timestamp}-${random}`;
    }

    /**
     * Calculate trace hash for integrity
     */
    calculateTraceHash(prevHash, data) {
        const hashData = JSON.stringify({
            prevHash,
            operationId: data.operationId,
            eventType: data.eventType,
            actorId: data.actorId?.toString(),
            signatureHash: data.signatureHash,
            timestamp: data.eventTimestamp || new Date()
        });
        return crypto.createHash('sha256').update(hashData).digest('hex');
    }

    /**
     * Get operation status
     */
    async getOperationStatus(operationId) {
        // Check cache first
        const cached = this.getCachedOperation(operationId);
        if (cached) return cached;

        // Get latest trace for the operation
        const latestTrace = await ApprovalTrace.findOne({
            operationId
        }).sort({ eventTimestamp: -1 });

        if (!latestTrace) return null;

        // Reconstruct status from traces
        const allTraces = await ApprovalTrace.find({ operationId }).sort({ eventTimestamp: 1 });
        
        const signatures = allTraces.filter(t => t.eventType === 'SIGNATURE');
        const initiated = allTraces.find(t => t.eventType === 'INITIATED');

        let status = 'PENDING';
        if (allTraces.some(t => t.eventType === 'EXECUTED')) status = 'EXECUTED';
        else if (allTraces.some(t => t.eventType === 'APPROVED')) status = 'APPROVED';
        else if (allTraces.some(t => t.eventType === 'REJECTED' && t.metadata?.isFinal)) status = 'REJECTED';

        const result = {
            operationId,
            status,
            operationType: initiated?.operationType,
            amount: initiated?.amount,
            requiredSignatures: initiated?.quorumState?.required,
            collectedSignatures: signatures.length,
            remainingNeeded: Math.max(0, (initiated?.quorumState?.required || 0) - signatures.length),
            expiresAt: initiated?.metadata?.expiresAt,
            signatures: signatures.map(s => ({
                signerId: s.actorId,
                signatureHash: s.signatureHash,
                proofType: s.proofType,
                signedAt: s.eventTimestamp
            })),
            resolvedAt: latestTrace.eventType === 'EXECUTED' || latestTrace.eventType === 'APPROVED' || 
                       (latestTrace.eventType === 'REJECTED' && latestTrace.metadata?.isFinal)
                       ? latestTrace.eventTimestamp : null
        };

        // Cache the result
        this.cacheOperation(operationId, result);

        return result;
    }

    /**
     * Find matching pending operation
     */
    async findMatchingOperation(criteria) {
        const { workspaceId, operationType, amount, payloadHash, initiatorId } = criteria;

        // Look for recent initiated trace with matching criteria
        const recentInitiation = await ApprovalTrace.findOne({
            workspaceId,
            operationType,
            amount,
            eventType: 'INITIATED',
            actorId: initiatorId,
            eventTimestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
        }).sort({ eventTimestamp: -1 });

        if (!recentInitiation) return null;

        return this.getOperationStatus(recentInitiation.operationId);
    }

    /**
     * Get all traces for an operation
     */
    async getOperationHistory(operationId) {
        return ApprovalTrace.find({ operationId })
            .sort({ eventTimestamp: 1 })
            .populate('actorId', 'name email');
    }

    /**
     * Verify trace chain integrity
     */
    async verifyChainIntegrity(operationId) {
        const traces = await ApprovalTrace.find({ operationId }).sort({ eventTimestamp: 1 });

        if (traces.length === 0) return { valid: true, reason: 'No traces found' };

        let expectedPrevHash = 'GENESIS';

        for (const trace of traces) {
            if (trace.prevTraceHash !== expectedPrevHash) {
                return {
                    valid: false,
                    reason: `Chain broken at trace ${trace.traceId}`,
                    traceId: trace.traceId
                };
            }

            // Recalculate hash
            const expectedHash = this.calculateTraceHash(trace.prevTraceHash, {
                operationId: trace.operationId,
                eventType: trace.eventType,
                actorId: trace.actorId,
                signatureHash: trace.signatureHash,
                eventTimestamp: trace.eventTimestamp
            });

            if (expectedHash !== trace.currentTraceHash) {
                return {
                    valid: false,
                    reason: `Hash mismatch at trace ${trace.traceId}`,
                    traceId: trace.traceId
                };
            }

            expectedPrevHash = trace.currentTraceHash;
        }

        return { valid: true, tracesVerified: traces.length };
    }

    /**
     * Get statistics for a workspace
     */
    async getWorkspaceStats(workspaceId, startDate, endDate) {
        const match = { workspaceId: new mongoose.Types.ObjectId(workspaceId) };
        
        if (startDate || endDate) {
            match.eventTimestamp = {};
            if (startDate) match.eventTimestamp.$gte = startDate;
            if (endDate) match.eventTimestamp.$lte = endDate;
        }

        const stats = await ApprovalTrace.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$eventType',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount' }
                }
            }
        ]);

        return stats.reduce((acc, s) => {
            acc[s._id.toLowerCase()] = { count: s.count, totalAmount: s.totalAmount };
            return acc;
        }, {});
    }

    /**
     * Get pending operations older than threshold
     */
    async getStalledOperations(thresholdHours = 4) {
        const threshold = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);

        // Find initiated operations without recent activity
        const initiations = await ApprovalTrace.find({
            eventType: 'INITIATED',
            eventTimestamp: { $lt: threshold }
        });

        const stalled = [];

        for (const init of initiations) {
            const status = await this.getOperationStatus(init.operationId);
            if (status?.status === 'PENDING') {
                stalled.push({
                    operationId: init.operationId,
                    operationType: init.operationType,
                    amount: init.amount,
                    initiatedAt: init.eventTimestamp,
                    workspaceId: init.workspaceId,
                    stalledHours: Math.round((Date.now() - init.eventTimestamp) / (60 * 60 * 1000))
                });
            }
        }

        return stalled;
    }

    // Cache management
    cacheOperation(operationId, data) {
        this.operationCache.set(operationId, {
            data,
            cachedAt: Date.now()
        });
    }

    getCachedOperation(operationId) {
        const cached = this.operationCache.get(operationId);
        if (!cached) return null;
        
        if (Date.now() - cached.cachedAt > this.CACHE_TTL) {
            this.operationCache.delete(operationId);
            return null;
        }
        
        return cached.data;
    }

    updateCachedOperation(operationId, updates) {
        const cached = this.operationCache.get(operationId);
        if (cached) {
            cached.data = { ...cached.data, ...updates };
            cached.cachedAt = Date.now();
        }
    }
}

module.exports = new ApprovalRepository();
