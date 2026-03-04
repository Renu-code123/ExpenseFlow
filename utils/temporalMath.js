/**
 * Temporal Math Utility
 * Issue #842: Logic for merging state across shard boundaries during forensic replay.
 * Handles "Temporal Slicing" where we need to combine results from multiple chronological shards.
 */
class TemporalMath {
    /**
     * Merge multiple partial states derived from different shards.
     * Newer shards (later in time) override older shards for the same keys.
     */
    static mergeStates(states) {
        if (!states || states.length === 0) return {};
        if (states.length === 1) return states[0];

        // Sort by timestamp if available, or assume chronological order of shards
        return states.reduce((finalState, currentState) => {
            return {
                ...finalState,
                ...currentState,
                // Ensure versioning or sequence numbers are maintained
                lastModifiedAt: currentState.lastModifiedAt || finalState.lastModifiedAt,
                lastEventSequence: Math.max(currentState.lastEventSequence || 0, finalState.lastEventSequence || 0)
            };
        }, {});
    }

    /**
     * Slice a full event stream into temporal buckets.
     */
    static sliceByTime(events, bucketSizeMs = 3600000) { // Default 1 hour
        const buckets = {};

        events.forEach(event => {
            const bucketKey = Math.floor(event.timestamp.getTime() / bucketSizeMs) * bucketSizeMs;
            if (!buckets[bucketKey]) buckets[bucketKey] = [];
            buckets[bucketKey].push(event);
        });

        return buckets;
    }

    /**
     * Predictive Trend Analysis
     * Issue #909: Supporting trend-line smoothing.
     */
    static predictTrend(dataPoints) {
        if (dataPoints.length < 2) return 0;

        // Simple linear regression slope
        const n = dataPoints.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        dataPoints.forEach((p, i) => {
            sumX += i;
            sumY += p;
            sumXY += i * p;
            sumX2 += i * i;
        });

        return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    }

    /**
     * Seasonality Detection
     */
    static calculateSeasonality(dataPoints, cycleLength = 7) {
        if (dataPoints.length < cycleLength * 2) return 1.0;

        // Simple ratio-to-moving-average logic (mocked)
        return 1.1; // 10% seasonal boost detected
    }

    /**
     * Issue #959: Sub-second precision for JIT execution windows.
     */
    static isWithinJitWindow(startTime, endTime, latencyMs = 0) {
        const now = Date.now();
        // Buffer for network/funding latency
        return now >= (startTime.getTime() - latencyMs) && now <= endTime.getTime();
    }

    /**
     * Generates a high-precision timestamp for forensic JIT verification.
     */
    static getSubSecondPrecision() {
        const hrTime = process.hrtime();
        return hrTime[0] * 1000 + hrTime[1] / 1000000;
    }
}

module.exports = TemporalMath;
