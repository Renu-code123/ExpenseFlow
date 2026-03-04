/**
 * Forex Service
 * Issue #521: Advanced Multi-Currency Intelligence & Forex Revaluation
 * Handles real-time FX rates, P&L calculations, and forex intelligence
 */

const currencyService = require('./currencyService');
const CurrencyRate = require('../models/CurrencyRate');
const CurrencyMath = require('../utils/currencyMath');

class ForexService {
    constructor() {
        // In-memory cache for real-time rates (simulating Redis)
        this.rateCache = new Map();
        this.cacheExpiry = new Map();

        // New historical rate cache for revaluation engine
        this.historicalCache = new Map();

        this.CACHE_TTL = 300000; // 5 minutes in milliseconds
    }

    /**
     * Get real-time exchange rate with caching
     * @param {String} from - Source currency
     * @param {String} to - Target currency
     * @returns {Object} { rate, timestamp, cached }
     */
    async getRealTimeRate(from, to) {
        const cacheKey = `${from}_${to}`;
        const now = Date.now();

        // Check cache first
        if (this.rateCache.has(cacheKey)) {
            const expiry = this.cacheExpiry.get(cacheKey);
            if (expiry > now) {
                return {
                    rate: this.rateCache.get(cacheKey),
                    timestamp: new Date(expiry - this.CACHE_TTL),
                    cached: true,
                    source: 'memory_cache'
                };
            }
        }

        // Fetch fresh rate
        try {
            const rate = await currencyService.getRate(from, to);

            // Update cache
            this.rateCache.set(cacheKey, rate);
            this.cacheExpiry.set(cacheKey, now + this.CACHE_TTL);

            return {
                rate,
                timestamp: new Date(),
                cached: false,
                source: 'live_api'
            };
        } catch (error) {
            console.error(`[ForexService] Error fetching rate ${from}/${to}:`, error);

            // Return stale cache if available
            if (this.rateCache.has(cacheKey)) {
                return {
                    rate: this.rateCache.get(cacheKey),
                    timestamp: new Date(this.cacheExpiry.get(cacheKey) - this.CACHE_TTL),
                    cached: true,
                    source: 'stale_cache',
                    warning: 'Using stale data due to API error'
                };
            }

            throw error;
        }
    }

    /**
     * Convert amount in real-time with caching
     * @param {Number} amount 
     * @param {String} from 
     * @param {String} to 
     */
    async convertRealTime(amount, from, to) {
        if (from === to) {
            return {
                originalAmount: amount,
                convertedAmount: amount,
                rate: 1,
                from,
                to,
                timestamp: new Date()
            };
        }

        const rateData = await this.getRealTimeRate(from, to);

        return {
            originalAmount: amount,
            convertedAmount: amount * rateData.rate,
            rate: rateData.rate,
            from,
            to,
            timestamp: rateData.timestamp,
            cached: rateData.cached,
            source: rateData.source
        };
    }

    /**
     * Get historical rate for a specific date with caching
     * @param {String} from 
     * @param {String} to 
     * @param {Date|String} date 
     */
    async getHistoricalRate(from, to, date) {
        const normalizedDate = new Date(date);
        normalizedDate.setHours(0, 0, 0, 0);
        const dateStr = normalizedDate.toISOString().split('T')[0];
        const cacheKey = `${from}_${to}_${dateStr}`;

        // Check historical cache
        if (this.historicalCache.has(cacheKey)) {
            return {
                rate: this.historicalCache.get(cacheKey),
                from,
                to,
                date: normalizedDate,
                source: 'historical_cache'
            };
        }

        try {
            const rate = await currencyService.getHistoricalRate(from, to, normalizedDate);

            // Update historical cache
            this.historicalCache.set(cacheKey, rate);

            return {
                rate,
                from,
                to,
                date: normalizedDate,
                source: 'historical_db'
            };
        } catch (error) {
            console.error(`[ForexService] Error fetching historical rate for ${dateStr}:`, error);

            // Fallback to current rate if historical data unavailable
            const currentRate = await this.getRealTimeRate(from, to);
            return {
                rate: currentRate.rate,
                from,
                to,
                date: normalizedDate,
                source: 'current_rate_fallback',
                warning: 'Historical rate unavailable, using current rate'
            };
        }
    }

    /**
     * Synchronize a batch of historical rates
     * @param {String} from 
     * @param {String} to 
     * @param {Array} dates 
     */
    async syncHistoricalRates(from, to, dates) {
        const results = {
            synced: 0,
            alreadyInCache: 0,
            failed: 0,
            errors: []
        };

        for (const date of dates) {
            const normalizedDate = new Date(date);
            normalizedDate.setHours(0, 0, 0, 0);
            const dateStr = normalizedDate.toISOString().split('T')[0];
            const cacheKey = `${from}_${to}_${dateStr}`;

            if (this.historicalCache.has(cacheKey)) {
                results.alreadyInCache++;
                continue;
            }

            try {
                await this.getHistoricalRate(from, to, normalizedDate);
                results.synced++;
            } catch (error) {
                results.failed++;
                results.errors.push({ date: dateStr, error: error.message });
            }
        }

        return results;
    }

    /**
     * Calculate unrealized P&L for foreign currency holdings
     * @param {Object} holding - { currency, amount, acquisitionRate, baseCurrency }
     */
    async calculateUnrealizedPL(holding) {
        const { currency, amount, acquisitionRate, baseCurrency = 'USD' } = holding;

        const currentRateData = await this.getRealTimeRate(currency, baseCurrency);
        const currentRate = currentRateData.rate;

        const bookValue = amount * acquisitionRate; // Original value in base currency
        const marketValue = amount * currentRate; // Current value in base currency
        const unrealizedPL = marketValue - bookValue;
        const plPercentage = (unrealizedPL / bookValue) * 100;

        return {
            currency,
            amount,
            baseCurrency,
            bookValue,
            marketValue,
            unrealizedPL,
            plPercentage,
            acquisitionRate,
            currentRate,
            timestamp: currentRateData.timestamp,
            trend: unrealizedPL >= 0 ? 'profit' : 'loss'
        };
    }

