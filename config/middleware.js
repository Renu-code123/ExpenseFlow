/**
 * Middleware Configuration
 * Extracts all middleware setup from server.js into a separate file
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { generalLimiter, authLimiter, expenseLimiter, uploadLimiter } = require('../middleware/rateLimiter');
const { sanitizeInput, mongoSanitizeMiddleware } = require('../middleware/sanitization');
const securityMonitor = require('../services/securityMonitor');
const config = require('./index');

/**
 * Configure all application middleware
 * @param {Express.Application} app - Express application instance
 */
function configureMiddleware(app) {
  // Security headers (Helmet)
  app.use(helmet(config.security.helmet));

  // CORS configuration
  app.use(cors({
    origin: function (origin, callback) {
      const allowedOrigins = config.cors.allowedOrigins;

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: config.cors.credentials,
    methods: config.cors.methods,
    allowedHeaders: config.cors.allowedHeaders
  }));

  // Rate limiting
  app.use(generalLimiter);

  // Input sanitization
  app.use(mongoSanitizeMiddleware);
  app.use(sanitizeInput);

  // Security monitoring - block suspicious IPs
  app.use(securityMonitor.blockSuspiciousIPs());

  // Body parsing middleware
  app.use(express.json(config.bodyParser.json));
  app.use(express.urlencoded(config.bodyParser.urlencoded));

  // Static files
  config.static.paths.forEach(path => {
    app.use(express.static(path));
  });

  // Security logging middleware
  app.use((req, res, next) => {
    const originalSend = res.send;
    res.send = function (data) {
      // Log failed requests
      if (res.statusCode >= 400) {
        securityMonitor.logSecurityEvent(req, 'suspicious_activity', {
          statusCode: res.statusCode,
          response: typeof data === 'string' ? data.substring(0, 200) : 'Non-string response'
        });
      }
      originalSend.call(this, data);
    };
    next();
  });
}

module.exports = {
  configureMiddleware,
  // Export rate limiters for route usage
  authLimiter,
  expenseLimiter,
  uploadLimiter
};
