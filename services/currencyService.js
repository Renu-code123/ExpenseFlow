/**
 * Currency Service
 * Issue #337: Multi-Account Liquidity Management & Historical Revaluation
 * Handles currency conversion, exchange rates, and crypto prices
 */

const CurrencyRate = require('../models/CurrencyRate');

// Supported fiat currencies
const FIAT_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'NZD',
  'SEK', 'KRW', 'SGD', 'NOK', 'MXN', 'INR', 'RUB', 'ZAR', 'TRY', 'BRL',
  'TWD', 'DKK', 'PLN', 'THB', 'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP',
  'AED', 'COP', 'SAR', 'MYR', 'RON', 'PKR', 'NGN', 'EGP', 'VND', 'BDT'
];

// Supported cryptocurrencies
const CRYPTO_CURRENCIES = [
  'BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'XRP', 'ADA', 'DOGE', 'SOL', 'DOT',
  'MATIC', 'LTC', 'SHIB', 'TRX', 'AVAX', 'LINK', 'ATOM', 'UNI', 'XLM', 'ALGO'
];

// Fallback rates (used when API fails)
const FALLBACK_RATES = {
  'USD': 1,
  'EUR': 0.92,
  'GBP': 0.79,
  'JPY': 149.50,
  'AUD': 1.53,
  'CAD': 1.36,
  'CHF': 0.88,
  'CNY': 7.24,
  'INR': 83.12,
  'BTC': 0.000024,
  'ETH': 0.00041
};

class CurrencyService {
  constructor() {
    this.validCurrencies = [...FIAT_CURRENCIES, ...CRYPTO_CURRENCIES];
    this.fiatCurrencies = FIAT_CURRENCIES;
    this.cryptoCurrencies = CRYPTO_CURRENCIES;
    this.exchangeRates = new Map();
    this.cryptoPrices = new Map();
    this.lastUpdate = null;
    this.cacheExpiry = 60 * 60 * 1000; // 1 hour cache
    this.apiRetries = 3;
    this.baseCurrency = 'USD';
  }

  init() {
    console.log('Currency service initialized with', this.validCurrencies.length, 'currencies');
    // Pre-fetch rates on startup
    this.fetchAllRates().catch(err => {
      console.warn('Initial rate fetch failed, using fallback rates:', err.message);
      this.loadFallbackRates();
    });
  }

  loadFallbackRates() {
    Object.entries(FALLBACK_RATES).forEach(([currency, rate]) => {
      this.exchangeRates.set(currency, rate);
    });
    this.lastUpdate = new Date();
  }

  isValidCurrency(currency) {
    return this.validCurrencies.includes(currency?.toUpperCase());
  }

  isCrypto(currency) {
    return this.cryptoCurrencies.includes(currency?.toUpperCase());
  }

  isFiat(currency) {
    return this.fiatCurrencies.includes(currency?.toUpperCase());
  }

