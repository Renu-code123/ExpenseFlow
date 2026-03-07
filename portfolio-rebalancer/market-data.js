// market-data.js
// Fetches and updates market data for assets

class MarketData {
    constructor() {
        this.data = {};
    }

    updateMarketData(symbol, price) {
        this.data[symbol] = price;
    }

    getMarketPrice(symbol) {
        return this.data[symbol];
    }

    getAllMarketData() {
        return this.data;
    }

    fetchMarketData(symbols) {
        // Placeholder: Simulate fetching market prices
        symbols.forEach(symbol => {
            this.data[symbol] = Math.random() * 100 + 50; // Random price between 50-150
        });
        return this.data;
    }
}

module.exports = MarketData;
