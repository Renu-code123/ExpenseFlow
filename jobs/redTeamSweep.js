const cron = require('node-cron');
const AdversarialSimulator = require('../services/adversarialSimulator');
const complianceOrchestrator = require('../services/complianceOrchestrator');
const IncidentRepository = require('../repositories/incidentRepository');
const Workspace = require('../models/Workspace');
const logger = require('../utils/structuredLogger');

/**
 * RedTeamSweep Job
 * Issue #907: Periodic "Stress-Test" of validation logic.
 * Autonomously runs adversarial simulations against all active workspaces.
 */
class RedTeamSweepJob {
    start() {
        // Run every day at 03:00 AM
        cron.schedule('0 3 * * *', async () => {
            logger.info('[RedTeamSweep] Starting automated adversarial stress test...');
            await this.performGlobalAudit();
        });
    }

    async performGlobalAudit() {
        const workspaces = await Workspace.find({ status: 'active' });

        for (const workspace of workspaces) {
            try {
                // 1. Generate adversarial transactions
                const attacks = await AdversarialSimulator.generateAdversarialBatch(workspace._id);

                // 2. Test them against the Compliance Orchestrator
                for (const attack of attacks) {
                    const result = await complianceOrchestrator.evaluate(
                        workspace._id,
                        'TRANSACTION',
                        attack
                    );

                    // 3. If it bypassed (allowed = true, but it's a known attack)
                    if (result.allowed) {
                        logger.error(`[RedTeamSweep] ATTACK BYPASS: ${attack.attackVector} successful in Workspace ${workspace._id}`);

                        await IncidentRepository.logFailure({
                            workspaceId: workspace._id,
                            type: 'ADVERSARIAL_BYPASS',
                            severity: 'HIGH',
                            attackVector: attack.attackVector,
                            metadata: {
                                payload: attack,
                                evaluationResult: result
                            }
                        });
                    }
                }
            } catch (err) {
                logger.error(`[RedTeamSweep] Failed for workspace ${workspace._id}:`, err);
            }
        }
    }
}

module.exports = new RedTeamSweepJob();
