const express = require('express');
const router = express.Router();
const accountingService = require('../services/accountingService');
const auth = require('../middleware/auth');
const {requireAuth,getUserId}=require('../middleware/clerkAuth');

// Get auth URL for platform
router.get('/auth/:platform', requireAuth, async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user.id;

    let authUrl;
    if (platform === 'quickbooks') {
      authUrl = await accountingService.getQuickBooksAuthUrl(userId);
    } else if (platform === 'xero') {
      authUrl = await accountingService.getXeroAuthUrl(userId);
    } else {
      return res.status(400).json({ error: 'Unsupported platform' });
    }

    res.json({ authUrl });
  } catch (error) {
    console.error('Auth URL error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Handle OAuth callback
router.get('/callback/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const { code, state } = req.query;

    let connection;
    if (platform === 'quickbooks') {
      connection = await accountingService.handleQuickBooksCallback(code, state);
    } else if (platform === 'xero') {
      connection = await accountingService.handleXeroCallback(code, state);
    } else {
      return res.status(400).json({ error: 'Unsupported platform' });
    }

    // Redirect to frontend with success
    res.redirect(`${process.env.FRONTEND_URL}/settings/accounting?connected=${platform}`);
  } catch (error) {
    console.error('Callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/settings/accounting?error=${encodeURIComponent(error.message)}`);
  }
});

// Get user's connected platforms
router.get('/connections', requireAuth, async (req, res) => {
  try {
    const connections = await accountingService.getUserConnections(req.user.id);
    res.json(connections);
  } catch (error) {
    console.error('Get connections error:', error);
    res.status(500).json({ error: 'Failed to get connections' });
  }
});

// Sync expenses to platform
router.post('/sync/:platform', requireAuth, async (req, res) => {
  try {
    const { platform } = req.params;
    const result = await accountingService.syncExpensesToAccounting(req.user.id, platform);
    res.json(result);
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Disconnect platform
router.delete('/disconnect/:platform', requireAuth, async (req, res) => {
  try {
    const { platform } = req.params;
    await accountingService.disconnectPlatform(req.user.id, platform);
    res.json({ message: 'Disconnected successfully' });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

module.exports = router;