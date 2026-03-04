/**
 * Monte Carlo Math Utility
 * Issue #909: Statistical primitives for probability distribution sampling.
 * Used for projecting financial outcomes under uncertainty.
 */
class MonteCarloMath {
    /**
     * Generates a random sample from a normal distribution.
     * Uses Box-Muller transform.
     */
    static sampleNormal(mean, stdDev) {
        const u = 1 - Math.random();
        const v = 1 - Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return mean + z * stdDev;
    }

    /**
     * Calculates percentiles from a range of simulation results.
     */
    static calculatePercentile(samples, percentile) {
        const sorted = [...samples].sort((a, b) => a - b);
        const index = Math.floor(percentile * (sorted.length - 1));
        return sorted[index];
    }

    /**
     * Simulates a random walk for a single path.
     */
    static simulatePath(initialValue, drift, volatility, periods) {
        const path = [initialValue];
        let currentValue = initialValue;

        for (let i = 0; i < periods; i++) {
            // Log-normal returns simulation
            const shock = this.sampleNormal(0, 1);
            const dailyDrift = drift / 365;
            const dailyVol = volatility / Math.sqrt(365);

            currentValue = currentValue * Math.exp(dailyDrift - 0.5 * dailyVol * dailyVol + dailyVol * shock);
            path.push(currentValue);
        }

        return path;
    }
}

module.exports = MonteCarloMath;
