const axios = require('axios');
const Asset = require('../models/Asset');
const Portfolio = require('../models/Portfolio');
const AssetTransaction = require('../models/AssetTransaction');
const PriceHistory = require('../models/PriceHistory');

class InvestmentService {
  constructor() {
    this.alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
    this.alphaVantageBaseUrl = 'https://www.alphavantage.co/query';
    this.coinGeckoBaseUrl = 'https://api.coingecko.com/api/v3';
    this.requestQueue = [];
    this.processing = false;
  }

  // ============ PRICE FETCHING ============
  
  // Fetch stock price from Alpha Vantage
  async fetchStockPrice(symbol) {
    try {
      const response = await axios.get(this.alphaVantageBaseUrl, {
        params: {
          function: 'GLOBAL_QUOTE',
          symbol: symbol.toUpperCase(),
          apikey: this.alphaVantageKey
        },
        timeout: 10000
      });
      
      const quote = response.data['Global Quote'];
      if (!quote || !quote['05. price']) {
        throw new Error(`No data found for symbol: ${symbol}`);
      }
      
      return {
        symbol: quote['01. symbol'],
        price: parseFloat(quote['05. price']),
        open: parseFloat(quote['02. open']),
        high: parseFloat(quote['03. high']),
        low: parseFloat(quote['04. low']),
        volume: parseInt(quote['06. volume']),
        previousClose: parseFloat(quote['08. previous close']),
        change: parseFloat(quote['09. change']),
        changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
        timestamp: new Date()
      };
    } catch (error) {
      console.error(`Error fetching stock price for ${symbol}:`, error.message);
      throw error;
    }
  }
  
  // Fetch crypto price from CoinGecko
  async fetchCryptoPrice(coinId, currencies = ['usd']) {
    try {
      const response = await axios.get(`${this.coinGeckoBaseUrl}/simple/price`, {
        params: {
          ids: coinId.toLowerCase(),
          vs_currencies: currencies.join(','),
          include_24hr_change: true,
          include_24hr_vol: true,
          include_market_cap: true
        },
        timeout: 10000
      });
      
      const data = response.data[coinId.toLowerCase()];
      if (!data) {
        throw new Error(`No data found for coin: ${coinId}`);
      }
      
      const currency = currencies[0];
      return {
        coinId,
        price: data[currency],
        change24h: data[`${currency}_24h_change`],
        volume24h: data[`${currency}_24h_vol`],
        marketCap: data[`${currency}_market_cap`],
        currency,
        timestamp: new Date()
      };
    } catch (error) {
      console.error(`Error fetching crypto price for ${coinId}:`, error.message);
      throw error;
    }
  }
  
  // Fetch crypto details
  async fetchCryptoDetails(coinId) {
    try {
      const response = await axios.get(`${this.coinGeckoBaseUrl}/coins/${coinId}`, {
        params: {
          localization: false,
          tickers: false,
          community_data: false,
          developer_data: false
        },
        timeout: 10000
      });
      
      const data = response.data;
      return {
        id: data.id,
        symbol: data.symbol.toUpperCase(),
        name: data.name,
        description: data.description?.en?.substring(0, 500),
        image: data.image?.large,
        currentPrice: data.market_data?.current_price?.usd,
        marketCap: data.market_data?.market_cap?.usd,
        marketCapRank: data.market_cap_rank,
        totalVolume: data.market_data?.total_volume?.usd,
        high24h: data.market_data?.high_24h?.usd,
        low24h: data.market_data?.low_24h?.usd,
        priceChange24h: data.market_data?.price_change_24h,
        priceChangePercent24h: data.market_data?.price_change_percentage_24h,
        circulatingSupply: data.market_data?.circulating_supply,
        totalSupply: data.market_data?.total_supply,
        maxSupply: data.market_data?.max_supply,
        ath: data.market_data?.ath?.usd,
        athDate: data.market_data?.ath_date?.usd,
        atl: data.market_data?.atl?.usd,
        atlDate: data.market_data?.atl_date?.usd
      };
    } catch (error) {
      console.error(`Error fetching crypto details for ${coinId}:`, error.message);
      throw error;
    }
  }
  
