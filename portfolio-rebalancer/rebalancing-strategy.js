// rebalancing-strategy.js
// Provides optimal rebalancing actions based on portfolio drift and user preferences

class RebalancingStrategy {
    constructor(portfolio, monitor) {
        this.portfolio = portfolio;
        this.monitor = monitor;
    }

    suggestRebalancingActions() {
        const driftReport = this.monitor.getDriftReport();
        const actions = [];
        driftReport.forEach(asset => {
            if (Math.abs(asset.drift) > 0.02) { // 2% threshold
                if (asset.drift > 0) {
                    actions.push({
                        symbol: asset.symbol,
                        action: 'Sell',
                        amount: asset.drift * this.portfolio.getTotalValue()
                    });
                } else {
                    actions.push({
                        symbol: asset.symbol,
                        action: 'Buy',
                        amount: Math.abs(asset.drift) * this.portfolio.getTotalValue()
                    });
                }
            }
        });
        return actions;
    }

    optimizeRebalancing(costs = {}) {
        // costs: { symbol: transactionCost }
        // Advanced: minimize transaction costs, taxes, etc.
        // Placeholder for future optimization logic
        return this.suggestRebalancingActions();
    }
}

module.exports = RebalancingStrategy;
