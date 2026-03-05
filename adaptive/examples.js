// Example usage scenarios for Adaptive Rate Limiting
const rateLimiter = require('./rate-limiter');

function simulateScenario(userId, endpoint, actions) {
    actions.forEach(action => {
        rateLimiter.recordRequest(userId, endpoint, action.status);
        const allowed = rateLimiter.isAllowed(userId);
        console.log(`User: ${userId}, Endpoint: ${endpoint}, Status: ${action.status}, Allowed: ${allowed}, Limit: ${rateLimiter.getUserLimit(userId)}, Risk: ${rateLimiter.getUserRiskScore(userId)}`);
    });
}

// Scenario 1: Normal user
simulateScenario('normalUser', '/gdpr', Array(20).fill({ status: 'success' }));

// Scenario 2: Abusive user
simulateScenario('abuser', '/pci-dss', Array(1200).fill({ status: 'success' }));

// Scenario 3: User with failed logins
simulateScenario('suspiciousUser', '/sox', Array(10).fill({ status: 'fail' }));
