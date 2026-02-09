const express = require('express');
const Integration = require('../models/Integration');
const integrationService = require('../services/integrationService');
const webhookService = require('../services/webhookService');
const auth = require('../middleware/auth');
const router = express.Router();

// Get user integrations
router.get('/', auth, async (req, res) => {
  try {
    const integrations = await Integration.find({ user: req.user._id });
    res.json(integrations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Connect QuickBooks
router.post('/quickbooks', auth, async (req, res) => {
  try {
    const { authCode } = req.body;
    const integration = await integrationService.connectQuickBooks(req.user._id, authCode);
    res.status(201).json(integration);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Connect Stripe
router.post('/stripe', auth, async (req, res) => {
  try {
    const { apiKey } = req.body;
    const integration = await integrationService.connectStripe(req.user._id, apiKey);
    res.status(201).json(integration);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sync bank transactions
router.post('/sync/bank', auth, async (req, res) => {
  try {
    await integrationService.syncBankTransactions(req.user._id);
    res.json({ message: 'Bank sync completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export to QuickBooks
router.post('/export/quickbooks', auth, async (req, res) => {
  try {
    const { expenses } = req.body;
    const result = await integrationService.exportToQuickBooks(req.user._id, expenses);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create webhook
router.post('/webhooks', auth, async (req, res) => {
  try {
    const { url, events, secret } = req.body;
    const webhook = await webhookService.createWebhook(req.user._id, url, events, secret);
    res.status(201).json(webhook);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;