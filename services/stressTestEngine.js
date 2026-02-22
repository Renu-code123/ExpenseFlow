const FinancialMath = require('../utils/financialMath');
const StressScenario = require('../models/StressScenario');
const Workspace = require('../models/Workspace');
const Transaction = require('../models/Transaction');

/**
 * Stress Test Engine
 * Issue #739: Autonomous financial safety simulations.
 * Predicts bankruptcy or liquidity crunch before it happens.
 */
class StressTestEngine {
    /**
     * Run a comprehensive stress test for a workspace
     */
    async evaluateLiquidity(workspaceId, proposedExpenseAmount = 0) {
        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) throw new Error('Workspace not found');

        // 1. Get current financial state (Mocked aggregation for brevity)
        const currentBalance = workspace.balance || 0;
        const avgMonthlyInflow = 50000; // In production, calculate from Transactions
        const avgMonthlyOutflow = 40000;

        // 2. Load active stress scenarios
        const scenarios = await StressScenario.find({ isActive: true });
        const risks = [];

        for (const scenario of scenarios) {
            // 3. Perform Monte Carlo simulation
            const simulation = FinancialMath.simulateCashFlow(
                currentBalance - proposedExpenseAmount,
                avgMonthlyInflow,
                avgMonthlyOutflow * (1 + scenario.parameters.expenseSurcharge),
                scenario.parameters.revenueVolatility,
                2000 // 2k trials for accuracy
            );

            const ruinProb = FinancialMath.calculateProbabilityOfRuin(simulation);
            const vaR = FinancialMath.calculateVaR(simulation, 0.99);

            risks.push({
                scenario: scenario.name,
                probabilityOfDefault: ruinProb,
                valueAtRisk: vaR,
                isDangerous: ruinProb > 0.15 // Threshold: 15% chance of ruin is high alert
            });
        }

        // 4. Summarize liquidity health
        const maxRuinProb = Math.max(...risks.map(r => r.probabilityOfDefault));

        return {
            status: maxRuinProb > 0.2 ? 'critical' : maxRuinProb > 0.1 ? 'warning' : 'healthy',
            maxRuinProbability: maxRuinProb,
            risks,
            proposedExpenseAcceptable: maxRuinProb < 0.2
        };
    }
}

module.exports = new StressTestEngine();
