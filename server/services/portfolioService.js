const Portfolio = require('../models/Portfolio');
const Asset = require('../models/Asset');
const Transaction = require('../models/Transaction');
const PriceHistory = require('../models/PriceHistory');

/**
 * Portfolio Service
 * Handles portfolio calculations, analytics, and management
 */

class PortfolioService {
    
    /**
     * Create new portfolio
     */
    async createPortfolio(userId, portfolioData) {
        const portfolio = new Portfolio({
            user: userId,
            name: portfolioData.name,
            description: portfolioData.description,
            base_currency: portfolioData.base_currency || 'USD',
            rebalancing: {
                target_allocation: portfolioData.target_allocation || {
                    stocks: 60,
                    bonds: 30,
                    cash: 10
                }
            }
        });
        
        await portfolio.save();
        return portfolio;
    }
    
    /**
     * Get portfolio with full details
     */
    async getPortfolio(portfolioId, userId) {
        const portfolio = await Portfolio.findOne({
            _id: portfolioId,
            user: userId
        });
        
        if (!portfolio) {
            throw new Error('Portfolio not found');
        }
        
        // Get all assets
        const assets = await Asset.find({ portfolio: portfolioId });
        
        return {
            portfolio,
            assets,
            asset_count: assets.length
        };
    }
    
    /**
     * Update portfolio values and metrics
     */
    async updatePortfolioMetrics(portfolioId) {
        const portfolio = await Portfolio.findById(portfolioId);
        if (!portfolio) {
            throw new Error('Portfolio not found');
        }
        
        const assets = await Asset.find({ portfolio: portfolioId });
        
        // Calculate total values
        let totalValue = 0;
        let totalInvested = 0;
        const allocation = {
            stocks: { value: 0, percentage: 0 },
            crypto: { value: 0, percentage: 0 },
            etfs: { value: 0, percentage: 0 },
            mutual_funds: { value: 0, percentage: 0 },
            bonds: { value: 0, percentage: 0 },
            cash: { value: 0, percentage: 0 }
        };
        
        for (const asset of assets) {
            totalValue += asset.current_value;
            totalInvested += asset.total_invested;
            
            // Update allocation
            const assetTypeKey = asset.asset_type === 'stock' ? 'stocks' 
                : asset.asset_type === 'etf' ? 'etfs'
                : asset.asset_type === 'mutual_fund' ? 'mutual_funds'
                : asset.asset_type + 's';
            
            if (allocation[assetTypeKey]) {
                allocation[assetTypeKey].value += asset.current_value;
            }
        }
        
        // Calculate percentages
        if (totalValue > 0) {
            Object.keys(allocation).forEach(key => {
                allocation[key].percentage = (allocation[key].value / totalValue) * 100;
            });
        }
        
        // Update portfolio
        portfolio.total_value = totalValue;
        portfolio.total_invested = totalInvested;
        portfolio.total_return = totalValue - totalInvested;
        portfolio.total_return_percentage = totalInvested > 0 
            ? (portfolio.total_return / totalInvested) * 100 
            : 0;
        portfolio.asset_allocation = allocation;
        
        // Calculate performance metrics
        await this._calculatePerformanceMetrics(portfolio, assets);
        
        // Check rebalancing needs
        await portfolio.checkRebalancing();
        
        // Add to historical values
        await portfolio.addHistoricalValue();
        
        await portfolio.save();
        
        return portfolio;
    }
    
    /**
     * Add asset to portfolio
     */
    async addAsset(portfolioId, userId, assetData) {
        const portfolio = await Portfolio.findOne({
            _id: portfolioId,
            user: userId
        });
        
        if (!portfolio) {
            throw new Error('Portfolio not found');
        }
        
        // Check if asset already exists
        const existingAsset = await Asset.findOne({
            portfolio: portfolioId,
            symbol: assetData.symbol,
            asset_type: assetData.asset_type
        });
        
        if (existingAsset) {
            throw new Error('Asset already exists in portfolio');
        }
        
        const asset = new Asset({
            portfolio: portfolioId,
            user: userId,
            ...assetData,
            current_price: assetData.purchase_price || 0,
            average_buy_price: assetData.purchase_price || 0,
            quantity: assetData.quantity || 0,
            total_invested: (assetData.quantity || 0) * (assetData.purchase_price || 0),
            current_value: (assetData.quantity || 0) * (assetData.purchase_price || 0)
        });
        
        await asset.save();
        
        // Create initial transaction
        const transaction = new Transaction({
            portfolio: portfolioId,
            asset: asset._id,
            user: userId,
            transaction_type: 'buy',
            symbol: assetData.symbol,
            asset_type: assetData.asset_type,
            transaction_date: assetData.purchase_date || new Date(),
            quantity: assetData.quantity || 0,
            price: assetData.purchase_price || 0,
            total_amount: (assetData.quantity || 0) * (assetData.purchase_price || 0),
            fees: assetData.fees || 0,
            currency: assetData.currency || 'USD'
        });
        
        await transaction.save();
        
        // Add tax lot
        await asset.addTransaction(
            assetData.quantity || 0,
            assetData.purchase_price || 0,
            transaction._id
        );
        
        // Update portfolio metrics
        await this.updatePortfolioMetrics(portfolioId);
        
        return asset;
    }
    