  /**
   * Fetch exchange rates from external API
   */
  async fetchExchangeRates(baseCurrency = 'USD') {
    const apis = [
      {
        name: 'exchangerate-api',
        url: `https://api.exchangerate-api.com/v4/latest/${baseCurrency}`,
        parser: (data) => data.rates
      },
      {
        name: 'frankfurter',
        url: `https://api.frankfurter.app/latest?from=${baseCurrency}`,
        parser: (data) => data.rates
      }
    ];

    for (const api of apis) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(api.url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) continue;

        const data = await response.json();
        const rates = api.parser(data);

        if (rates && Object.keys(rates).length > 0) {
          // Store in database
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
          
          await CurrencyRate.findOneAndUpdate(
            { baseCurrency },
            {
              baseCurrency,
              rates: new Map(Object.entries(rates)),
              lastUpdated: new Date(),
              source: api.name,
              expiresAt
            },
            { upsert: true, new: true }
          );

          // Update in-memory cache
          rates[baseCurrency] = 1;
          Object.entries(rates).forEach(([currency, rate]) => {
            this.exchangeRates.set(currency, rate);
          });
          
          this.lastUpdate = new Date();
          console.log(`Exchange rates updated from ${api.name}`);
          
          return rates;
        }
      } catch (error) {
        console.warn(`Failed to fetch from ${api.name}:`, error.message);
      }
    }

    throw new Error('All exchange rate APIs failed');
  }

  /**
   * Fetch cryptocurrency prices
   */
  async fetchCryptoPrices() {
    const cryptoIds = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'USDT': 'tether',
      'USDC': 'usd-coin',
      'BNB': 'binancecoin',
      'XRP': 'ripple',
      'ADA': 'cardano',
      'DOGE': 'dogecoin',
      'SOL': 'solana',
      'DOT': 'polkadot',
      'MATIC': 'matic-network',
      'LTC': 'litecoin',
      'SHIB': 'shiba-inu',
      'TRX': 'tron',
      'AVAX': 'avalanche-2',
      'LINK': 'chainlink',
      'ATOM': 'cosmos',
      'UNI': 'uniswap',
      'XLM': 'stellar',
      'ALGO': 'algorand'
    };

    const ids = Object.values(cryptoIds).join(',');
    
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
        { timeout: 10000 }
      );

      if (!response.ok) throw new Error('CoinGecko API failed');

      const data = await response.json();
      const prices = {};

      Object.entries(cryptoIds).forEach(([symbol, id]) => {
        if (data[id]?.usd) {
          prices[symbol] = data[id].usd;
          this.cryptoPrices.set(symbol, data[id].usd);
          // Store as exchange rate (1 USD = x crypto)
          this.exchangeRates.set(symbol, 1 / data[id].usd);
        }
      });

      console.log('Crypto prices updated from CoinGecko');
      return prices;
    } catch (error) {
      console.warn('Failed to fetch crypto prices:', error.message);
      return null;
    }
  }

  /**
   * Fetch all rates (fiat + crypto)
   */
  async fetchAllRates() {
    const [fiatRates, cryptoPrices] = await Promise.allSettled([
      this.fetchExchangeRates(this.baseCurrency),
      this.fetchCryptoPrices()
    ]);

    return {
      fiat: fiatRates.status === 'fulfilled' ? fiatRates.value : null,
      crypto: cryptoPrices.status === 'fulfilled' ? cryptoPrices.value : null,
      timestamp: new Date()
    };
  }

  /**
   * Get current exchange rate
   */
  async getRate(fromCurrency, toCurrency = 'USD') {
    fromCurrency = fromCurrency?.toUpperCase();
    toCurrency = toCurrency?.toUpperCase();

    if (fromCurrency === toCurrency) return 1;

    // Check if cache is stale
    if (!this.lastUpdate || Date.now() - this.lastUpdate.getTime() > this.cacheExpiry) {
      try {
        await this.fetchAllRates();
      } catch (error) {
        // Try to load from database
        const dbRates = await CurrencyRate.getLatestRates(this.baseCurrency);
        if (dbRates) {
          dbRates.rates.forEach((rate, currency) => {
            this.exchangeRates.set(currency, rate);
          });
          this.lastUpdate = dbRates.lastUpdated;
        }
      }
    }

    // Calculate rate
    const fromRate = this.exchangeRates.get(fromCurrency) || 1;
    const toRate = this.exchangeRates.get(toCurrency) || 1;

    return toRate / fromRate;
  }

  /**
   * Get all current rates for a base currency
   */
  async getAllRates(baseCurrency = 'USD') {
    await this.fetchAllRates().catch(() => {});

    const rates = {};
    this.exchangeRates.forEach((rate, currency) => {
      if (currency !== baseCurrency) {
        const baseRate = this.exchangeRates.get(baseCurrency) || 1;
        rates[currency] = rate / baseRate;
      }
    });
    rates[baseCurrency] = 1;

    return {
      baseCurrency,
      rates,
      lastUpdated: this.lastUpdate,
      source: 'cached'
    };
  }

  /**
   * Convert currency amount
   */
  async convertCurrency(amount, fromCurrency, toCurrency) {
    fromCurrency = fromCurrency?.toUpperCase();
    toCurrency = toCurrency?.toUpperCase();

    if (!this.isValidCurrency(fromCurrency)) {
      throw new Error(`Invalid source currency: ${fromCurrency}`);
    }
    if (!this.isValidCurrency(toCurrency)) {
      throw new Error(`Invalid target currency: ${toCurrency}`);
    }

    const exchangeRate = await this.getRate(fromCurrency, toCurrency);
    const convertedAmount = amount * exchangeRate;

    return {
      originalAmount: amount,
      convertedAmount: Math.round(convertedAmount * 100) / 100,
      exchangeRate,
      fromCurrency,
      toCurrency,
      timestamp: new Date()
    };
  }

  /**
   * Convert multiple amounts at once
   */
  async convertMultiple(conversions) {
    const results = [];
    
    for (const { amount, fromCurrency, toCurrency } of conversions) {
      try {
        const result = await this.convertCurrency(amount, fromCurrency, toCurrency);
        results.push({ ...result, success: true });
      } catch (error) {
        results.push({
          amount,
          fromCurrency,
          toCurrency,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get historical rates for a date
   */
  async getHistoricalRate(fromCurrency, toCurrency, date) {
    const targetDate = new Date(date);
    
    // Try to find from database
    const historicalRates = await CurrencyRate.findOne({
      baseCurrency: 'USD',
      createdAt: {
        $gte: new Date(targetDate.setHours(0, 0, 0, 0)),
        $lt: new Date(targetDate.setHours(23, 59, 59, 999))
      }
    });

    if (historicalRates) {
      const fromRate = historicalRates.rates.get(fromCurrency) || 1;
      const toRate = historicalRates.rates.get(toCurrency) || 1;
      return {
        rate: toRate / fromRate,
        date: historicalRates.lastUpdated,
        source: 'database'
      };
    }

    // Fallback to current rate
    const currentRate = await this.getRate(fromCurrency, toCurrency);
    return {
      rate: currentRate,
      date: new Date(),
      source: 'current',
      warning: 'Historical rate not available, using current rate'
    };
  }

  /**
   * Calculate total value in base currency
   */
  async calculateTotalInBaseCurrency(amounts, baseCurrency = 'USD') {
    let total = 0;

    for (const { amount, currency } of amounts) {
      if (currency === baseCurrency) {
        total += amount;
      } else {
        const rate = await this.getRate(currency, baseCurrency);
        total += amount * rate;
      }
    }

    return {
      total: Math.round(total * 100) / 100,
      baseCurrency,
      itemCount: amounts.length,
      timestamp: new Date()
    };
  }

  /**
   * Get currency info
   */
  getCurrencyInfo(currency) {
    const currencyInfo = {
      'USD': { symbol: '$', name: 'US Dollar', decimals: 2 },
      'EUR': { symbol: '€', name: 'Euro', decimals: 2 },
      'GBP': { symbol: '£', name: 'British Pound', decimals: 2 },
      'JPY': { symbol: '¥', name: 'Japanese Yen', decimals: 0 },
      'INR': { symbol: '₹', name: 'Indian Rupee', decimals: 2 },
      'BTC': { symbol: '₿', name: 'Bitcoin', decimals: 8 },
      'ETH': { symbol: 'Ξ', name: 'Ethereum', decimals: 8 },
      'USDT': { symbol: '₮', name: 'Tether', decimals: 2 },
      'AUD': { symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
      'CAD': { symbol: 'C$', name: 'Canadian Dollar', decimals: 2 }
    };

    return currencyInfo[currency?.toUpperCase()] || {
      symbol: currency,
      name: currency,
      decimals: 2
    };
  }

  /**
   * Format currency amount
   */
  formatAmount(amount, currency, locale = 'en-US') {
    const info = this.getCurrencyInfo(currency);
    
    if (this.isCrypto(currency)) {
      return `${info.symbol}${amount.toFixed(info.decimals)}`;
    }

    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: info.decimals,
        maximumFractionDigits: info.decimals
      }).format(amount);
    } catch {
      return `${info.symbol}${amount.toFixed(info.decimals)}`;
    }
  }

  /**
   * Get supported currencies list
   */
  getSupportedCurrencies() {
    return {
      fiat: this.fiatCurrencies.map(code => ({
        code,
        ...this.getCurrencyInfo(code),
        type: 'fiat'
      })),
      crypto: this.cryptoCurrencies.map(code => ({
        code,
        ...this.getCurrencyInfo(code),
        type: 'crypto'
      }))
    };
  }
}

module.exports = new CurrencyService();