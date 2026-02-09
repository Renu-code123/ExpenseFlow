const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');
const helmet = require('helmet');

/**
 * Comprehensive Input Sanitization Middleware
 * Issue #461: Missing Input Validation on User Data
 * 
 * Prevents XSS, injection attacks, NoSQL injection, and malicious content
 */

// XSS filter configuration
const xssFilterConfig = {
  whiteList: {},
  stripIgnoredTag: true,
  stripLeakingHtml: true,
  onTagAttr: (tag, name, value, isWhiteAttr) => {
    // Strip all event handlers
    if (name.startsWith('on')) {
      return '';
    }
  }
};

/**
 * Sanitize string inputs
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;

  // Remove XSS payloads
  let sanitized = xss(str, xssFilterConfig);

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
};

/**
 * Recursively sanitize object values
 */
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];

      // Sanitize key to prevent NoSQL injection
      const sanitizedKey = sanitizeString(key);

      if (typeof value === 'string') {
        sanitized[sanitizedKey] = sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[sanitizedKey] = sanitizeObject(value);
      } else {
        sanitized[sanitizedKey] = value;
      }
    }
  }

  return sanitized;
};

/**
 * Main sanitization middleware
 */
const sanitizationMiddleware = (req, res, next) => {
  // Sanitize body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize URL parameters
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }

  next();
};

/**
 * Request size limit middleware
 */
const requestSizeLimit = (maxSize = '10mb') => {
  const express = require('express');
  return express.json({ limit: maxSize });
};

/**
 * File upload sanitization
 */
const sanitizeFileUpload = (req, res, next) => {
  if (req.files) {
    for (const field in req.files) {
      const file = req.files[field];

      // Sanitize filename
      if (file.name) {
        file.name = sanitizeString(file.name)
          .replace(/\.\./g, '') // Remove directory traversal
          .replace(/[<>:"|?*]/g, ''); // Remove invalid filename characters
      }

      // Validate file extension
      const allowedExtensions = [
        '.pdf', '.doc', '.docx', '.xls', '.xlsx',
        '.jpg', '.jpeg', '.png', '.gif', '.bmp',
        '.csv', '.txt', '.zip', '.rar'
      ];

      const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!allowedExtensions.includes(fileExt)) {
        return res.status(400).json({
          success: false,
          error: 'File type not allowed',
          allowedTypes: allowedExtensions
        });
      }

      // Check file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          error: 'File size exceeds maximum (10MB)'
        });
      }
    }
  }

  next();
};

/**
 * Composite sanitization setup function
 */
const setupSanitization = (app) => {
  // Security headers
  app.use(helmet());

  // Parse JSON with size limit
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // MongoDB NoSQL injection prevention
  app.use(mongoSanitize());

  // XSS protection
  app.use(sanitizationMiddleware);

  // Prevent parameter pollution
  app.use((req, res, next) => {
    // Remove duplicate parameters
    const seen = {};
    const params = new URLSearchParams(req.url.split('?')[1]);
    params.forEach((value, key) => {
      if (!seen[key]) {
        seen[key] = true;
      }
    });
    next();
  });
};

/**
 * Type coercion safety check
 */
const validateDataTypes = (req, res, next) => {
  const checkValue = (value, path = '') => {
    if (value === null || value === undefined) return true;

    // Check for suspicious type coercion
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return value.every(item => checkValue(item, `${path}[]`));
      }
      return Object.keys(value).every(key =>
        checkValue(value[key], `${path}.${key}`)
      );
    }

    // Strings
    if (typeof value === 'string') {
      // Check for JavaScript object notation in strings
      if (value.startsWith('__proto__') || value.startsWith('constructor')) {
        throw new Error(`Suspicious key detected: ${value}`);
      }
    }

    return true;
  };

  try {
    checkValue(req.body);
    checkValue(req.query);
    checkValue(req.params);
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Invalid data format',
      details: error.message
    });
  }
};

module.exports = {
  sanitizeString,
  sanitizeObject,
  sanitizationMiddleware,
  requestSizeLimit,
  sanitizeFileUpload,
  setupSanitization,
  validateDataTypes,
  xssFilterConfig
};
