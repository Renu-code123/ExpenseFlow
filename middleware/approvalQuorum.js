const multiSigOrchestrator = require('../services/multiSigOrchestrator');
const approvalRepository = require('../repositories/approvalRepository');

/**
 * Approval Quorum Middleware
 * Issue #797: Blocking execution of treasury events until quorum consensus is reached.
 * Intercepts high-value operations and enforces M-of-N approval requirements.
 */

// Operations that require quorum approval
const QUORUM_OPERATIONS = [
    'VIRTUAL_TRANSFER',
    'VAULT_WITHDRAWAL',
    'POLICY_CHANGE',
    'THRESHOLD_UPDATE',
    'BULK_EXPENSE',
    'TREASURY_REBALANCE'
];

// Default thresholds by operation type
const DEFAULT_THRESHOLDS = {
    VIRTUAL_TRANSFER: 10000,
    VAULT_WITHDRAWAL: 5000,
    POLICY_CHANGE: 0, // Always requires approval
    THRESHOLD_UPDATE: 0, // Always requires approval
    BULK_EXPENSE: 25000,
    TREASURY_REBALANCE: 50000
};

/**
 * Create middleware with optional configuration
 * @param {Object} options - Configuration options
 */
function createApprovalQuorumMiddleware(options = {}) {
    const {
        operationExtractor = defaultOperationExtractor,
        bypassRoles = ['SUPER_ADMIN'],
        enableCache = true
    } = options;

    return async function approvalQuorumMiddleware(req, res, next) {
        try {
            // 1. Extract operation details from request
            const operationDetails = operationExtractor(req);
            
            if (!operationDetails || !QUORUM_OPERATIONS.includes(operationDetails.type)) {
                return next(); // Not a quorum-controlled operation
            }

            const { type, amount, workspaceId, payload } = operationDetails;
            const userId = req.user?._id;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required for treasury operations'
                });
            }

            // 2. Check for bypass roles
            if (bypassRoles.includes(req.user?.role)) {
                req.quorumBypassed = true;
                return next();
            }

            // 3. Check if operation requires multi-sig
            const multiSigCheck = await multiSigOrchestrator.requiresMultiSig(
                workspaceId,
                amount,
                type
            );

            if (!multiSigCheck.required) {
                return next(); // Below threshold, proceed normally
            }

            // 4. Check if there's already an approved operation for this request
            const existingApproval = await checkExistingApproval(req, operationDetails);
            
            if (existingApproval?.status === 'APPROVED') {
                // Attach approval proof to request
                req.multiSigApproval = existingApproval;
                req.quorumSatisfied = true;
                return next();
            }

            if (existingApproval?.status === 'PENDING') {
                // Operation awaiting signatures
                return res.status(202).json({
                    success: false,
                    code: 'QUORUM_PENDING',
                    message: 'Operation awaiting multi-signature approval',
                    data: {
                        operationId: existingApproval.operationId,
                        requiredSignatures: existingApproval.requiredSignatures,
                        collectedSignatures: existingApproval.collectedSignatures,
                        remainingNeeded: existingApproval.remainingNeeded,
                        expiresAt: existingApproval.expiresAt
                    }
                });
            }

            // 5. Initiate new multi-sig operation
            const newOperation = await multiSigOrchestrator.initiateOperation({
                workspaceId,
                operationType: type,
                payload,
                amount,
                initiatorId: userId
            });

            // 6. Return pending status - operation blocked until quorum
            return res.status(202).json({
                success: false,
                code: 'QUORUM_INITIATED',
                message: 'Multi-signature approval required. Operation initiated.',
                data: {
                    operationId: newOperation.operationId,
                    requiredSignatures: newOperation.requiredSignatures,
                    totalEligibleSigners: newOperation.totalEligibleSigners,
                    expiresAt: newOperation.expiresAt,
                    threshold: multiSigCheck.threshold,
                    amount
                }
            });

        } catch (error) {
            console.error('[ApprovalQuorum] Error:', error.message);
            return res.status(500).json({
                success: false,
                error: 'Failed to process quorum approval',
                details: error.message
            });
        }
    };
}

/**
 * Default operation extractor from request
 */
