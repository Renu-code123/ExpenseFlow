const ResponseFactory = require('../utils/responseFactory');
const logger = require('../utils/structuredLogger');

/**
 * ThreatIntelGuard Middleware
 * Issue #907: Ingesting global fraud-patterns to update local risk scores.
 * Intercepts requests to check against real-time blacklists and known adversarial patterns.
 */
const threatIntelGuard = async (req, res, next) => {
    const actorIp = req.ip;
    const userAgent = req.headers['user-agent'];

    // Mock check against global threat intelligence
    const isKnownThreat = await mockThreatIntelligenceCheck(actorIp, userAgent);

    if (isKnownThreat) {
        logger.warn(`[ThreatIntelGuard] Blocked request from known malicious IP: ${actorIp}`);
        return ResponseFactory.error(res, 403, 'ACCESS_DENIED: Request originates from a high-risk entity flagged by global threat intelligence.');
    }

    // Injects a 'threatScore' into the request context for downstream services
    req.threatScore = calculateInitialThreatScore(req);

    next();
};

async function mockThreatIntelligenceCheck(ip, ua) {
    // In a real system, this would query a Redis cache or external API (e.g., AbuseIPDB, Cloudflare)
    const blacklistedIps = ['1.2.3.4', '6.6.6.6'];
    return blacklistedIps.includes(ip);
}

function calculateInitialThreatScore(req) {
    let score = 0;
    if (req.headers['x-forwarded-for']) score += 20; // Proxy usage
    if (req.method === 'POST' && req.originalUrl.includes('/expensive')) score += 10;
    return score;
}

module.exports = threatIntelGuard;
