const complianceOrchestrator = require('./complianceOrchestrator');
const logger = require('../utils/structuredLogger');

/**
 * ComplianceGuard Service
 * Issue #907: Logic for protecting system from adversarial inputs.
 * Features "Hardened-Mode" which ignores historical heuristics to prevent 'Mimicry' attacks.
 */
class ComplianceGuardService {
    /**
     * Evaluate transaction with optional hardening.
     */
    async evaluateTransaction(workspaceId, transaction, options = {}) {
        const { isHardened = false } = options;

        if (isHardened) {
            logger.info(`[ComplianceGuard] Running in HARDENED-MODE for Workspace: ${workspaceId}. Ignoring historical trust scores.`);
        }

        // Add hardening flag to context
        const contextData = {
            isHardened,
            redTeamAudit: options.redTeamAudit || false,
            timestamp: new Date()
        };

        const result = await complianceOrchestrator.evaluate(
            workspaceId,
            'TRANSACTION',
            transaction,
            contextData
        );

        // If hardened mode is on, we are more strict on 'FLAG' actions
        if (isHardened && result.action === 'FLAG') {
            result.action = 'DENY';
            result.allowed = false;
            result.reason = `HARDENED_SECURITY: ${result.reason} (Escalated from FLAG to DENY)`;
        }

        return result;
    }

    /**
     * Update the robustness score of a workspace based on red-team performance.
     */
    async updateRobustnessScore(workspaceId, scoreAdjustment) {
        const Workspace = require('../models/Workspace');
        const workspace = await Workspace.findById(workspaceId);
        if (workspace) {
            workspace.robustnessScore = Math.max(0, Math.min(1, (workspace.robustnessScore || 0.8) + scoreAdjustment));
            await workspace.save();
        }
    }
}

module.exports = new ComplianceGuardService();
