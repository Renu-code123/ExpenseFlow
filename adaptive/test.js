// Test suite for Adaptive Rate Limiting
const rateLimiter = require('./rate-limiter');

function simulateRequests(userId, endpoint, count) {
    for (let i = 0; i < count; i++) {
        rateLimiter.recordRequest(userId, endpoint, 'success');
    }
    return rateLimiter.isAllowed(userId);
}

function runTests() {
    console.log('Test: Low risk user should have high quota');
    simulateRequests('user1', '/gdpr', 10);
    console.log('Limit:', rateLimiter.getUserLimit('user1'));
    console.log('Risk:', rateLimiter.getUserRiskScore('user1'));

    console.log('Test: High risk user should have low quota');
    for (let i = 0; i < 2000; i++) {
        rateLimiter.recordRequest('user2', '/pci-dss', 'success');
    }
    console.log('Limit:', rateLimiter.getUserLimit('user2'));
    console.log('Risk:', rateLimiter.getUserRiskScore('user2'));

    console.log('Test: Rate limiting enforcement');
    let allowed = simulateRequests('user2', '/pci-dss', 100);
    console.log('Allowed after 100 more:', allowed);

    console.log('Test: Logging output');
    console.log(rateLimiter.getLogs().slice(-5));
}

runTests();
