// Configuration for Adaptive Rate Limiting
module.exports = {
    defaultLimit: 1000,
    alertRiskThreshold: 100,
    logFile: 'rate-limit.log',
    dashboardPort: 4001
};
