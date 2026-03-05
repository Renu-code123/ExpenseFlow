const Transaction = require('../models/Transaction');
const PrivacyBridge = require('../models/PrivacyBridge');
const zkPrivacyOrchestrator = require('../services/zkPrivacyOrchestrator');

/**
 * Analytics Repository
 * Issue #844: Bridging local workspace metrics with anonymized industry benchmarks.
 */
class AnalyticsRepository {
    /**
     * Get anonymized performance metrics for industry comparison.
     */
    async getIndustryBenchmarks(workspaceId, field = 'amount') {
        // Enforce privacy bridge check
        const bridge = await PrivacyBridge.findOne({ workspaceId, allowBenchmarking: true });
        if (!bridge) {
            return { error: 'Benchmarking not enabled for this workspace' };
        }

        // Aggregate local data
        const transactions = await Transaction.find({ workspace: workspaceId, status: 'validated' });
        const metrics = transactions.map(t => t[field] || 0);

        if (metrics.length === 0) return { sum: 0, count: 0, average: 0 };

        // Process through Privacy Bridge
        const anonymizedData = await zkPrivacyOrchestrator.anonymizeAndSum(workspaceId, metrics, { field });

        return anonymizedData;
    }

    /**
     * Get aggregate data from all participating tenants (simulated).
     */
    async fetchGlobalAggregates(field = 'amount') {
        const bridges = await PrivacyBridge.find({ allowBenchmarking: true });
        const aggregates = [];

        for (const bridge of bridges) {
            const transactions = await Transaction.find({ workspace: bridge.workspaceId, status: 'validated' });
            const metrics = transactions.map(t => t[field] || 0);

            if (metrics.length > 0) {
                const agg = await zkPrivacyOrchestrator.anonymizeAndSum(bridge.workspaceId, metrics, { field });
                if (agg) aggregates.push(agg);
            }
        }

        const globalAverage = await zkPrivacyOrchestrator.calculateIndustryAverage(aggregates);
        return {
            globalAverage,
            contributingWorkspaces: aggregates.length
        };
    }
}

module.exports = new AnalyticsRepository();
