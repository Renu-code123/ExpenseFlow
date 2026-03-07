// Smart Investment Portfolio Rebalancer
// Monitors portfolio allocations, suggests optimal rebalancing, and automates trades

class Portfolio {
    constructor(assets = []) {
        this.assets = assets; // [{symbol, allocation, value}]
    }

    getTotalValue() {
        return this.assets.reduce((sum, asset) => sum + asset.value, 0);
    }

    getAllocations() {
        const total = this.getTotalValue();
        return this.assets.map(asset => ({
            symbol: asset.symbol,
            allocation: asset.value / total
        }));
    }

    updateAsset(symbol, value) {
        const asset = this.assets.find(a => a.symbol === symbol);
        if (asset) asset.value = value;
    }

    addAsset(symbol, value) {
        this.assets.push({symbol, value, allocation: 0});
    }
}

class Rebalancer {
    constructor(targetAllocations) {
        this.targetAllocations = targetAllocations; // {symbol: targetPercent}
    }

    suggestRebalance(portfolio) {
        const allocations = portfolio.getAllocations();
        const total = portfolio.getTotalValue();
        let actions = [];
        allocations.forEach(asset => {
            const target = this.targetAllocations[asset.symbol] || 0;
            const diff = target - asset.allocation;
            if (Math.abs(diff) > 0.01) {
                actions.push({
                    symbol: asset.symbol,
                    action: diff > 0 ? 'buy' : 'sell',
                    amount: Math.abs(diff) * total
                });
            }
        });
        return actions;
    }

    automateTrades(portfolio, executeTrade) {
        const actions = this.suggestRebalance(portfolio);
        actions.forEach(({symbol, action, amount}) => {
            executeTrade(symbol, action, amount);
        });
    }
}

// Example trade executor
function executeTrade(symbol, action, amount) {
    console.log(`Executing ${action} of ${amount} for ${symbol}`);
    // Integrate with brokerage API here
}

// Portfolio risk analysis utility
function analyzeRisk(portfolio) {
    const allocations = portfolio.getAllocations();
    let riskScore = 0;
    allocations.forEach(asset => {
        // Example: higher allocation to volatile assets increases risk
        if (asset.symbol === 'TSLA') riskScore += asset.allocation * 2;
        else riskScore += asset.allocation;
    });
    return riskScore;
}

// Portfolio performance tracker
function trackPerformance(portfolio, historicalValues) {
    // historicalValues: [{date, values: {symbol: value}}]
    return historicalValues.map(entry => {
        const total = Object.values(entry.values).reduce((sum, v) => sum + v, 0);
        return { date: entry.date, totalValue: total };
    });
}

module.exports = { Portfolio, Rebalancer, executeTrade };
module.exports.analyzeRisk = analyzeRisk;
module.exports.trackPerformance = trackPerformance;