// portfolio-data-model.js
// Smart Investment Portfolio Rebalancer - Portfolio Data Model
// Handles portfolio structure, asset classes, and user holdings

class Portfolio {
    constructor(userId, assets = []) {
        this.userId = userId;
        this.assets = assets; // [{ symbol, allocation, currentValue, targetAllocation }]
    }

    addAsset(symbol, allocation, currentValue, targetAllocation) {
        this.assets.push({ symbol, allocation, currentValue, targetAllocation });
    }

    updateAsset(symbol, allocation, currentValue, targetAllocation) {
        const asset = this.assets.find(a => a.symbol === symbol);
        if (asset) {
            asset.allocation = allocation;
            asset.currentValue = currentValue;
            asset.targetAllocation = targetAllocation;
        }
    }

    removeAsset(symbol) {
        this.assets = this.assets.filter(a => a.symbol !== symbol);
    }

    getTotalValue() {
        return this.assets.reduce((sum, asset) => sum + asset.currentValue, 0);
    }

    getAsset(symbol) {
        return this.assets.find(a => a.symbol === symbol);
    }

    getAllocations() {
        const total = this.getTotalValue();
        return this.assets.map(asset => ({
            symbol: asset.symbol,
            allocation: asset.currentValue / total,
            targetAllocation: asset.targetAllocation
        }));
    }
}

module.exports = Portfolio;
