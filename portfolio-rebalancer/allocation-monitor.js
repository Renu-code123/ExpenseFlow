// allocation-monitor.js
// Monitors portfolio allocations and detects drift from target allocations

const Portfolio = require('./portfolio-data-model');

class AllocationMonitor {
    constructor(portfolio) {
        this.portfolio = portfolio;
    }

    getDriftReport() {
        const allocations = this.portfolio.getAllocations();
        return allocations.map(asset => ({
            symbol: asset.symbol,
            currentAllocation: asset.allocation,
            targetAllocation: asset.targetAllocation,
            drift: asset.allocation - asset.targetAllocation
        }));
    }

    isRebalancingNeeded(threshold = 0.02) {
        // threshold: minimum drift to trigger rebalancing (e.g., 2%)
        const report = this.getDriftReport();
        return report.some(asset => Math.abs(asset.drift) > threshold);
    }
}

module.exports = AllocationMonitor;
