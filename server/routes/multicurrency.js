const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { body, query, validationResult } = require('express-validator');
const currencyService = require('../services/currencyService');
const internationalizationService = require('../services/internationalizationService');
const taxService = require('../services/taxService');
const MultiCurrencyWallet = require('../models/MultiCurrencyWallet');

// Get supported currencies
router.get('/currencies', async (req, res) => {
  try {
    const currencies = await currencyService.getSupportedCurrencies();
    res.json({
      success: true,
      data: currencies
    });
  } catch (error) {
    console.error('Get currencies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get currencies'
    });
  }
});

// Convert currency
router.post('/convert', auth, [
  body('amount').isNumeric().isFloat({ min: 0.01 }),
  body('fromCurrency').isString().isLength({ min: 3, max: 3 }),
  body('toCurrency').isString().isLength({ min: 3, max: 3 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { amount, fromCurrency, toCurrency } = req.body;
    
    const conversion = await currencyService.convertCurrency(
      amount, 
      fromCurrency.toUpperCase(), 
      toCurrency.toUpperCase()
    );

    res.json({
      success: true,
      data: conversion
    });
  } catch (error) {
    console.error('Currency conversion error:', error);
    res.status(500).json({
      success: false,
      message: 'Currency conversion failed'
    });
  }
});

// Get exchange rates
router.get('/rates/:baseCurrency', [
  query('currencies').optional().isString()
], async (req, res) => {
  try {
    const { baseCurrency } = req.params;
    const targetCurrencies = req.query.currencies ? 
      req.query.currencies.split(',') : 
      ['USD', 'EUR', 'GBP', 'JPY', 'INR'];

    const rates = {};
    
    for (const currency of targetCurrencies) {
      try {
        rates[currency] = await currencyService.getExchangeRate(
          baseCurrency.toUpperCase(), 
          currency.toUpperCase()
        );
      } catch (error) {
        rates[currency] = null;
      }
    }

    res.json({
      success: true,
      data: {
        baseCurrency: baseCurrency.toUpperCase(),
        rates,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Get exchange rates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get exchange rates'
    });
  }
});

// Get currency trends
router.get('/trends/:currency', auth, [
  query('days').optional().isInt({ min: 1, max: 365 })
], async (req, res) => {
  try {
    const { currency } = req.params;
    const days = parseInt(req.query.days) || 30;

    const trends = await currencyService.getCurrencyTrends(
      currency.toUpperCase(), 
      days
    );

    res.json({
      success: true,
      data: trends
    });
  } catch (error) {
    console.error('Currency trends error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get currency trends'
    });
  }
});

// Create multi-currency wallet
router.post('/wallets', auth, [
  body('name').notEmpty().isString().trim().isLength({ max: 50 }),
  body('primaryCurrency').isString().isLength({ min: 3, max: 3 }),
  body('bankDetails').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, primaryCurrency, bankDetails } = req.body;

    if (!currencyService.isValidCurrency(primaryCurrency)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid currency code'
      });
    }

    const wallet = await MultiCurrencyWallet.create({
      userId: req.user.id,
      name,
      primaryCurrency: primaryCurrency.toUpperCase(),
      bankDetails,
      balances: [{
        currency: primaryCurrency.toUpperCase(),
        amount: 0
      }]
    });

    res.status(201).json({
      success: true,
      data: wallet
    });
  } catch (error) {
    console.error('Create wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create wallet'
    });
  }
});

// Get user wallets
router.get('/wallets', auth, async (req, res) => {
  try {
    const wallets = await MultiCurrencyWallet.find({ userId: req.user.id });

    res.json({
      success: true,
      data: wallets
    });
  } catch (error) {
    console.error('Get wallets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get wallets'
    });
  }
});

// Update wallet balance
router.put('/wallets/:walletId/balance', auth, [
  body('currency').isString().isLength({ min: 3, max: 3 }),
  body('amount').isNumeric()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currency, amount } = req.body;
    const wallet = await MultiCurrencyWallet.findOne({
      _id: req.params.walletId,
      userId: req.user.id
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    const currencyUpper = currency.toUpperCase();
    const existingBalance = wallet.balances.find(b => b.currency === currencyUpper);

    if (existingBalance) {
      existingBalance.amount = amount;
      existingBalance.lastUpdated = new Date();
    } else {
      wallet.balances.push({
        currency: currencyUpper,
        amount,
        lastUpdated: new Date()
      });
    }

    await wallet.save();

    res.json({
      success: true,
      data: wallet
    });
  } catch (error) {
    console.error('Update wallet balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update wallet balance'
    });
  }
});

// Get hedging recommendations
router.get('/hedging/recommendations', auth, async (req, res) => {
  try {
    const wallets = await MultiCurrencyWallet.find({ userId: req.user.id });
    
    const exposures = [];
    wallets.forEach(wallet => {
      wallet.balances.forEach(balance => {
        if (balance.currency !== wallet.primaryCurrency && balance.amount > 0) {
          exposures.push({
            currency: balance.currency,
            amount: balance.amount,
            walletName: wallet.name
          });
        }
      });
    });

    const recommendations = await currencyService.getHedgingRecommendations(
      req.user.id, 
      exposures
    );

    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    console.error('Hedging recommendations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get hedging recommendations'
    });
  }
});

// Get supported languages
router.get('/languages', async (req, res) => {
  try {
    const languages = internationalizationService.getSupportedLanguages();

    res.json({
      success: true,
      data: languages
    });
  } catch (error) {
    console.error('Get languages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get languages'
    });
  }
});

// Get regional settings
router.get('/regional/:country', async (req, res) => {
  try {
    const { country } = req.params;
    const settings = internationalizationService.getRegionalSettings(country.toUpperCase());

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get regional settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get regional settings'
    });
  }
});

// Calculate tax
router.post('/tax/calculate', auth, [
  body('amount').isNumeric().isFloat({ min: 0.01 }),
  body('category').isString().notEmpty(),
  body('country').isString().isLength({ min: 2, max: 2 }),
  body('region').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { amount, category, country, region } = req.body;
    
    const taxCalculation = await taxService.calculateTax(
      amount, 
      category, 
      country.toUpperCase(), 
      region
    );

    res.json({
      success: true,
      data: taxCalculation
    });
  } catch (error) {
    console.error('Tax calculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Tax calculation failed'
    });
  }
});

// Get tax report
router.get('/tax/report/:country/:year', auth, async (req, res) => {
  try {
    const { country, year } = req.params;
    const fiscalYear = parseInt(year);

    if (isNaN(fiscalYear) || fiscalYear < 2000 || fiscalYear > new Date().getFullYear()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid fiscal year'
      });
    }

    const report = await taxService.generateTaxReport(
      req.user.id, 
      country.toUpperCase(), 
      fiscalYear
    );

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Tax report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate tax report'
    });
  }
});

// Get supported countries for tax
router.get('/tax/countries', async (req, res) => {
  try {
    const countries = taxService.getSupportedCountries();

    res.json({
      success: true,
      data: countries
    });
  } catch (error) {
    console.error('Get tax countries error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get supported countries'
    });
  }
});

module.exports = router;