const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const currencyService = require('../services/currencyService');
const forexService = require('../services/forexService');
const revaluationService = require('../services/revaluationService');
const Joi = require('joi');

/**
 * @route   GET /api/currency/rates
 * @desc    Get current exchange rates
 * @access  Private
 */
router.get('/rates', auth, async (req, res) => {
    try {
        const { base = 'USD', symbols } = req.query;

        // Validate base currency
        if (!currencyService.isValidCurrency(base)) {
            return res.status(400).json({
                error: 'Invalid base currency code'
            });
        }

        // Parse symbols if provided
        let targetCurrencies = null;
        if (symbols) {
            const symbolArray = symbols.split(',').map(s => s.trim().toUpperCase());
            const invalidSymbols = symbolArray.filter(s => !currencyService.isValidCurrency(s));
            if (invalidSymbols.length > 0) {
                return res.status(400).json({
                    error: `Invalid currency codes: ${invalidSymbols.join(', ')}`
                });
            }
            targetCurrencies = symbolArray;
        }

        const ratesData = await currencyService.getExchangeRates(base);

        // Filter rates if specific symbols requested
        let filteredRates = ratesData.rates;
        if (targetCurrencies) {
            filteredRates = {};
            targetCurrencies.forEach(symbol => {
                if (ratesData.rates[symbol]) {
                    filteredRates[symbol] = ratesData.rates[symbol];
                }
            });
        }

        res.json({
            success: true,
            data: {
                base: ratesData.baseCurrency,
                rates: filteredRates,
                lastUpdated: ratesData.lastUpdated,
                source: ratesData.source,
                cached: ratesData.cached
            }
        });
    } catch (error) {
        console.error('[Currency Routes] Get rates error:', error);
        res.status(500).json({
            error: 'Failed to fetch exchange rates'
        });
    }
});

/**
 * @route   POST /api/currency/convert
 * @desc    Convert amount between currencies
 * @access  Private
 */
router.post('/convert', auth, async (req, res) => {
    try {
        const { amount, from, to } = req.body;

        // Validation
        if (!amount || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({
                error: 'Valid amount is required'
            });
        }

        if (!from || !to) {
            return res.status(400).json({
                error: 'Both from and to currencies are required'
            });
        }

        if (!currencyService.isValidCurrency(from) || !currencyService.isValidCurrency(to)) {
            return res.status(400).json({
                error: 'Invalid currency code(s)'
            });
        }

        const conversion = await currencyService.convertCurrency(amount, from.toUpperCase(), to.toUpperCase());

        res.json({
            success: true,
            data: conversion
        });
    } catch (error) {
        console.error('[Currency Routes] Convert error:', error);
        res.status(500).json({
            error: 'Failed to convert currency'
        });
    }
});

/**
 * @route   GET /api/currency/supported
 * @desc    Get list of supported currencies
 * @access  Private
 */
router.get('/supported', auth, async (req, res) => {
    try {
        const currencies = currencyService.getSupportedCurrencies();

        res.json({
            success: true,
            count: currencies.length,
            data: currencies
        });
    } catch (error) {
        console.error('[Currency Routes] Get supported currencies error:', error);
        res.status(500).json({
            error: 'Failed to fetch supported currencies'
        });
    }
});

/**
 * @route   GET /api/currency/symbols
 * @desc    Get currency symbols mapping
 * @access  Private
 */
router.get('/symbols', auth, async (req, res) => {
    try {
        const currencies = currencyService.getSupportedCurrencies();
        const symbols = {};

        currencies.forEach(currency => {
            symbols[currency.code] = {
                name: currency.name,
                symbol: currency.symbol
            };
        });

        res.json({
            success: true,
            data: symbols
        });
    } catch (error) {
        console.error('[Currency Routes] Get symbols error:', error);
        res.status(500).json({
            error: 'Failed to fetch currency symbols'
        });
    }
});

/**
 * @route   GET /api/currency/realtime/:from/:to
 * @desc    Get real-time exchange rate with caching
 * @access  Private
 * Issue #521: Advanced Multi-Currency Intelligence
 */
router.get('/realtime/:from/:to', auth, async (req, res) => {
    try {
        const { from, to } = req.params;

        if (!currencyService.isValidCurrency(from) || !currencyService.isValidCurrency(to)) {
            return res.status(400).json({
                error: 'Invalid currency code(s)'
            });
        }

        const rateData = await forexService.getRealTimeRate(from.toUpperCase(), to.toUpperCase());

        res.json({
            success: true,
            data: rateData
        });
    } catch (error) {
        console.error('[Currency Routes] Real-time rate error:', error);
        res.status(500).json({
            error: 'Failed to fetch real-time rate'
        });
    }
});