    /**
     * Buy more shares of existing asset
     */
    async buyAsset(portfolioId, userId, assetId, transactionData) {
        const asset = await Asset.findOne({
            _id: assetId,
            portfolio: portfolioId,
            user: userId
        });
        
        if (!asset) {
            throw new Error('Asset not found');
        }
        
        // Create transaction
        const transaction = new Transaction({
            portfolio: portfolioId,
            asset: assetId,
            user: userId,
            transaction_type: 'buy',
            symbol: asset.symbol,
            asset_type: asset.asset_type,
            transaction_date: transactionData.date || new Date(),
            quantity: transactionData.quantity,
            price: transactionData.price,
            total_amount: transactionData.quantity * transactionData.price,
            fees: transactionData.fees || 0,
            currency: transactionData.currency || 'USD',
            notes: transactionData.notes
        });
        
        await transaction.save();
        
        // Update asset
        await asset.addTransaction(
            transactionData.quantity,
            transactionData.price,
            transaction._id
        );
        
        // Update portfolio
        await this.updatePortfolioMetrics(portfolioId);
        
        return { asset, transaction };
    }
    
    /**
     * Sell shares of asset
     */
    async sellAsset(portfolioId, userId, assetId, transactionData) {
        const asset = await Asset.findOne({
            _id: assetId,
            portfolio: portfolioId,
            user: userId
        });
        
        if (!asset) {
            throw new Error('Asset not found');
        }
        
        if (asset.quantity < transactionData.quantity) {
            throw new Error('Insufficient shares to sell');
        }
        
        // Create transaction
        const transaction = new Transaction({
            portfolio: portfolioId,
            asset: assetId,
            user: userId,
            transaction_type: 'sell',
            symbol: asset.symbol,
            asset_type: asset.asset_type,
            transaction_date: transactionData.date || new Date(),
            quantity: transactionData.quantity,
            price: transactionData.price,
            total_amount: transactionData.quantity * transactionData.price,
            fees: transactionData.fees || 0,
            currency: transactionData.currency || 'USD',
            notes: transactionData.notes
        });
        
        await transaction.save();
        
        // Update asset (sell shares and calculate realized gains)
        await asset.sellShares(
            transactionData.quantity,
            transactionData.price,
            transactionData.tax_lot_method || 'FIFO'
        );
        
        // Calculate tax info
        const costBasis = asset.average_buy_price * transactionData.quantity;
        await transaction.calculateGainLoss(costBasis);
        
        // Update portfolio
        await this.updatePortfolioMetrics(portfolioId);
        
        return { asset, transaction };
    }
    
    /**
     * Record dividend payment
     */
    async recordDividend(portfolioId, userId, assetId, dividendData) {
        const asset = await Asset.findOne({
            _id: assetId,
            portfolio: portfolioId,
            user: userId
        });
        
        if (!asset) {
            throw new Error('Asset not found');
        }
        
        const portfolio = await Portfolio.findById(portfolioId);
        
        // Create transaction
        const transaction = new Transaction({
            portfolio: portfolioId,
            asset: assetId,
            user: userId,
            transaction_type: 'dividend',
            symbol: asset.symbol,
            asset_type: asset.asset_type,
            transaction_date: dividendData.date || new Date(),
            total_amount: dividendData.amount,
            currency: dividendData.currency || 'USD',
            notes: `Dividend payment: ${dividendData.amount} ${dividendData.currency || 'USD'}`
        });
        
        await transaction.save();
        
        // Update asset dividend info
        await asset.addDividend(dividendData.amount);
        
        // Update portfolio dividend income
        await portfolio.updateDividendIncome(dividendData.amount);
        
        return transaction;
    }
    
