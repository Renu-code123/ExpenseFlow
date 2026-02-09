const express = require('express');
const auth = require('../middleware/auth');
const securityMonitor = require('../services/securityMonitor');
const router = express.Router();

// Admin middleware (simplified - in production, use proper role-based auth)
const adminAuth = async (req, res, next) => {
  if (!req.user || req.user.email !== process.env.ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Get security statistics
router.get('/stats', auth, adminAuth, async (req, res) => {
  try {
    const { timeframe = 24 } = req.query;
    const stats = await securityMonitor.getSecurityStats(parseInt(timeframe));
    
    if (!stats) {
      return res.status(500).json({ error: 'Failed to fetch security statistics' });
    }
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recent security logs
router.get('/logs', auth, adminAuth, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const logs = await securityMonitor.getRecentLogs(parseInt(limit));
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get blocked IPs
router.get('/blocked-ips', auth, adminAuth, (req, res) => {
  try {
    const blockedIPs = Array.from(securityMonitor.blockedIPs);
    res.json({ blockedIPs, count: blockedIPs.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unblock IP
router.post('/unblock-ip', auth, adminAuth, (req, res) => {
  try {
    const { ip } = req.body;
    
    if (!ip) {
      return res.status(400).json({ error: 'IP address is required' });
    }
    
    securityMonitor.unblockIP(ip);
    
    // Log the unblock action
    securityMonitor.logSecurityEvent(req, 'admin_action', {
      action: 'unblock_ip',
      targetIP: ip,
      adminUser: req.user.email
    });
    
    res.json({ message: `IP ${ip} has been unblocked` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Security health check
router.get('/health', auth, adminAuth, (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      security: {
        rateLimitingActive: true,
        inputSanitizationActive: true,
        securityHeadersActive: true,
        ipBlockingActive: true,
        blockedIPsCount: securityMonitor.blockedIPs.size
      },
      server: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version
      }
    };
    
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;