    /**
     * Calculate realized P&L for a completed transaction
     * @param {Object} transaction - { currency, amount, buyRate, sellRate, baseCurrency }
     */
    calculateRealizedPL(transaction) {
        const { currency, amount, buyRate, sellRate, baseCurrency = 'USD' } = transaction;

        const costBasis = amount * buyRate;
        const proceeds = amount * sellRate;
        const realizedPL = proceeds - costBasis;
        const plPercentage = (realizedPL / costBasis) * 100;

        return {
            currency,
            amount,
            baseCurrency,
            costBasis,
            proceeds,
            realizedPL,
            plPercentage,
            buyRate,
            sellRate,
            trend: realizedPL >= 0 ? 'profit' : 'loss'
        };
    }

    /**
     * Get multi-currency portfolio summary
     * @param {Array} holdings - Array of { currency, amount, acquisitionRate }
     * @param {String} baseCurrency 
     */
    async getPortfolioSummary(holdings, baseCurrency = 'USD') {
        const summaries = [];
        let totalBookValue = 0;
        let totalMarketValue = 0;

        for (const holding of holdings) {
            const pl = await this.calculateUnrealizedPL({
                ...holding,
                baseCurrency
            });
            summaries.push(pl);
            totalBookValue += pl.bookValue;
            totalMarketValue += pl.marketValue;
        }

        const totalUnrealizedPL = totalMarketValue - totalBookValue;
        const totalPLPercentage = totalBookValue > 0 ? (totalUnrealizedPL / totalBookValue) * 100 : 0;

        return {
            baseCurrency,
            holdings: summaries,
            summary: {
                totalBookValue,
                totalMarketValue,
                totalUnrealizedPL,
                totalPLPercentage,
                trend: totalUnrealizedPL >= 0 ? 'profit' : 'loss',
                holdingsCount: holdings.length
            },
            timestamp: new Date()
        };
    }

    /**
     * Get currency strength index (relative to basket of major currencies)
     * @param {String} currency 
     */
    async getCurrencyStrengthIndex(currency) {
        const benchmarkCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF'];
        const benchmarks = benchmarkCurrencies.filter(c => c !== currency);

        const rates = [];
        for (const benchmark of benchmarks) {
            try {
                const rateData = await this.getRealTimeRate(currency, benchmark);
                rates.push({
                    currency: benchmark,
                    rate: rateData.rate,
                    cached: rateData.cached
                });
            } catch (error) {
                console.error(`[ForexService] Error fetching ${currency}/${benchmark}:`, error);
            }
        }

        // Calculate average strength (simplified index)
        const avgRate = rates.reduce((sum, r) => sum + r.rate, 0) / rates.length;

        return {
            currency,
            strengthIndex: avgRate,
            benchmarks: rates,
            timestamp: new Date(),
            interpretation: avgRate > 1 ? 'strong' : avgRate > 0.5 ? 'neutral' : 'weak'
        };
    }

    /**
     * Get currency volatility indicator (simplified)
     * Would ideally use historical data over 30 days
     */
    async getCurrencyVolatility(currency, baseCurrency = 'USD') {
        // Simplified: In production, this would analyze standard deviation of rates over time
        // For now, return a mock volatility score

        const cryptoHighVolatility = ['BTC', 'ETH', 'USDT', 'BNB'];
        const emergingMarketVolatility = ['INR', 'BRL', 'TRY', 'ZAR'];

        let volatilityScore = 'low'; // default for major forex pairs

        if (cryptoHighVolatility.includes(currency)) {
            volatilityScore = 'very_high';
        } else if (emergingMarketVolatility.includes(currency)) {
            volatilityScore = 'medium';
        }

        return {
            currency,
            baseCurrency,
            volatilityScore,
            recommendation: volatilityScore === 'very_high' ?
                'High risk - monitor closely' :
                volatilityScore === 'medium' ?
                    'Moderate risk - regular monitoring advised' :
                    'Stable currency',
            timestamp: new Date()
        };
    }

    /**
     * Batch convert multiple amounts
     * @param {Array} conversions - Array of { amount, from, to }
     */
    async batchConvert(conversions) {
        const results = [];

        for (const conversion of conversions) {
            try {
                const result = await this.convertRealTime(
                    conversion.amount,
                    conversion.from,
                    conversion.to
                );
                results.push({
                    ...result,
                    success: true
                });
            } catch (error) {
                results.push({
                    ...conversion,
                    success: false,
                    error: error.message
                });
            }
        }

        return {
            conversions: results,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            timestamp: new Date()
        };
    }

    /**
     * Clear rate cache (useful for forcing fresh data)
     */
    clearCache() {
        this.rateCache.clear();
        this.cacheExpiry.clear();
        return { message: 'Cache cleared successfully' };
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        const now = Date.now();
        let validEntries = 0;
        let expiredEntries = 0;

        for (const [key, expiry] of this.cacheExpiry.entries()) {
            if (expiry > now) {
                validEntries++;
            } else {
                expiredEntries++;
            }
        }

        return {
            totalEntries: this.rateCache.size,
            validEntries,
            expiredEntries,
            cacheTTL: this.CACHE_TTL,
            cacheKeys: Array.from(this.rateCache.keys())
        };
    }
}

module.exports = new ForexService();
