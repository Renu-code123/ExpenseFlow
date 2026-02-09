const axios = require('axios');
const PriceHistory = require('../models/PriceHistory');
const Asset = require('../models/Asset');

/**
 * Price Update Service
 * Handles real-time price fetching from multiple APIs
 */

class PriceUpdateService {
    
    constructor() {
        this.API_KEYS = {
            COINGECKO: process.env.COINGECKO_API_KEY || '', // CoinGecko free tier doesn't need key
            ALPHA_VANTAGE: process.env.ALPHA_VANTAGE_API_KEY || 'demo',
            FINNHUB: process.env.FINNHUB_API_KEY || '',
            POLYGON: process.env.POLYGON_API_KEY || ''
        };
        
        this.API_LIMITS = {
            COINGECKO: { callsPerMinute: 50, callsPerDay: 10000 },
            ALPHA_VANTAGE: { callsPerMinute: 5, callsPerDay: 500 },
            FINNHUB: { callsPerMinute: 60, callsPerDay: 30000 },
            POLYGON: { callsPerMinute: 5, callsPerDay: 100 }
        };
    }
    
    /**
     * Update price for a single asset
     */
    async updateAssetPrice(asset) {
        try {
            let price = null;
            let provider = null;
            
            // Try to get from cache first
            const cachedPrice = await PriceHistory.getPrice(asset.symbol, asset.asset_type);
            
            if (cachedPrice) {
                price = cachedPrice;
                provider = 'cache';
            } else {
                // Fetch from API based on asset type
                switch (asset.asset_type) {
                    case 'crypto':
                        ({ price, provider } = await this._getCryptoPrice(asset.symbol));
                        break;
                    case 'stock':
                    case 'etf':
                        ({ price, provider } = await this._getStockPrice(asset.symbol, asset.exchange));
                        break;
                    case 'mutual_fund':
                        ({ price, provider } = await this._getMutualFundPrice(asset.symbol));
                        break;
                    default:
                        throw new Error(`Unsupported asset type: ${asset.asset_type}`);
                }
            }
            
            if (price) {
                await asset.updateCurrentPrice(price);
                
                // Update price history
                await this._updatePriceHistory(asset.symbol, asset.asset_type, price, provider);
                
                // Check price alerts
                const triggeredAlerts = await asset.checkPriceAlerts();
                
                return {
                    success: true,
                    symbol: asset.symbol,
                    price,
                    provider,
                    triggered_alerts: triggeredAlerts.length
                };
            } else {
                throw new Error('Unable to fetch price');
            }
        } catch (error) {
            console.error(`Error updating price for ${asset.symbol}:`, error.message);
            
            asset.price_update_status = 'failed';
            asset.price_update_error = error.message;
            await asset.save();
            
            return {
                success: false,
                symbol: asset.symbol,
                error: error.message
            };
        }
    }
    
    /**
     * Batch update prices for multiple assets
     */
    async batchUpdatePrices(assetIds) {
        const results = [];
        
        for (const assetId of assetIds) {
            const asset = await Asset.findById(assetId);
            if (asset) {
                const result = await this.updateAssetPrice(asset);
                results.push(result);
                
                // Add delay to respect rate limits
                await this._delay(200); // 200ms delay between calls
            }
        }
        
        return results;
    }
    
    /**
     * Update all assets in a portfolio
     */
    async updatePortfolioPrices(portfolioId) {
        const assets = await Asset.find({ portfolio: portfolioId });
        const results = {
            total: assets.length,
            success: 0,
            failed: 0,
            details: []
        };
        
        for (const asset of assets) {
            const result = await this.updateAssetPrice(asset);
            
            if (result.success) {
                results.success++;
            } else {
                results.failed++;
            }
            
            results.details.push(result);
            
            // Respect rate limits
            await this._delay(200);
        }
        
        return results;
    }
    
    /**
     * Get real-time quote for symbol
     */
    async getQuote(symbol, assetType) {
        try {
            let quote = null;
            
            switch (assetType) {
                case 'crypto':
                    quote = await this._getCryptoQuote(symbol);
                    break;
                case 'stock':
                case 'etf':
                    quote = await this._getStockQuote(symbol);
                    break;
                default:
                    throw new Error(`Unsupported asset type: ${assetType}`);
            }
            
            return quote;
        } catch (error) {
            console.error(`Error fetching quote for ${symbol}:`, error.message);
            throw error;
        }
    }
    
    /**
     * Search for assets (stocks/crypto)
     */
    async searchAssets(query, assetType = 'stock') {
        try {
            let results = [];
            
            if (assetType === 'crypto') {
                results = await this._searchCrypto(query);
            } else {
                results = await this._searchStocks(query);
            }
            
            return results;
        } catch (error) {
            console.error(`Error searching assets:`, error.message);
            return [];
        }
    }
    
