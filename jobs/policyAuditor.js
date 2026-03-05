const cron = require('node-cron');
const Transaction = require('../models/Transaction');
const policyResolver = require('../services/policyResolver');
const riskScoring = require('../utils/riskScoring');
const logger = require('../utils/structuredLogger');

/**
 * Policy Auditor Job
 * Issue #757: Performs daily retroactive audits of all approved transactions
 * to ensure they still comply with hierarchical policies (detection of "policy drift").
 */
class PolicyAuditor {
    start() {
        // Run every night at midnight
        cron.schedule('0 0 * * *', async () => {
            console.log('[PolicyAuditor] Starting retroactive governance audit...');

            try {
                const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

                // Find all expenses that were processed in the last 24h
                const expenses = await Transaction.find({
                    type: 'expense',
                    createdAt: { $gte: twentyFourHoursAgo }
                });

                let breachCount = 0;

                for (const expense of expenses) {
                    if (!expense.workspace) continue;

                    // Re-evaluate against current policy (inheritance may have changed)
                    const rule = await policyResolver.getRuleForTransaction(expense, expense.workspace);

                    if (rule) {
                        const currentRisk = riskScoring.calculateScore(expense, rule);

                        // If risk is now significantly higher than when approved
                        if (currentRisk > 75) {
                            breachCount++;
                            logger.error('RETROACTIVE Governance Breach Detected', {
                                transactionId: expense._id,
                                workspaceId: expense.workspace,
                                riskScore: currentRisk,
                                auditTimestamp: new Date()
                            });

                            // Mark for manual investigation
                            expense.isFlagged = true;
                            expense.flagReason = 'Retroactive Higher-Level Policy Violation';
                            await expense.save();
                        }
                    }
                }

                console.log(`[PolicyAuditor] Audit complete. Flagged ${breachCount} records.`);
            } catch (err) {
                logger.error('[PolicyAuditor] Audit pipeline failed', { error: err.message });
            }
        });
    }
}

module.exports = new PolicyAuditor();
