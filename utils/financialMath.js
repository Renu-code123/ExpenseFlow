/**
 * Financial Math Utilities
 * Issue #739: Advanced mathematical models for liquidity forecasting and risk analysis.
 */

class FinancialMath {
    /**
     * Normal Distribution (Box-Muller Transform)
     * Generates a random variable from a normal distribution.
     */
    static normalRandom(mean = 0, stdDev = 1) {
        const u = 1 - Math.random();
        const v = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return z * stdDev + mean;
    }

    /**
     * Calculate Value at Risk (VaR)
     * Estimates the maximum potential loss over a time period at a confidence level.
     */
    static calculateVaR(values, confidence = 0.95) {
        if (!values || values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.floor(((1 - confidence) * sorted.length) + 0.0000001);
        return Math.abs(sorted[index] || 0);
    }

    /**
     * Monte Carlo Simulation for Cash Flow
     * Projects potential future balances based on volatility.
     */
    static simulateCashFlow(currentBalance, expectedInflow, expectedOutflow, volatility, trials = 1000) {
        const results = [];
        for (let i = 0; i < trials; i++) {
            const randomInflow = expectedInflow * (1 + this.normalRandom(0, volatility));
            const randomOutflow = expectedOutflow * (1 + this.normalRandom(0, volatility));
            results.push(currentBalance + randomInflow - randomOutflow);
        }
        return results;
    }

    /**
     * Probability of Ruin
     * Chance that the balance falls below zero during simulation.
     */
    static calculateProbabilityOfRuin(simulationResults) {
        if (!simulationResults || simulationResults.length === 0) return 0;
        const ruins = simulationResults.filter(val => val < 0).length;
        return ruins / simulationResults.length;
    }
}

module.exports = FinancialMath;
