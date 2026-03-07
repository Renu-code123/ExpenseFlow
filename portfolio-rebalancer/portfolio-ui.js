// portfolio-ui.js
// Provides a simple CLI interface for portfolio rebalancer

const Portfolio = require('./portfolio-data-model');
const AllocationMonitor = require('./allocation-monitor');
const RebalancingStrategy = require('./rebalancing-strategy');
const TradeAutomation = require('./trade-automation');
const UserPreferences = require('./user-preferences');
const MarketData = require('./market-data');

function runPortfolioRebalancerDemo() {
    // Demo user and portfolio
    const userId = 'user123';
    const portfolio = new Portfolio(userId);
    portfolio.addAsset('AAPL', 0.4, 40000, 0.35);
    portfolio.addAsset('GOOGL', 0.3, 30000, 0.30);
    portfolio.addAsset('TSLA', 0.3, 30000, 0.35);

    const monitor = new AllocationMonitor(portfolio);
    const strategy = new RebalancingStrategy(portfolio, monitor);
    const userPrefs = new UserPreferences(userId, {
        maxTradeSize: 10000,
        preferredBrokers: ['BrokerX'],
        autoConfirm: true
    });
    const marketData = new MarketData();
    marketData.fetchMarketData(['AAPL', 'GOOGL', 'TSLA']);

    // Show drift report
    console.log('--- Drift Report ---');
    console.table(monitor.getDriftReport());

    // Suggest rebalancing actions
    const actions = strategy.suggestRebalancingActions();
    console.log('--- Suggested Actions ---');
    console.table(actions);

    // Execute trades
    const tradeAutomation = new TradeAutomation(portfolio, strategy);
    const tradeHistory = tradeAutomation.executeTrades(actions, userPrefs.getAllPreferences());
    console.log('--- Trade History ---');
    console.table(tradeHistory);
}

runPortfolioRebalancerDemo();
