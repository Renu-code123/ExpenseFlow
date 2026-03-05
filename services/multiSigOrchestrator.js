const MultiSigWallet = require('../models/MultiSigWallet');
const PolicyNode = require('../models/PolicyNode');
const signatureBridge = require('../utils/signatureBridge');
const approvalRepository = require('../repositories/approvalRepository');
const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * Multi-Signature Orchestrator Service
 * Issue #797: Coordination of complex approval chains across multiple peers.
 * Implements M-of-N consensus quorum for institutional-grade governance.
 */
class MultiSigOrchestrator extends EventEmitter {
    constructor() {
        super();
        // Default thresholds
        this.DEFAULT_HIGH_VALUE_THRESHOLD = 10000; // $10,000
        this.DEFAULT_CRITICAL_THRESHOLD = 100000;  // $100,000
        this.DEFAULT_APPROVAL_TIMEOUT_HOURS = 24;
        this.ESCALATION_INTERVALS = [4, 8, 12]; // Hours for escalation levels
    }

    /**
     * Initialize a new multi-sig operation
     * @param {Object} params - Operation parameters
     * @returns {Object} Pending operation details
     */
    async initiateOperation(params) {
        const {
            workspaceId,
            operationType,
            payload,
            amount,
            initiatorId,
            walletId = null,
            customQuorum = null
        } = params;

        // 1. Get or create the multi-sig wallet for this workspace
        let wallet = await this.getOrCreateWallet(workspaceId, walletId);
        
        // 2. Verify initiator is authorized
        const initiatorAuth = wallet.authorizedSigners.find(
            s => s.userId.equals(initiatorId) && s.canInitiate
        );
        if (!initiatorAuth) {
            throw new Error('User not authorized to initiate operations');
        }

        // 3. Determine quorum requirements based on amount and policies
        const quorum = customQuorum || await this.resolveQuorum(wallet, amount, operationType);

        // 4. Generate unique operation ID
        const operationId = this.generateOperationId(workspaceId, operationType);

        // 5. Calculate expiration
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + quorum.maxApprovalHours);

        // 6. Create the pending operation
        const pendingOp = {
            operationId,
            operationType,
            payload,
            amount,
            initiatedBy: initiatorId,
            initiatedAt: new Date(),
            requiredSignatures: quorum.m,
            totalEligibleSigners: quorum.n,
            quorumConfig: {
                m: quorum.m,
                n: quorum.n,
                thresholdPercent: quorum.thresholdPercent
            },
            signatures: [],
            status: 'PENDING',
            expiresAt,
            escalationLevel: 0
        };

        wallet.pendingOperations.push(pendingOp);
        wallet.stats.totalOperations += 1;
        await wallet.save();

        // 7. Store in approval repository for audit trail
        await approvalRepository.recordInitiation({
            operationId,
            workspaceId,
            walletId: wallet._id,
            operationType,
            amount,
            initiatorId,
            quorum,
            expiresAt
        });

        // 8. Notify eligible signers
        this.emit('operationInitiated', {
            operationId,
            workspaceId,
            operationType,
            amount,
            requiredSignatures: quorum.m,
            eligibleSigners: wallet.authorizedSigners.filter(s => s.canApprove).map(s => s.userId)
        });

        console.log(`[MultiSig] Operation ${operationId} initiated: ${operationType} for $${amount}`);

