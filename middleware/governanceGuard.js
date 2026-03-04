const policyResolver = require('../services/policyResolver');
const riskScoring = require('../utils/riskScoring');
const logger = require('../utils/structuredLogger');

/**
 * Governance Guard Middleware
 * Issue #757: Intercepts mutations to verify hierarchical policy compliance
 * before the transaction hits the processing pipeline.
 */
const governanceGuard = async (req, res, next) => {
    try {
        const workspaceId = req.headers['x-workspace-id'] || req.body.workspaceId;
        const tenantId = req.headers['x-tenant-id']; // Optional, can resolve from workspace
        const transactionData = req.body;

        if (!workspaceId) return next();

        // 1. Resolve Rules
        const rule = await policyResolver.getRuleForTransaction(transactionData, workspaceId, tenantId);

        if (rule) {
            const risk = riskScoring.calculateScore(transactionData, rule);
            const severity = riskScoring.getSeverity(risk);

            // 2. Enforcement Logic
            if (rule.action === 'block' || (rule.isBlocking && risk > 60)) {
                logger.warn('Governance BLOCKED transaction', {
                    workspaceId,
                    amount: transactionData.amount,
                    category: transactionData.category,
                    riskScore: risk,
                    policyLevel: rule.level
                });

                return res.status(403).json({
                    success: false,
                    error: 'Governance Policy Violation',
                    message: `This transaction exceeds the ${rule.level}-level policy limits for ${transactionData.category}.`,
                    riskSummary: { score: risk, severity }
                });
            }

            // Attach metadata for downstream consumption
            req.governanceContext = { rule, risk, severity };
        }

        next();
    } catch (err) {
        console.error('[GovernanceGuard Error]:', err.message);
        next();
    }
};

module.exports = governanceGuard;