/**
 * @route   POST /api/currency/batch-convert
 * @desc    Batch convert multiple amounts
 * @access  Private
 */
router.post('/batch-convert', auth, async (req, res) => {
    try {
        const { conversions } = req.body;

        if (!Array.isArray(conversions) || conversions.length === 0) {
            return res.status(400).json({
                error: 'Conversions array is required'
            });
        }

        const result = await forexService.batchConvert(conversions);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('[Currency Routes] Batch convert error:', error);
        res.status(500).json({
            error: 'Failed to batch convert'
        });
    }
});

/**
 * @route   GET /api/currency/portfolio-pl
 * @desc    Get unrealized P&L for multi-currency portfolio
 * @access  Private
 */
router.get('/portfolio-pl', auth, async (req, res) => {
    try {
        const { baseCurrency = 'USD' } = req.query;
        const plData = await revaluationService.calculateCurrentUnrealizedPL(req.user._id, baseCurrency);

        res.json({
            success: true,
            data: plData
        });
    } catch (error) {
        console.error('[Currency Routes] Portfolio P&L error:', error);
        res.status(500).json({
            error: 'Failed to calculate P&L'
        });
    }
});

/**
 * @route   GET /api/currency/exposure
 * @desc    Get currency exposure breakdown
 * @access  Private
 */
router.get('/exposure', auth, async (req, res) => {
    try {
        const { baseCurrency = 'USD' } = req.query;
        const exposure = await revaluationService.getCurrencyExposure(req.user._id, baseCurrency);

        res.json({
            success: true,
            data: exposure
        });
    } catch (error) {
        console.error('[Currency Routes] Currency exposure error:', error);
        res.status(500).json({
            error: 'Failed to calculate currency exposure'
        });
    }
});

/**
 * @route   GET /api/currency/revaluation-report
 * @desc    Get historical revaluation report
 * @access  Private
 */
router.get('/revaluation-report', auth, async (req, res) => {
    try {
        const { baseCurrency = 'USD', startDate, endDate } = req.query;

        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;

        const report = await revaluationService.generateRevaluationReport(
            req.user._id,
            baseCurrency,
            start,
            end
        );

        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        console.error('[Currency Routes] Revaluation report error:', error);
        res.status(500).json({
            error: 'Failed to generate revaluation report'
        });
    }
});

/**
 * @route   GET /api/currency/risk-assessment
 * @desc    Get currency risk assessment
 * @access  Private
 */
router.get('/risk-assessment', auth, async (req, res) => {
    try {
        const { baseCurrency = 'USD' } = req.query;
        const assessment = await revaluationService.generateRiskAssessment(req.user._id, baseCurrency);

        res.json({
            success: true,
            data: assessment
        });
    } catch (error) {
        console.error('[Currency Routes] Risk assessment error:', error);
        res.status(500).json({
            error: 'Failed to generate risk assessment'
        });
    }
});

/**
 * @route   GET /api/currency/strength/:currency
 * @desc    Get currency strength index
 * @access  Private
 */
router.get('/strength/:currency', auth, async (req, res) => {
    try {
        const { currency } = req.params;

        if (!currencyService.isValidCurrency(currency)) {
            return res.status(400).json({
                error: 'Invalid currency code'
            });
        }

        const strengthIndex = await forexService.getCurrencyStrengthIndex(currency.toUpperCase());

        res.json({
            success: true,
            data: strengthIndex
        });
    } catch (error) {
        console.error('[Currency Routes] Currency strength error:', error);
        res.status(500).json({
            error: 'Failed to calculate currency strength'
        });
    }
});

/**
 * @route   DELETE /api/currency/cache
 * @desc    Clear currency rate cache
 * @access  Private
 */
router.delete('/cache', auth, async (req, res) => {
    try {
        const result = forexService.clearCache();

        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        console.error('[Currency Routes] Clear cache error:', error);
        res.status(500).json({
            error: 'Failed to clear cache'
        });
    }
});

/**
 * @route   GET /api/currency/cache-stats
 * @desc    Get cache statistics
 * @access  Private
 */
router.get('/cache-stats', auth, async (req, res) => {
    try {
        const stats = forexService.getCacheStats();

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('[Currency Routes] Cache stats error:', error);
        res.status(500).json({
            error: 'Failed to get cache stats'
        });
    }
});

module.exports = router;
