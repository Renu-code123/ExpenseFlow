// config.js
// Configuration management for gateway
module.exports = {
  jwtSecret: 'supersecretkey',
  rateLimit: 100,
  windowSize: 60000,
  serviceMap: {
    '/api/serviceA': 'http://localhost:5001',
    '/api/serviceB': 'http://localhost:5002'
  }
};