  // Fetch historical stock data
  async fetchStockHistory(symbol, outputSize = 'compact') {
    try {
      const response = await axios.get(this.alphaVantageBaseUrl, {
        params: {
          function: 'TIME_SERIES_DAILY_ADJUSTED',
          symbol: symbol.toUpperCase(),
          outputsize: outputSize, // 'compact' = 100 days, 'full' = 20+ years
          apikey: this.alphaVantageKey
        },
        timeout: 30000
      });
      
      const timeSeries = response.data['Time Series (Daily)'];
      if (!timeSeries) {
        throw new Error(`No historical data found for symbol: ${symbol}`);
      }
      
      return Object.entries(timeSeries).map(([date, values]) => ({
        date,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        adjustedClose: parseFloat(values['5. adjusted close']),
        volume: parseInt(values['6. volume']),
        dividendAmount: parseFloat(values['7. dividend amount']),
        splitCoefficient: parseFloat(values['8. split coefficient'])
      }));
    } catch (error) {
      console.error(`Error fetching stock history for ${symbol}:`, error.message);
      throw error;
    }
  }
  
  // Fetch crypto historical data
  async fetchCryptoHistory(coinId, days = 365, currency = 'usd') {
    try {
      const response = await axios.get(`${this.coinGeckoBaseUrl}/coins/${coinId}/market_chart`, {
        params: {
          vs_currency: currency,
          days,
          interval: days > 90 ? 'daily' : 'hourly'
        },
        timeout: 30000
      });
      
      const { prices, market_caps, total_volumes } = response.data;
      
      return prices.map((price, index) => ({
        date: new Date(price[0]),
        close: price[1],
        open: price[1], // CoinGecko doesn't provide OHLC in this endpoint
        high: price[1],
        low: price[1],
        marketCap: market_caps[index]?.[1],
        volume: total_volumes[index]?.[1]
      }));
    } catch (error) {
      console.error(`Error fetching crypto history for ${coinId}:`, error.message);
      throw error;
    }
  }
  
  // ============ ASSET MANAGEMENT ============
  
  // Update asset price
  async updateAssetPrice(assetId) {
    const asset = await Asset.findById(assetId);
    if (!asset) throw new Error('Asset not found');
    
    let priceData;
    
    if (asset.type === 'crypto') {
      priceData = await this.fetchCryptoPrice(asset.dataSource.externalId || asset.symbol.toLowerCase());
      await asset.updatePrice(priceData.price, {
        change24h: priceData.change24h,
        volume24h: priceData.volume24h,
        marketCap: priceData.marketCap
      });
    } else if (['stock', 'etf'].includes(asset.type)) {
      priceData = await this.fetchStockPrice(asset.symbol);
      await asset.updatePrice(priceData.price, {
        open: priceData.open,
        high: priceData.high,
        low: priceData.low,
        volume: priceData.volume,
        change: priceData.change,
        changePercent: priceData.changePercent
      });
    }
    
    return asset;
  }
  
  // Bulk update asset prices
  async updateAllAssetPrices() {
    const assets = await Asset.find({ isActive: true });
    const results = { success: [], failed: [] };
    
    for (const asset of assets) {
      try {
        // Rate limiting - Alpha Vantage allows 5 calls/minute on free tier
        if (['stock', 'etf'].includes(asset.type)) {
          await this.delay(12000); // 12 seconds between stock API calls
        } else {
          await this.delay(1000); // 1 second for crypto
        }
        
        await this.updateAssetPrice(asset._id);
        results.success.push(asset.symbol);
      } catch (error) {
        results.failed.push({ symbol: asset.symbol, error: error.message });
      }
    }
    
    return results;
  }
  
  // Import historical data for asset
  async importHistoricalData(assetId, days = 365) {
    const asset = await Asset.findById(assetId);
    if (!asset) throw new Error('Asset not found');
    
    let history;
    
    if (asset.type === 'crypto') {
      history = await this.fetchCryptoHistory(
        asset.dataSource.externalId || asset.symbol.toLowerCase(),
        days
      );
    } else {
      history = await this.fetchStockHistory(asset.symbol, days > 100 ? 'full' : 'compact');
    }
    
    // Bulk insert to PriceHistory
    await PriceHistory.bulkInsert(assetId, asset.symbol, history);
    
    return { imported: history.length };
  }
  