    /**
     * Get historical prices
     */
    async getHistoricalPrices(symbol, assetType, days = 30) {
        const priceHistory = await PriceHistory.findOne({ symbol, asset_type: assetType });
        
        if (priceHistory) {
            return priceHistory.getHistoricalData(days);
        }
        
        // Fetch from API if not in cache
        try {
            let prices = [];
            
            if (assetType === 'crypto') {
                prices = await this._getCryptoHistoricalPrices(symbol, days);
            } else {
                prices = await this._getStockHistoricalPrices(symbol, days);
            }
            
            // Cache the results
            if (prices.length > 0) {
                await this._cacheHistoricalPrices(symbol, assetType, prices);
            }
            
            return prices;
        } catch (error) {
            console.error(`Error fetching historical prices:`, error.message);
            return [];
        }
    }
    
    /**
     * PRIVATE METHODS - Crypto APIs
     */
    
    async _getCryptoPrice(symbol) {
        try {
            // CoinGecko API
            const coinId = this._getCoinGeckoId(symbol);
            const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
            
            const response = await axios.get(url, {
                timeout: 10000
            });
            
            const price = response.data[coinId]?.usd;
            
            if (!price) {
                throw new Error('Price not found');
            }
            
            return { price, provider: 'coingecko' };
        } catch (error) {
            console.error('CoinGecko API error:', error.message);
            throw error;
        }
    }
    
    async _getCryptoQuote(symbol) {
        try {
            const coinId = this._getCoinGeckoId(symbol);
            const url = `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`;
            
            const response = await axios.get(url, { timeout: 10000 });
            const data = response.data;
            
            return {
                symbol,
                name: data.name,
                price: data.market_data.current_price.usd,
                change_24h: data.market_data.price_change_24h,
                change_percentage_24h: data.market_data.price_change_percentage_24h,
                market_cap: data.market_data.market_cap.usd,
                volume_24h: data.market_data.total_volume.usd,
                high_24h: data.market_data.high_24h.usd,
                low_24h: data.market_data.low_24h.usd,
                circulating_supply: data.market_data.circulating_supply,
                total_supply: data.market_data.total_supply,
                ath: data.market_data.ath.usd,
                atl: data.market_data.atl.usd,
                last_updated: data.last_updated
            };
        } catch (error) {
            console.error('CoinGecko quote error:', error.message);
            throw error;
        }
    }
    
    async _getCryptoHistoricalPrices(symbol, days) {
        try {
            const coinId = this._getCoinGeckoId(symbol);
            const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
            
            const response = await axios.get(url, { timeout: 15000 });
            const prices = response.data.prices;
            
            return prices.map(([timestamp, price]) => ({
                date: new Date(timestamp),
                close: price,
                open: price,
                high: price,
                low: price
            }));
        } catch (error) {
            console.error('CoinGecko historical data error:', error.message);
            return [];
        }
    }
    
