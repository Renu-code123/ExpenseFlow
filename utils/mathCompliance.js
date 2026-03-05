/**
 * Math Compliance Utility
 * Issue #780: Statistical anomaly and variance thresholds.
 */
class MathCompliance {
    /**
     * Compute variance for compliance checks (e.g. burn rate limits).
     */
    static calculateVariance(values) {
        if (!values || values.length === 0) return 0;
        const mean = values.reduce((a, b) => a + b) / values.length;
        return values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    }

    /**
     * Compute standard deviation.
     */
    static calculateStdDev(values) {
        return Math.sqrt(this.calculateVariance(values));
    }

    /**
     * Detect statistical anomalies against a threshold.
     */
    static isAnomalous(value, historicalData, thresholdMultiplier = 2) {
        if (historicalData.length < 3) return false;

        const mean = historicalData.reduce((a, b) => a + b) / historicalData.length;
        const stdDev = this.calculateStdDev(historicalData);

        if (stdDev === 0) return false; // Uniform data

        const zScore = Math.abs((value - mean) / stdDev);
        return zScore > thresholdMultiplier;
    }

    /**
     * Calculate individual Z-Score for audit flagging.
     */
    static calculateZScore(value, historicalData) {
        if (historicalData.length < 2) return 0;
        const mean = historicalData.reduce((a, b) => a + b) / historicalData.length;
        const stdDev = this.calculateStdDev(historicalData);
        return stdDev === 0 ? 0 : (value - mean) / stdDev;
    }
}

module.exports = MathCompliance;
