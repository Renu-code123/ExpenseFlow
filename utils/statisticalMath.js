/**
 * Statistical Math Utility
 * Issue #645: Provides algorithms for anomaly detection and trend analysis
 */

class StatisticalMath {
    /**
     * Calculate the mean (average) of an array of numbers
     */
    mean(values) {
        if (!values || values.length === 0) return 0;
        const sum = values.reduce((acc, val) => acc + val, 0);
        return sum / values.length;
    }

    /**
     * Calculate the standard deviation of an array of numbers
     */
    standardDeviation(values) {
        if (!values || values.length < 2) return 0;
        const avg = this.mean(values);
        const squareDiffs = values.map(value => Math.pow(value - avg, 2));
        const avgSquareDiff = this.mean(squareDiffs);
        return Math.sqrt(avgSquareDiff);
    }

    /**
     * Calculate the Z-score of a value relative to a distribution
     * Z = (x - mean) / stdDev
     */
    zScore(value, mean, stdDev) {
        if (stdDev === 0) return 0;
        return (value - mean) / stdDev;
    }

    /**
     * Calculate 7-day or 30-day Moving Average
     */
    movingAverage(values, period = 7) {
        if (!values || values.length < period) return this.mean(values);
        const subset = values.slice(-period);
        return this.mean(subset);
    }

    /**
     * Identify outliers using the Interquartile Range (IQR) method
     * Useful for non-normal distributions
     */
    getOutlierThresholds(values) {
        if (!values || values.length < 4) return { lower: 0, upper: Infinity };

        const sorted = [...values].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length / 4)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;

        return {
            lower: q1 - (1.5 * iqr),
            upper: q3 + (1.5 * iqr)
        };
    }
}

module.exports = new StatisticalMath();
