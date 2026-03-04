/**
 * Data Aggregator Utility
 * Issue #659: Performs complex financial math for reporting data
 */

class DataAggregator {
    /**
     * Aggregate transaction data into report-ready segments
     * @param {Array} transactions 
     */
    aggregateDetails(transactions) {
        const stats = {
            totalVolume: 0,
            count: transactions.length,
            averageTransaction: 0,
            byCategory: {},
            byDay: {},
            topMerchants: [],
            netCashFlow: 0
        };

        const merchantMap = new Map();

        transactions.forEach(tx => {
            // 1. Volumes
            const amount = tx.amount || 0;
            stats.totalVolume += amount;

            if (tx.type === 'income') {
                stats.netCashFlow += amount;
            } else if (tx.type === 'expense') {
                stats.netCashFlow -= amount;
            }

            // 2. Category Breakdown
            const category = tx.category || 'Uncategorized';
            stats.byCategory[category] = (stats.byCategory[category] || 0) + amount;

            // 3. Time Series Breakdown
            const date = new Date(tx.date).toISOString().split('T')[0];
            stats.byDay[date] = (stats.byDay[date] || 0) + amount;

            // 4. Merchant Frequency
            if (tx.merchant) {
                merchantMap.set(tx.merchant, (merchantMap.get(tx.merchant) || 0) + amount);
            }
        });

        stats.averageTransaction = stats.totalVolume / (stats.count || 1);

        // Sort top merchants
        stats.topMerchants = Array.from(merchantMap.entries())
            .map(([name, total]) => ({ name, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        return stats;
    }

    /**
     * Compare two periods for trend analysis
     */
    compareTrends(currentStats, previousStats) {
        const calculatePct = (curr, prev) => {
            if (!prev) return curr > 0 ? 100 : 0;
            return ((curr - prev) / prev) * 100;
        };

        return {
            spendingTrend: calculatePct(currentStats.totalVolume, previousStats.totalVolume),
            averageTrend: calculatePct(currentStats.averageTransaction, previousStats.averageTransaction),
            isImproving: currentStats.totalVolume < previousStats.totalVolume
        };
    }
}

module.exports = new DataAggregator();
