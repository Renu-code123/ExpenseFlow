class SecurityMonitor {
  constructor() {
    this.blockedIPs = new Set();
    this.suspiciousActivity = new Map();
    // Whitelist localhost IPs for development
    this.localhostIPs = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);
  }

  isLocalhost(ip) {
    return this.localhostIPs.has(ip);
  }

  blockSuspiciousIPs() {
    return (req, res, next) => {
      const clientIP = req.ip || req.connection.remoteAddress;
      
      // Skip blocking for localhost during development
      if (this.isLocalhost(clientIP)) {
        return next();
      }
      
      if (this.blockedIPs.has(clientIP)) {
        return res.status(403).json({ error: 'IP blocked due to suspicious activity' });
      }
      
      next();
    };
  }

  logSecurityEvent(req, type, data) {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    // Skip logging for localhost during development
    if (this.isLocalhost(clientIP)) {
      return;
    }
    const event = {
      timestamp: new Date(),
      ip: clientIP,
      type,
      data,
      userAgent: req.get('User-Agent')
    };
    
    console.log('Security Event:', JSON.stringify(event));
    
    // Track suspicious activity
    const activityCount = this.suspiciousActivity.get(clientIP) || 0;
    this.suspiciousActivity.set(clientIP, activityCount + 1);
    
    // Block IP after 5 suspicious events
    if (activityCount >= 5) {
      this.blockedIPs.add(clientIP);
      console.log(`IP ${clientIP} blocked due to repeated suspicious activity`);
    }
  }
}

module.exports = new SecurityMonitor();