  // ============ PORTFOLIO MANAGEMENT ============
  
  // Create portfolio
  async createPortfolio(userId, data) {
    const portfolio = new Portfolio({
      user: userId,
      name: data.name,
      description: data.description,
      baseCurrency: data.baseCurrency || 'USD',
      targetAllocations: data.targetAllocations || [],
      isDefault: data.isDefault || false
    });
    
    await portfolio.save();
    return portfolio;
  }
  
  // Get user portfolios
  async getUserPortfolios(userId) {
    return Portfolio.find({ user: userId })
      .populate('holdings.asset')
      .sort({ isDefault: -1, createdAt: -1 });
  }
  
  // Get portfolio with calculated values
  async getPortfolioWithValues(portfolioId, userId) {
    const portfolio = await Portfolio.findOne({ _id: portfolioId, user: userId })
      .populate('holdings.asset');
      
    if (!portfolio) throw new Error('Portfolio not found');
    
    // Calculate current values
    await portfolio.calculateTotalValue();
    
    // Get allocation
    const allocation = await portfolio.calculateAllocation();
    
    // Get rebalancing suggestions if targets are set
    let rebalancingSuggestions = null;
    if (portfolio.targetAllocations?.length > 0) {
      rebalancingSuggestions = await portfolio.getRebalancingSuggestions();
    }
    
    return {
      portfolio,
      allocation,
      rebalancingSuggestions
    };
  }
  
  // ============ TRANSACTION PROCESSING ============
  
  // Execute buy transaction
  async buyAsset(userId, portfolioId, data) {
    const portfolio = await Portfolio.findOne({ _id: portfolioId, user: userId });
    if (!portfolio) throw new Error('Portfolio not found');
    
    // Get or create asset
    let asset = await Asset.findOne({ symbol: data.symbol.toUpperCase() });
    if (!asset) {
      // Create new asset
      asset = await Asset.create({
        symbol: data.symbol.toUpperCase(),
        name: data.name || data.symbol,
        type: data.assetType || 'stock',
        currency: data.currency || 'USD'
      });
      
      // Fetch current price
      await this.updateAssetPrice(asset._id);
    }
    
    const pricePerUnit = data.price || asset.currentPrice?.price;
    if (!pricePerUnit) throw new Error('Price not available');
    
    // Create transaction
    const transaction = new AssetTransaction({
      portfolio: portfolioId,
      asset: asset._id,
      user: userId,
      type: 'buy',
      quantity: data.quantity,
      pricePerUnit,
      currency: data.currency || asset.currency,
      fees: data.fees || {},
      date: data.date || new Date(),
      notes: data.notes
    });
    
    await transaction.save();
    
    // Update portfolio holdings
    await portfolio.addHolding(asset._id, data.quantity, pricePerUnit, data.purchaseDate || new Date());
    
    return { transaction, portfolio };
  }
  
  // Execute sell transaction
  async sellAsset(userId, portfolioId, data) {
    const portfolio = await Portfolio.findOne({ _id: portfolioId, user: userId })
      .populate('holdings.asset');
    if (!portfolio) throw new Error('Portfolio not found');
    
    const asset = await Asset.findOne({ symbol: data.symbol.toUpperCase() });
    if (!asset) throw new Error('Asset not found');
    
    const pricePerUnit = data.price || asset.currentPrice?.price;
    if (!pricePerUnit) throw new Error('Price not available');
    
    // Remove from portfolio and calculate gains
    const saleResult = await portfolio.removeHolding(
      asset._id,
      data.quantity,
      pricePerUnit,
      data.costBasisMethod || portfolio.costBasisMethod
    );
    
    // Create transaction
    const transaction = new AssetTransaction({
      portfolio: portfolioId,
      asset: asset._id,
      user: userId,
      type: 'sell',
      quantity: data.quantity,
      pricePerUnit,
      currency: data.currency || asset.currency,
      fees: data.fees || {},
      date: data.date || new Date(),
      notes: data.notes,
      gainLoss: {
        realizedGain: saleResult.totalGain,
        costBasis: saleResult.totalCostBasis,
        proceeds: data.quantity * pricePerUnit,
        isShortTerm: saleResult.isShortTerm
      }
    });
    
    await transaction.save();
    
    return { transaction, saleResult, portfolio };
  }
  
