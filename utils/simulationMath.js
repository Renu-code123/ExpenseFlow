/**
 * Simulation Math Utility
 * Issue #678: Provides statistical functions for Monte Carlo simulations.
 */

class SimulationMath {
    /**
     * Box-Muller transform to get a random number from a normal distribution
     * @param {number} mean 
     * @param {number} stdDev 
     */
    sampleNormal(mean, stdDev) {
        let u = 0, v = 0;
        while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
        while (v === 0) v = Math.random();

        let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return z * stdDev + mean;
    }

    /**
     * Calculate percentiles from a distribution (e.g., 5th, 50th, 95th)
     */
    calculatePercentiles(samples, percentiles = [5, 25, 50, 75, 95]) {
        if (!samples.length) return {};

        const sorted = [...samples].sort((a, b) => a - b);
        const results = {};

        percentiles.forEach(p => {
            const index = Math.floor((p / 100) * (sorted.length - 1));
            results[`p${p}`] = sorted[index];
        });

        return results;
    }

    /**
     * Calculate basic stats for a series of numbers
     */
    getStats(data) {
        if (!data.length) return { mean: 0, stdDev: 0 };

        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const squareDiffs = data.map(value => Math.pow(value - mean, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
        const stdDev = Math.sqrt(avgSquareDiff);

        return { mean, stdDev };
    }
}

module.exports = new SimulationMath();