    /**
     * Get portfolio analytics
     */
    async getAnalytics(portfolioId, userId) {
        const portfolio = await Portfolio.findOne({
            _id: portfolioId,
            user: userId
        }).lean();
        
        if (!portfolio) {
            throw new Error('Portfolio not found');
        }
        
        const assets = await Asset.find({ portfolio: portfolioId }).lean();
        const transactions = await Transaction.find({ portfolio: portfolioId })
            .sort({ transaction_date: -1 })
            .limit(50)
            .lean();
        
        // Top performers
        const topPerformers = await Asset.getTopPerformers(portfolioId, 5);
        const worstPerformers = await Asset.getWorstPerformers(portfolioId, 5);
        
        // Transaction summary
        const transactionSummary = await Transaction.getTransactionSummary(portfolioId, 'month');
        
        // Dividend summary
        const dividends = await Transaction.getDividendHistory(portfolioId);
        const totalDividends = dividends.reduce((sum, d) => sum + d.total_amount, 0);
        
        return {
            portfolio,
            assets,
            recent_transactions: transactions,
            top_performers: topPerformers,
            worst_performers: worstPerformers,
            transaction_summary: transactionSummary,
            dividend_summary: {
                total: totalDividends,
                count: dividends.length,
                recent: dividends.slice(0, 10)
            }
        };
    }
    
    /**
     * Get portfolio performance over time
     */
    async getPerformanceHistory(portfolioId, userId, days = 30) {
        const portfolio = await Portfolio.findOne({
            _id: portfolioId,
            user: userId
        });
        
        if (!portfolio) {
            throw new Error('Portfolio not found');
        }
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const history = portfolio.historical_values.filter(
            h => h.date >= cutoffDate
        );
        
        return history;
    }
    
    /**
     * Calculate portfolio diversification score
     */
    async calculateDiversification(portfolioId) {
        const assets = await Asset.find({ portfolio: portfolioId });
        
        if (assets.length === 0) return 0;
        
        // Calculate Herfindahl-Hirschman Index (HHI)
        const totalValue = assets.reduce((sum, a) => sum + a.current_value, 0);
        
        if (totalValue === 0) return 0;
        
        const hhi = assets.reduce((sum, asset) => {
            const share = asset.current_value / totalValue;
            return sum + (share * share);
        }, 0);
        
        // Convert HHI to diversification score (0-100)
        // HHI ranges from 1/n (perfect diversification) to 1 (no diversification)
        const maxHHI = 1;
        const minHHI = 1 / assets.length;
        
        const diversificationScore = ((maxHHI - hhi) / (maxHHI - minHHI)) * 100;
        
        return Math.max(0, Math.min(100, diversificationScore));
    }
    
    /**
     * PRIVATE METHODS
     */
    
    async _calculatePerformanceMetrics(portfolio, assets) {
        // ROI
        portfolio.performance_metrics.roi = portfolio.total_invested > 0
            ? (portfolio.total_return / portfolio.total_invested) * 100
            : 0;
        
        // Calculate CAGR (Compound Annual Growth Rate)
        if (portfolio.historical_values.length > 1) {
            const firstValue = portfolio.historical_values[0];
            const lastValue = portfolio.historical_values[portfolio.historical_values.length - 1];
            const years = (lastValue.date - firstValue.date) / (365 * 24 * 60 * 60 * 1000);
            
            if (years > 0 && firstValue.total_value > 0) {
                portfolio.performance_metrics.cagr = 
                    (Math.pow(lastValue.total_value / firstValue.total_value, 1 / years) - 1) * 100;
            }
        }
        
        // Calculate volatility
        if (portfolio.historical_values.length > 2) {
            const returns = [];
            for (let i = 1; i < portfolio.historical_values.length; i++) {
                const prevValue = portfolio.historical_values[i - 1].total_value;
                const currValue = portfolio.historical_values[i].total_value;
                if (prevValue > 0) {
                    returns.push((currValue - prevValue) / prevValue);
                }
            }
            
            if (returns.length > 0) {
                const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
                const variance = returns.reduce((sum, r) => 
                    sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
                portfolio.performance_metrics.volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;
            }
        }
        
        // Calculate Sharpe Ratio (simplified - assumes 2% risk-free rate)
        const riskFreeRate = 2;
        if (portfolio.performance_metrics.volatility > 0) {
            portfolio.performance_metrics.sharpe_ratio = 
                (portfolio.performance_metrics.roi - riskFreeRate) / 
                portfolio.performance_metrics.volatility;
        }
        
        // Calculate diversification score
        portfolio.risk_metrics.diversification_score = 
            await this.calculateDiversification(portfolio._id);
        
        // Calculate concentration risk
        const sortedAssets = assets.sort((a, b) => b.current_value - a.current_value);
        const totalValue = portfolio.total_value;
        
        if (totalValue > 0 && sortedAssets.length > 0) {
            portfolio.risk_metrics.concentration_risk = {
                top_holding_percentage: (sortedAssets[0].current_value / totalValue) * 100,
                top_5_percentage: sortedAssets.slice(0, 5).reduce(
                    (sum, a) => sum + (a.current_value / totalValue) * 100, 0
                ),
                top_10_percentage: sortedAssets.slice(0, 10).reduce(
                    (sum, a) => sum + (a.current_value / totalValue) * 100, 0
                )
            };
        }
    }
}

module.exports = new PortfolioService();