  // Record dividend
  async recordDividend(userId, portfolioId, data) {
    const portfolio = await Portfolio.findOne({ _id: portfolioId, user: userId });
    if (!portfolio) throw new Error('Portfolio not found');
    
    const asset = await Asset.findOne({ symbol: data.symbol.toUpperCase() });
    if (!asset) throw new Error('Asset not found');
    
    const holding = portfolio.holdings.find(h => h.asset.toString() === asset._id.toString());
    if (!holding) throw new Error('Asset not in portfolio');
    
    const transaction = new AssetTransaction({
      portfolio: portfolioId,
      asset: asset._id,
      user: userId,
      type: 'dividend',
      quantity: holding.totalQuantity,
      pricePerUnit: data.dividendPerShare,
      totalAmount: data.totalAmount || (holding.totalQuantity * data.dividendPerShare),
      currency: data.currency || asset.currency,
      date: data.date || new Date(),
      notes: data.notes,
      dividend: {
        type: data.dividendType || 'cash',
        reinvested: data.reinvested || false,
        reinvestedShares: data.reinvestedShares
      }
    });
    
    await transaction.save();
    
    // If reinvested, add shares
    if (data.reinvested && data.reinvestedShares) {
      await portfolio.addHolding(asset._id, data.reinvestedShares, data.reinvestPrice, new Date());
    }
    
    return transaction;
  }
  
  // ============ PORTFOLIO ANALYTICS ============
  
  // Calculate portfolio performance
  async calculatePortfolioPerformance(portfolioId, userId) {
    const portfolio = await Portfolio.findOne({ _id: portfolioId, user: userId })
      .populate('holdings.asset');
    if (!portfolio) throw new Error('Portfolio not found');
    
    // Get all transactions
    const transactions = await AssetTransaction.find({ portfolio: portfolioId })
      .sort({ date: 1 });
    
    // Calculate total invested
    const totalInvested = transactions
      .filter(t => t.type === 'buy')
      .reduce((sum, t) => sum + (t.quantity * t.pricePerUnit) + (t.fees?.total || 0), 0);
    
    // Calculate total withdrawn
    const totalWithdrawn = transactions
      .filter(t => t.type === 'sell')
      .reduce((sum, t) => sum + (t.quantity * t.pricePerUnit) - (t.fees?.total || 0), 0);
    
    // Calculate dividends received
    const totalDividends = transactions
      .filter(t => t.type === 'dividend')
      .reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    
    // Calculate current value
    await portfolio.calculateTotalValue();
    const currentValue = portfolio.totalValue;
    
    // Calculate returns
    const totalReturn = currentValue + totalWithdrawn + totalDividends - totalInvested;
    const totalReturnPercent = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;
    
    // Get realized gains
    const realizedGains = await AssetTransaction.getRealizedGains(portfolioId, userId);
    
    return {
      portfolioId,
      currentValue,
      totalInvested,
      totalWithdrawn,
      totalDividends,
      totalReturn,
      totalReturnPercent: Math.round(totalReturnPercent * 100) / 100,
      realizedGains,
      unrealizedGains: currentValue - (totalInvested - totalWithdrawn)
    };
  }
  
  // Get portfolio history (for chart)
  async getPortfolioHistory(portfolioId, userId, days = 365) {
    const portfolio = await Portfolio.findOne({ _id: portfolioId, user: userId });
    if (!portfolio) throw new Error('Portfolio not found');
    
    // Use snapshots if available
    if (portfolio.snapshots?.length > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      
      return portfolio.snapshots
        .filter(s => s.date >= cutoff)
        .map(s => ({
          date: s.date,
          totalValue: s.totalValue,
          dayChange: s.dayChange,
          dayChangePercent: s.dayChangePercent
        }));
    }
    
    // Otherwise, calculate from transactions (more expensive)
    return this.calculateHistoricalValues(portfolioId, days);
  }
  