function defaultOperationExtractor(req) {
    // Check various possible sources for operation details
    
    // Treasury transfer endpoint
    if (req.path.includes('/treasury/transfer') || req.path.includes('/treasury/move')) {
        return {
            type: 'VIRTUAL_TRANSFER',
            amount: parseFloat(req.body.amount) || 0,
            workspaceId: req.body.workspaceId || req.params.workspaceId || req.user?.workspaceId,
            payload: req.body
        };
    }

    // Vault withdrawal
    if (req.path.includes('/vault/withdraw')) {
        return {
            type: 'VAULT_WITHDRAWAL',
            amount: parseFloat(req.body.amount) || 0,
            workspaceId: req.body.workspaceId || req.params.workspaceId || req.user?.workspaceId,
            payload: req.body
        };
    }

    // Policy changes
    if (req.path.includes('/governance/policies') && req.method === 'POST') {
        return {
            type: 'POLICY_CHANGE',
            amount: 0,
            workspaceId: req.body.workspaceId || req.user?.workspaceId,
            payload: req.body
        };
    }

    // Threshold updates
    if (req.path.includes('/threshold') && (req.method === 'POST' || req.method === 'PUT')) {
        return {
            type: 'THRESHOLD_UPDATE',
            amount: 0,
            workspaceId: req.body.workspaceId || req.params.workspaceId || req.user?.workspaceId,
            payload: req.body
        };
    }

    // Bulk expenses
    if (req.path.includes('/expenses/bulk') && req.method === 'POST') {
        const totalAmount = Array.isArray(req.body.expenses) 
            ? req.body.expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
            : 0;
        return {
            type: 'BULK_EXPENSE',
            amount: totalAmount,
            workspaceId: req.body.workspaceId || req.user?.workspaceId,
            payload: req.body
        };
    }

    // Explicit multi-sig header
    if (req.headers['x-multisig-operation']) {
        return {
            type: req.headers['x-multisig-operation'],
            amount: parseFloat(req.headers['x-multisig-amount']) || parseFloat(req.body.amount) || 0,
            workspaceId: req.headers['x-workspace-id'] || req.body.workspaceId || req.user?.workspaceId,
            payload: req.body
        };
    }

    return null;
}

/**
 * Check for existing approval matching this request
 */
async function checkExistingApproval(req, operationDetails) {
    // Check if request includes an operation ID (pre-approved)
    const operationId = req.headers['x-multisig-operation-id'] || req.body.multiSigOperationId;
    
    if (operationId) {
        return await approvalRepository.getOperationStatus(operationId);
    }

    // Check for matching pending operation
    const payloadHash = require('crypto')
        .createHash('sha256')
        .update(JSON.stringify(operationDetails.payload))
        .digest('hex')
        .slice(0, 16);

    return await approvalRepository.findMatchingOperation({
        workspaceId: operationDetails.workspaceId,
        operationType: operationDetails.type,
        amount: operationDetails.amount,
        payloadHash,
        initiatorId: req.user._id
    });
}

/**
 * Express middleware to verify operation is approved
 */
function verifyApprovalMiddleware(req, res, next) {
    if (req.quorumBypassed || req.quorumSatisfied) {
        return next();
    }

    // For endpoints that require pre-approval
    const operationId = req.headers['x-multisig-operation-id'] || req.body.multiSigOperationId;
    
    if (!operationId) {
        return res.status(403).json({
            success: false,
            code: 'APPROVAL_REQUIRED',
            message: 'This operation requires multi-signature approval'
        });
    }

    return next();
}

/**
 * Middleware to attach approval proof to ledger entries
 */
async function attachApprovalProof(req, res, next) {
    if (req.multiSigApproval) {
        req.approvalProof = {
            operationId: req.multiSigApproval.operationId,
            signatures: req.multiSigApproval.signatures,
            quorumConfig: req.multiSigApproval.quorumConfig,
            approvedAt: req.multiSigApproval.resolvedAt
        };
    }
    next();
}

/**
 * Signature submission endpoint handler
 */
async function handleSignatureSubmission(req, res) {
    try {
        const {
            operationId,
            proofType,
            proofData
        } = req.body;

        const result = await multiSigOrchestrator.submitSignature({
            operationId,
            signerId: req.user._id,
            proofType,
            proofData,
            deviceFingerprint: req.headers['x-device-fingerprint'],
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get pending approvals for current user
 */
async function getPendingApprovals(req, res) {
    try {
        const pending = await multiSigOrchestrator.getPendingForUser(req.user._id);
        
        res.json({
            success: true,
            data: {
                pending,
                count: pending.length
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    middleware: createApprovalQuorumMiddleware,
    verifyApproval: verifyApprovalMiddleware,
    attachApprovalProof,
    handleSignatureSubmission,
    getPendingApprovals,
    QUORUM_OPERATIONS,
    DEFAULT_THRESHOLDS
};
