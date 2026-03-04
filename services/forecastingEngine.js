const Transaction = require('../models/Transaction');
const simulationMath = require('../utils/simulationMath');
const moment = require('moment-timezone');


/**
 * Forecasting Engine
 * Issue #678: Runs probabilistic Monte Carlo simulations for cash-flow prediction.
 */
class ForecastingEngine {
    /**
     * Run a simulation for a specific user and scenario
     */
    async runSimulation(userId, scenario = null) {
        // 1. Get historical context (last 180 days)
        const historyStart = moment().subtract(180, 'days').toDate();
        const transactions = await Transaction.find({
            user: userId,
            date: { $gte: historyStart },
            status: { $ne: 'failed' }
        });

        // 2. Extract spending velocity and variance per category
        const velocity = this._analyzeVelocity(transactions);

        // 3. Setup simulation parameters
        const horizon = scenario?.config?.timeHorizonDays || 90;
        const iterations = scenario?.config?.iterationCount || 1000;
        const startBalance = await this._getCurrentLiquidity(userId);

        const simulationResults = [];

        // 4. Run iterations
        for (let i = 0; i < iterations; i++) {
            let currentBalance = startBalance;
            const path = [startBalance];

            for (let day = 1; day <= horizon; day++) {
                // Stochastic daily cash flow
                let dailyChange = 0;

                velocity.forEach(cat => {
                    const dailyMean = cat.avgMonthly / 30;
                    const dailyStdDev = (cat.avgMonthly * 0.2) / 30; // 20% volatility assumption

                    let sample = simulationMath.sampleNormal(dailyMean, dailyStdDev);

                    // Apply scenario adjustments
                    if (scenario && scenario.adjustments) {
                        if (sample > 0) sample *= (1 + scenario.adjustments.incomeChangePct / 100);
                        else sample *= (1 + scenario.adjustments.expenseChangePct / 100);
                    }

                    dailyChange += sample;
                });

                // Apply one-time impacts from scenario
                if (scenario?.adjustments?.oneTimeImpacts) {
                    scenario.adjustments.oneTimeImpacts.forEach(impact => {
                        const impactDay = moment(impact.date).diff(moment(), 'days');
                        if (impactDay === day) dailyChange += impact.amount;
                    });
                }

                currentBalance += dailyChange;
                path.push(currentBalance);
            }
            simulationResults.push({ path, final: currentBalance });
        }

        // 5. Aggregate results
        return this._processResults(simulationResults, horizon);
    }

    _analyzeVelocity(transactions) {
        const categories = {};
        transactions.forEach(tx => {
            if (!categories[tx.category]) categories[tx.category] = [];
            categories[tx.category].push(tx.amount * (tx.type === 'income' ? 1 : -1));
        });

        return Object.keys(categories).map(cat => {
            const sum = categories[cat].reduce((a, b) => a + b, 0);
            return {
                category: cat,
                avgMonthly: sum / 6 // 6 months
            };
        });
    }

    async _getCurrentLiquidity(userId) {
        // Simplified: Sum of all non-deleted transactions
        const result = await Transaction.aggregate([
            { $match: { user: userId, status: { $ne: 'failed' } } },
            { $group: { _id: null, total: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", { $multiply: ["$amount", -1] }] } } } }
        ]);
        return result[0]?.total || 0;
    }

    _processResults(results, horizon) {
        const finalBalances = results.map(r => r.final);
        const percentiles = simulationMath.calculatePercentiles(finalBalances);

        // Calculate "Insolvency Risk" (Probability of balance < 0)
        const insolvencyEvents = finalBalances.filter(b => b < 0).length;
        const riskOfInsolvency = (insolvencyEvents / results.length) * 100;

        // Daily confidence bands
        const dailyBands = [];
        for (let day = 0; day <= horizon; day++) {
            const daySamples = results.map(r => r.path[day]);
            dailyBands.push({
                day,
                ...simulationMath.calculatePercentiles(daySamples)
            });
        }

        return {
            summary: {
                startBalance: results[0].path[0],
                medianFinalBalance: percentiles.p50,
                worstCaseP5: percentiles.p5,
                bestCaseP95: percentiles.p95,
                riskOfInsolvencyPct: riskOfInsolvency
            },
            projections: dailyBands
        };
    }
}

module.exports = new ForecastingEngine();