    async _searchCrypto(query) {
        try {
            const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`;
            const response = await axios.get(url, { timeout: 10000 });
            
            return response.data.coins.slice(0, 10).map(coin => ({
                symbol: coin.symbol.toUpperCase(),
                name: coin.name,
                id: coin.id,
                market_cap_rank: coin.market_cap_rank,
                thumb: coin.thumb,
                asset_type: 'crypto'
            }));
        } catch (error) {
            console.error('CoinGecko search error:', error.message);
            return [];
        }
    }
    
    _getCoinGeckoId(symbol) {
        // Map common symbols to CoinGecko IDs
        const symbolMap = {
            'BTC': 'bitcoin',
            'ETH': 'ethereum',
            'BNB': 'binancecoin',
            'XRP': 'ripple',
            'ADA': 'cardano',
            'DOGE': 'dogecoin',
            'SOL': 'solana',
            'DOT': 'polkadot',
            'MATIC': 'matic-network',
            'LTC': 'litecoin',
            'AVAX': 'avalanche-2',
            'LINK': 'chainlink',
            'UNI': 'uniswap',
            'ATOM': 'cosmos',
            'XLM': 'stellar'
        };
        
        return symbolMap[symbol.toUpperCase()] || symbol.toLowerCase();
    }
    
    /**
     * PRIVATE METHODS - Stock APIs
     */
    
    async _getStockPrice(symbol, exchange = 'US') {
        try {
            // Try Alpha Vantage first
            if (this.API_KEYS.ALPHA_VANTAGE && this.API_KEYS.ALPHA_VANTAGE !== 'demo') {
                try {
                    const { price, provider } = await this._getAlphaVantagePrice(symbol);
                    return { price, provider };
                } catch (error) {
                    console.log('Alpha Vantage failed, trying Finnhub...');
                }
            }
            
            // Fallback to Finnhub
            if (this.API_KEYS.FINNHUB) {
                try {
                    const { price, provider } = await this._getFinnhubPrice(symbol);
                    return { price, provider };
                } catch (error) {
                    console.log('Finnhub failed');
                }
            }
            
            throw new Error('No API keys configured or all APIs failed');
        } catch (error) {
            console.error('Stock price fetch error:', error.message);
            throw error;
        }
    }
    
    async _getAlphaVantagePrice(symbol) {
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.API_KEYS.ALPHA_VANTAGE}`;
        
        const response = await axios.get(url, { timeout: 10000 });
        const data = response.data['Global Quote'];
        
        if (!data || !data['05. price']) {
            throw new Error('Price not found in Alpha Vantage response');
        }
        
        return {
            price: parseFloat(data['05. price']),
            provider: 'alpha_vantage'
        };
    }
    
    async _getFinnhubPrice(symbol) {
        const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${this.API_KEYS.FINNHUB}`;
        
        const response = await axios.get(url, { timeout: 10000 });
        
        if (!response.data || !response.data.c) {
            throw new Error('Price not found in Finnhub response');
        }
        
        return {
            price: response.data.c,
            provider: 'finnhub'
        };
    }
    
    async _getStockQuote(symbol) {
        try {
            // Try Finnhub for detailed quote
            if (this.API_KEYS.FINNHUB) {
                const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${this.API_KEYS.FINNHUB}`;
                const response = await axios.get(url, { timeout: 10000 });
                
                return {
                    symbol,
                    price: response.data.c,
                    change: response.data.d,
                    change_percentage: response.data.dp,
                    high: response.data.h,
                    low: response.data.l,
                    open: response.data.o,
                    previous_close: response.data.pc,
                    timestamp: response.data.t
                };
            }
            
            throw new Error('No API key configured');
        } catch (error) {
            console.error('Stock quote error:', error.message);
            throw error;
        }
    }
    
    async _getStockHistoricalPrices(symbol, days) {
        try {
            if (!this.API_KEYS.ALPHA_VANTAGE || this.API_KEYS.ALPHA_VANTAGE === 'demo') {
                return [];
            }
            
            const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${this.API_KEYS.ALPHA_VANTAGE}&outputsize=compact`;
            
            const response = await axios.get(url, { timeout: 15000 });
            const timeSeries = response.data['Time Series (Daily)'];
            
            if (!timeSeries) {
                return [];
            }
            
            const prices = [];
            const dates = Object.keys(timeSeries).sort().reverse().slice(0, days);
            
            dates.forEach(date => {
                const data = timeSeries[date];
                prices.push({
                    date: new Date(date),
                    open: parseFloat(data['1. open']),
                    high: parseFloat(data['2. high']),
                    low: parseFloat(data['3. low']),
                    close: parseFloat(data['4. close']),
                    volume: parseInt(data['5. volume'])
                });
            });
            
            return prices;
        } catch (error) {
            console.error('Stock historical data error:', error.message);
            return [];
        }
    }
    
    async _searchStocks(query) {
        try {
            if (!this.API_KEYS.ALPHA_VANTAGE || this.API_KEYS.ALPHA_VANTAGE === 'demo') {
                return [];
            }
            
            const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${this.API_KEYS.ALPHA_VANTAGE}`;
            
            const response = await axios.get(url, { timeout: 10000 });
            const matches = response.data.bestMatches || [];
            
            return matches.slice(0, 10).map(match => ({
                symbol: match['1. symbol'],
                name: match['2. name'],
                type: match['3. type'],
                region: match['4. region'],
                currency: match['8. currency'],
                asset_type: 'stock'
            }));
        } catch (error) {
            console.error('Stock search error:', error.message);
            return [];
        }
    }
    
    async _getMutualFundPrice(symbol) {
        // Mutual funds typically update daily
        // This would need a specialized API or manual updates
        throw new Error('Mutual fund price updates not yet implemented');
    }
    
    /**
     * HELPER METHODS
     */
    
    async _updatePriceHistory(symbol, assetType, price, provider) {
        let priceHistory = await PriceHistory.findOne({ symbol, asset_type: assetType });
        
        if (!priceHistory) {
            priceHistory = new PriceHistory({
                symbol,
                asset_type: assetType,
                data_source: { provider }
            });
        }
        
        await priceHistory.updateLatestPrice(price, provider);
    }
    
    async _cacheHistoricalPrices(symbol, assetType, prices) {
        let priceHistory = await PriceHistory.findOne({ symbol, asset_type: assetType });
        
        if (!priceHistory) {
            priceHistory = new PriceHistory({
                symbol,
                asset_type: assetType
            });
        }
        
        for (const price of prices) {
            await priceHistory.addPrice(price);
        }
        
        return priceHistory;
    }
    
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new PriceUpdateService();