        return {
            operationId,
            status: 'PENDING',
            requiredSignatures: quorum.m,
            totalEligibleSigners: quorum.n,
            expiresAt,
            walletId: wallet._id
        };
    }

    /**
     * Submit a signature for a pending operation
     * @param {Object} params - Signature parameters
     * @returns {Object} Updated operation status
     */
    async submitSignature(params) {
        const {
            operationId,
            signerId,
            proofType,
            proofData,
            deviceFingerprint = null,
            ipAddress = null,
            userAgent = null
        } = params;

        // 1. Find the wallet and operation
        const wallet = await MultiSigWallet.findOne({
            'pendingOperations.operationId': operationId
        });

        if (!wallet) {
            throw new Error('Operation not found');
        }

        // 2. Verify user can sign
        const canSign = wallet.canUserSign(signerId, operationId);
        if (!canSign.canSign) {
            throw new Error(canSign.reason);
        }

        // 3. Verify the cryptographic proof
        const verification = await signatureBridge.verifyProof({
            userId: signerId,
            proofType,
            proofData,
            operationId,
            payload: canSign.operation.payload
        });

        if (!verification.valid) {
            // Record failed attempt
            await approvalRepository.recordFailedSignature({
                operationId,
                signerId,
                proofType,
                reason: verification.reason,
                deviceFingerprint,
                ipAddress
            });
            throw new Error(`Signature verification failed: ${verification.reason}`);
        }

        // 4. Generate signature hash
        const signatureHash = this.generateSignatureHash(
            operationId,
            signerId,
            verification.proofHash,
            canSign.operation.payload
        );

        // 5. Add signature to operation
        const signature = {
            signerId,
            signedAt: new Date(),
            signatureHash,
            proofType,
            deviceFingerprint,
            ipAddress,
            userAgent,
            verified: true,
            verifiedAt: new Date(),
            verificationMethod: verification.method
        };

        const opIndex = wallet.pendingOperations.findIndex(
            op => op.operationId === operationId
        );
        wallet.pendingOperations[opIndex].signatures.push(signature);

        // 6. Check if quorum is reached
        const quorumReached = wallet.isQuorumReached(operationId);
        
        if (quorumReached) {
            wallet.pendingOperations[opIndex].status = 'APPROVED';
            wallet.pendingOperations[opIndex].resolvedAt = new Date();
            wallet.stats.approvedOperations += 1;
            
            // Calculate approval time
            const approvalTimeMs = new Date() - wallet.pendingOperations[opIndex].initiatedAt;
            wallet.stats.averageApprovalTimeMs = 
                (wallet.stats.averageApprovalTimeMs * (wallet.stats.approvedOperations - 1) + approvalTimeMs) 
                / wallet.stats.approvedOperations;
        }

        await wallet.save();

        // 7. Record in audit trail
        await approvalRepository.recordSignature({
            operationId,
            signerId,
            signatureHash,
            proofType,
            verified: true,
            quorumReached,
            signaturesCollected: wallet.pendingOperations[opIndex].signatures.length,
            signaturesRequired: wallet.pendingOperations[opIndex].requiredSignatures
        });

        // 8. Emit events
        this.emit('signatureSubmitted', {
            operationId,
            signerId,
            proofType,
            quorumReached,
            signaturesCollected: wallet.pendingOperations[opIndex].signatures.length,
            signaturesRequired: wallet.pendingOperations[opIndex].requiredSignatures
        });

        if (quorumReached) {
            this.emit('quorumReached', {
                operationId,
                operationType: wallet.pendingOperations[opIndex].operationType,
                payload: wallet.pendingOperations[opIndex].payload,
                amount: wallet.pendingOperations[opIndex].amount,
                signatures: wallet.pendingOperations[opIndex].signatures
            });
        }

        console.log(`[MultiSig] Signature submitted for ${operationId} by ${signerId}. Quorum: ${quorumReached}`);

        return wallet.getOperationSummary(operationId);
    }

    /**
     * Reject a pending operation
     */
    async rejectOperation(operationId, userId, reason) {
        const wallet = await MultiSigWallet.findOne({
            'pendingOperations.operationId': operationId
        });

        if (!wallet) {
            throw new Error('Operation not found');
        }

        const signer = wallet.authorizedSigners.find(
            s => s.userId.equals(userId) && s.canReject
        );
        if (!signer) {
            throw new Error('User not authorized to reject operations');
        }

        const opIndex = wallet.pendingOperations.findIndex(
            op => op.operationId === operationId
        );

        if (wallet.pendingOperations[opIndex].status !== 'PENDING') {
            throw new Error('Operation is not pending');
        }

        wallet.pendingOperations[opIndex].rejections.push({
            userId,
            rejectedAt: new Date(),
            reason
        });

        // Check if rejection threshold is met (e.g., any admin can reject)
        if (signer.role === 'OWNER' || signer.role === 'ADMIN') {
            wallet.pendingOperations[opIndex].status = 'REJECTED';
            wallet.pendingOperations[opIndex].resolvedAt = new Date();
            wallet.pendingOperations[opIndex].resolvedBy = userId;
            wallet.stats.rejectedOperations += 1;
        }

        await wallet.save();

        await approvalRepository.recordRejection({
            operationId,
            userId,
            reason,
            isFinal: wallet.pendingOperations[opIndex].status === 'REJECTED'
        });

        this.emit('operationRejected', {
            operationId,
            userId,
            reason,
            isFinal: wallet.pendingOperations[opIndex].status === 'REJECTED'
        });

        return wallet.getOperationSummary(operationId);
    }

    /**
     * Execute an approved operation
     */
    async executeApprovedOperation(operationId, executorId) {
        const wallet = await MultiSigWallet.findOne({
            'pendingOperations.operationId': operationId
        });

        if (!wallet) {
            throw new Error('Operation not found');
        }

        const opIndex = wallet.pendingOperations.findIndex(
            op => op.operationId === operationId
        );
        const operation = wallet.pendingOperations[opIndex];

        if (operation.status !== 'APPROVED') {
            throw new Error('Operation is not approved');
        }

        // Mark as executed
        wallet.pendingOperations[opIndex].status = 'EXECUTED';
        wallet.pendingOperations[opIndex].resolvedBy = executorId;
        await wallet.save();

        await approvalRepository.recordExecution({
            operationId,
            executorId,
            executedAt: new Date()
        });

        this.emit('operationExecuted', {
            operationId,
            operationType: operation.operationType,
            payload: operation.payload,
            amount: operation.amount,
            executorId
        });

        return {
            operationId,
            status: 'EXECUTED',
            operationType: operation.operationType,
            payload: operation.payload
        };
    }

    /**
     * Escalate a stalled operation
     */
    async escalateOperation(operationId, reason) {
        const wallet = await MultiSigWallet.findOne({
            'pendingOperations.operationId': operationId
        });

        if (!wallet) {
            throw new Error('Operation not found');
        }

        const opIndex = wallet.pendingOperations.findIndex(
            op => op.operationId === operationId
        );
        const operation = wallet.pendingOperations[opIndex];

        if (operation.status !== 'PENDING') {
            return null; // Operation already resolved
        }

        const newLevel = operation.escalationLevel + 1;
        
        // Get signers who haven't signed yet
        const pendingSigners = wallet.authorizedSigners.filter(s => 
            s.canApprove && 
            !operation.signatures.some(sig => sig.signerId.equals(s.userId))
        );

        wallet.pendingOperations[opIndex].escalationLevel = newLevel;
        wallet.pendingOperations[opIndex].lastEscalatedAt = new Date();
        wallet.pendingOperations[opIndex].escalationHistory.push({
            level: newLevel,
            escalatedAt: new Date(),
            reason,
            notifiedUsers: pendingSigners.map(s => s.userId)
        });

        await wallet.save();

        this.emit('operationEscalated', {
            operationId,
            escalationLevel: newLevel,
            reason,
            pendingSigners: pendingSigners.map(s => s.userId)
        });

        console.log(`[MultiSig] Operation ${operationId} escalated to level ${newLevel}`);

        return {
            operationId,
            escalationLevel: newLevel,
            pendingSigners: pendingSigners.length
        };
    }

    /**
     * Get or create a multi-sig wallet for a workspace
     */
    async getOrCreateWallet(workspaceId, walletId = null) {
        if (walletId) {
            const wallet = await MultiSigWallet.findById(walletId);
            if (wallet) return wallet;
        }

        let wallet = await MultiSigWallet.findOne({ workspaceId, isActive: true });
        
        if (!wallet) {
            // Create default wallet
            wallet = await MultiSigWallet.create({
                workspaceId,
                walletName: 'Default Treasury Wallet',
                description: 'Auto-created multi-sig wallet for treasury operations',
                defaultQuorum: { m: 2, n: 3, mode: 'FIXED' },
                thresholdRules: [
                    { minAmount: 1000, requiredM: 2, requiredProofTypes: ['PASSWORD'], maxApprovalHours: 24 },
                    { minAmount: 10000, requiredM: 3, requiredProofTypes: ['PASSWORD', 'TOTP'], maxApprovalHours: 12 },
                    { minAmount: 100000, requiredM: 4, requiredProofTypes: ['PASSWORD', 'HARDWARE_KEY'], maxApprovalHours: 6 }
                ],
                authorizedSigners: [],
                inheritFromWorkspace: true
            });
        }

        return wallet;
    }

    /**
     * Resolve quorum requirements considering inheritance
     */
    async resolveQuorum(wallet, amount, operationType) {
        // 1. Get base quorum from wallet
        let quorum = wallet.getQuorumForAmount(amount);

        // 2. Check workspace policy overrides
        if (wallet.inheritFromWorkspace && wallet.workspaceId) {
            const policy = await PolicyNode.findOne({
                workspaceId: wallet.workspaceId,
                targetResource: 'TREASURY',
                isActive: true,
                'conditions.quorumOverride': { $exists: true }
            });

            if (policy?.conditions?.quorumOverride) {
                quorum = {
                    ...quorum,
                    ...policy.conditions.quorumOverride
                };
            }
        }

        // 3. Apply operation-type specific rules
        if (operationType === 'EMERGENCY_OVERRIDE') {
            quorum.m = Math.max(quorum.m, Math.ceil(quorum.n * 0.75)); // 75% for emergencies
            quorum.requiredProofTypes = ['HARDWARE_KEY', 'BIOMETRIC'];
        }

        return quorum;
    }

    /**
     * Generate unique operation ID
     */
    generateOperationId(workspaceId, operationType) {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(4).toString('hex');
        return `MSO-${workspaceId.toString().slice(-6)}-${operationType.slice(0, 2)}-${timestamp}-${random}`;
    }

    /**
     * Generate signature hash
     */
    generateSignatureHash(operationId, signerId, proofHash, payload) {
        const data = JSON.stringify({
            operationId,
            signerId: signerId.toString(),
            proofHash,
            payloadHash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
            timestamp: Date.now()
        });
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Get pending operations for a user
     */
    async getPendingForUser(userId) {
        const wallets = await MultiSigWallet.find({
            'authorizedSigners.userId': userId,
            'pendingOperations.status': 'PENDING'
        });

        const pending = [];
        for (const wallet of wallets) {
            for (const op of wallet.pendingOperations.filter(o => o.status === 'PENDING')) {
                const alreadySigned = op.signatures.some(sig => sig.signerId.equals(userId));
                if (!alreadySigned) {
                    pending.push({
                        walletId: wallet._id,
                        walletName: wallet.walletName,
                        workspaceId: wallet.workspaceId,
                        ...wallet.getOperationSummary(op.operationId)
                    });
                }
            }
        }

        return pending;
    }

    /**
     * Check if an amount requires multi-sig approval
     */
    async requiresMultiSig(workspaceId, amount, operationType = 'VIRTUAL_TRANSFER') {
        const wallet = await MultiSigWallet.findOne({ workspaceId, isActive: true });
        
        if (!wallet) {
            return { required: amount >= this.DEFAULT_HIGH_VALUE_THRESHOLD, threshold: this.DEFAULT_HIGH_VALUE_THRESHOLD };
        }

        const lowestThreshold = wallet.thresholdRules.length > 0
            ? Math.min(...wallet.thresholdRules.map(r => r.minAmount))
            : this.DEFAULT_HIGH_VALUE_THRESHOLD;

        return {
            required: amount >= lowestThreshold,
            threshold: lowestThreshold,
            quorum: wallet.getQuorumForAmount(amount)
        };
    }
}

module.exports = new MultiSigOrchestrator();