  // Calculate historical portfolio values
  async calculateHistoricalValues(portfolioId, days = 365) {
    const transactions = await AssetTransaction.find({ portfolio: portfolioId })
      .sort({ date: 1 })
      .populate('asset');
    
    if (transactions.length === 0) return [];
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const history = [];
    const holdings = new Map(); // Track holdings over time
    
    // Get unique dates
    const dates = [];
    for (let d = new Date(startDate); d <= new Date(); d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d));
    }
    
    // For each date, calculate portfolio value
    for (const date of dates) {
      // Update holdings based on transactions up to this date
      for (const tx of transactions) {
        if (tx.date <= date) {
          const key = tx.asset._id.toString();
          const current = holdings.get(key) || { quantity: 0, asset: tx.asset };
          
          if (tx.type === 'buy') {
            current.quantity += tx.quantity;
          } else if (tx.type === 'sell') {
            current.quantity -= tx.quantity;
          }
          
          holdings.set(key, current);
        }
      }
      
      // Calculate total value
      let totalValue = 0;
      for (const [, holding] of holdings) {
        if (holding.quantity > 0) {
          // Get historical price
          const priceData = await PriceHistory.findOne({
            asset: holding.asset._id,
            date: { $lte: date }
          }).sort({ date: -1 });
          
          const price = priceData?.close || holding.asset.currentPrice?.price || 0;
          totalValue += holding.quantity * price;
        }
      }
      
      history.push({
        date,
        totalValue: Math.round(totalValue * 100) / 100
      });
    }
    
    return history;
  }
  
  // ============ WATCHLIST ============
  
  // Add to watchlist
  async addToWatchlist(userId, symbolOrCoinId, type = 'stock') {
    let asset = await Asset.findOne({ 
      $or: [
        { symbol: symbolOrCoinId.toUpperCase() },
        { 'dataSource.externalId': symbolOrCoinId.toLowerCase() }
      ]
    });
    
    if (!asset) {
      // Create asset
      if (type === 'crypto') {
        const details = await this.fetchCryptoDetails(symbolOrCoinId);
        asset = await Asset.create({
          symbol: details.symbol,
          name: details.name,
          type: 'crypto',
          currency: 'USD',
          description: details.description,
          logo: details.image,
          dataSource: {
            provider: 'coingecko',
            externalId: symbolOrCoinId
          }
        });
      } else {
        const quote = await this.fetchStockPrice(symbolOrCoinId);
        asset = await Asset.create({
          symbol: quote.symbol,
          name: symbolOrCoinId,
          type,
          currency: 'USD',
          dataSource: {
            provider: 'alpha_vantage',
            externalId: quote.symbol
          }
        });
      }
      
      await this.updateAssetPrice(asset._id);
    }
    
    // Add user to watchedBy
    if (!asset.watchedBy.includes(userId)) {
      asset.watchedBy.push(userId);
      await asset.save();
    }
    
    return asset;
  }
  
  // Get watchlist
  async getWatchlist(userId) {
    const assets = await Asset.find({ watchedBy: userId, isActive: true })
      .sort({ 'currentPrice.lastUpdated': -1 });
    
    return assets.map(a => ({
      id: a._id,
      symbol: a.symbol,
      name: a.name,
      type: a.type,
      price: a.currentPrice?.price,
      change24h: a.currentPrice?.change24h,
      changePercent24h: a.currentPrice?.changePercent24h,
      lastUpdated: a.currentPrice?.lastUpdated
    }));
  }
  
  // Remove from watchlist
  async removeFromWatchlist(userId, assetId) {
    await Asset.findByIdAndUpdate(assetId, {
      $pull: { watchedBy: userId }
    });
    return { success: true };
  }
  
  // ============ SEARCH ============
  
  // Search assets
  async searchAssets(query, type = null) {
    return Asset.search(query, { type });
  }
  
  // Search crypto on CoinGecko
  async searchCrypto(query) {
    try {
      const response = await axios.get(`${this.coinGeckoBaseUrl}/search`, {
        params: { query },
        timeout: 10000
      });
      
      return response.data.coins.slice(0, 20).map(coin => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        marketCapRank: coin.market_cap_rank,
        thumb: coin.thumb,
        type: 'crypto'
      }));
    } catch (error) {
      console.error('Error searching crypto:', error.message);
      return [];
    }
  }
  
  // ============ HELPERS ============
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new InvestmentService();
