const rateLimit = require('express-rate-limit');

/**
 * Enhanced Rate Limiting Middleware
 * Issue #460: Rate Limiting for Critical Endpoints
 * 
 * Provides protection against brute-force attacks, DoS, and API abuse
 * on sensitive endpoints (auth, payments, invoices, exports)
 */

// Optional: Use Redis for distributed rate limiting
let redisClient = null;
let RedisStore = null;

try {
  // Try to load Redis modules only if they are installed
  RedisStore = require('rate-limit-redis');
  const redis = require('redis');
  
  redisClient = redis.createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    db: process.env.REDIS_DB || 0
  });
  redisClient.on('error', (err) => {
    console.warn('Redis not available, using in-memory store:', err.message);
    redisClient = null;
  });
} catch (error) {
  console.warn('Redis modules not installed, using in-memory store. To enable Redis, install: npm install redis rate-limit-redis');
  redisClient = null;
  RedisStore = null;
}

/**
 * Helper function to create rate limiters with Redis support
 */
const createRateLimiter = (options) => {
  const config = {
    windowMs: options.windowMs,
    max: options.max,
    message: options.message || 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for localhost during development
    skip: (req) => {
      const ip = req.ip || req.connection?.remoteAddress;
      const localhostIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];
      return localhostIPs.includes(ip);
    },
    handler: (req, res, next, options) => {
      res.status(429).json({
        success: false,
        error: options.message,
        retryAfter: req.rateLimit.resetTime
      });
    },
    ...options
  };

  // Use Redis store if available, otherwise use memory store
  if (redisClient && RedisStore && options.useRedis !== false) {
    config.store = new RedisStore({
      client: redisClient,
      prefix: options.prefix || 'rate-limit:'
    });
  }

  return rateLimit(config);
};

// ==================== AUTHENTICATION ENDPOINTS ====================

/**
 * Ultra-strict rate limit for login attempts
 * Prevents brute-force password attacks
 */
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 attempts per 15 minutes
  message: 'Too many login attempts. Please try again in 15 minutes.',
  skipSuccessfulRequests: true, // Only count failed attempts
  prefix: 'login-limit:',
  keyGenerator: (req, res) => {
    // Limit by combination of IP and email for more granular control
    return `${req.ip}-${req.body?.email || 'unknown'}`;
  }
});

/**
 * Strict rate limit for registration
 * Prevents account enumeration and spam
 */
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Max 3 registrations per hour per IP
  message: 'Too many registration attempts. Please try again in 1 hour.',
  prefix: 'register-limit:',
  skipSuccessfulRequests: false
});

/**
 * Rate limit for password reset requests
 * Prevents email bombing and enumeration
 */
const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Max 3 password reset requests per hour
  message: 'Too many password reset attempts. Please try again in 1 hour.',
  prefix: 'password-reset-limit:',
  keyGenerator: (req, res) => {
    // Limit by email to prevent enumeration
    return req.body?.email || req.ip;
  }
});

/**
 * Rate limit for email verification
 * Prevents verification code brute-force
 */
const emailVerifyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 verification attempts per 15 minutes
  message: 'Too many verification attempts. Please try again in 15 minutes.',
  prefix: 'email-verify-limit:',
  skipSuccessfulRequests: true
});

/**
 * Rate limit for 2FA token verification
 * Prevents TOTP code brute-force
 */
const totpVerifyLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Max 5 attempts per 10 minutes
  message: 'Too many 2FA attempts. Please try again in 10 minutes.',
  prefix: 'totp-verify-limit:',
  skipSuccessfulRequests: true
});

// ==================== PAYMENT & FINANCIAL ENDPOINTS ====================

/**
 * Strict rate limit for payment creation
 * Prevents accidental or malicious duplicate charges
 */
const paymentLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Max 5 payments per minute
  message: 'Too many payment requests. Please wait before attempting another payment.',
  prefix: 'payment-limit:',
  skipSuccessfulRequests: false
});

/**
 * Rate limit for invoice creation
 * Prevents invoice spam and bulk creation abuse
 */
const invoiceLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 invoices per minute
  message: 'Too many invoice requests. Please slow down.',
  prefix: 'invoice-limit:',
  skipSuccessfulRequests: false
});

/**
 * Rate limit for invoice payments
 * Prevents payment manipulation
 */
const invoicePaymentLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 payment records per minute
  message: 'Too many payment records. Please wait.',
  prefix: 'invoice-payment-limit:',
  skipSuccessfulRequests: false
});

/**
 * Rate limit for expense exports
 * Prevents data exfiltration and resource exhaustion
 */
const exportLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 exports per hour
  message: 'Too many export requests. Please try again in 1 hour.',
  prefix: 'export-limit:',
  skipSuccessfulRequests: false
});

/**
 * Rate limit for report generation
 * Prevents heavy computations and DoS
 */
const reportLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Max 5 reports per hour
  message: 'Too many report generation requests. Please try again in 1 hour.',
  prefix: 'report-limit:',
  skipSuccessfulRequests: false
});

// ==================== FILE & UPLOAD ENDPOINTS ====================

/**
 * Rate limit for file uploads (receipts, documents)
 * Prevents storage exhaustion
 */
const fileUploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Max 20 file uploads per hour
  message: 'Too many file uploads. Please try again in 1 hour.',
  prefix: 'upload-limit:',
  skipSuccessfulRequests: false
});

/**
 * Rate limit for bulk operations (import, batch updates)
 * Prevents database overload
 */
const bulkOperationLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 15, // Max 5 bulk operations per minute
  message: 'Too many bulk operations. Please wait.',
  prefix: 'bulk-op-limit:',
  skipSuccessfulRequests: false
});

// ==================== DATA MODIFICATION ENDPOINTS ====================

/**
 * Rate limit for expense operations
 * Prevents rapid-fire data manipulation
 */
const expenseLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Max 30 expense operations per minute
  message: 'Too many expense operations. Please slow down.',
  prefix: 'expense-limit:',
  skipSuccessfulRequests: false
});

/**
 * Rate limit for budget operations
 * Prevents budget spam
 */
const budgetLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Max 20 budget operations per minute
  message: 'Too many budget operations. Please slow down.',
  prefix: 'budget-limit:',
  skipSuccessfulRequests: false
});

/**
 * Rate limit for goal operations
 * Prevents goal manipulation
 */
const goalLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Max 20 goal operations per minute
  message: 'Too many goal operations. Please slow down.',
  prefix: 'goal-limit:',
  skipSuccessfulRequests: false
});

/**
 * Rate limit for group operations
 * Prevents group spam and manipulation
 */
const groupLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 15, // Max 15 group operations per minute
  message: 'Too many group operations. Please slow down.',
  prefix: 'group-limit:',
  skipSuccessfulRequests: false
});

// ==================== GENERAL API ENDPOINTS ====================

/**
 * General API rate limit
 * Fallback limit for all other endpoints
 */
const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per 15 minutes
  message: 'Too many requests. Please try again later.',
  prefix: 'general-limit:',
  skipSuccessfulRequests: false
});

/**
 * Search and list operations rate limit
 * Prevents excessive database queries
 */
const searchLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Max 30 search operations per minute
  message: 'Too many search requests. Please slow down.',
  prefix: 'search-limit:',
  skipSuccessfulRequests: false
});

/**
 * Analytics and insights operations
 * Prevents computational DoS
 */
const analyticsLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 analytics requests per minute
  message: 'Too many analytics requests. Please slow down.',
  prefix: 'analytics-limit:',
  skipSuccessfulRequests: false
});

// ==================== ADMIN/SENSITIVE OPERATIONS ====================

/**
 * Rate limit for account deletion
 * Prevents accidental or malicious account deletion
 */
const deleteAccountLimiter = createRateLimiter({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 1, // Max 1 deletion per 24 hours
  message: 'Account deletion is limited to once per 24 hours.',
  prefix: 'delete-account-limit:',
  skipSuccessfulRequests: false
});

/**
 * Rate limit for API key generation
 * Prevents excessive API key creation
 */
const apiKeyLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Max 5 API keys per hour
  message: 'Too many API key creation attempts. Please try again in 1 hour.',
  prefix: 'apikey-limit:',
  skipSuccessfulRequests: false
});

/**
 * Rate limit for security-related changes
 * Prevents unauthorized modifications
 */
const securitySettingsLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // Max 3 security changes per minute
  message: 'Too many security changes. Please wait before making additional changes.',
  prefix: 'security-settings-limit:',
  skipSuccessfulRequests: false
});

// ==================== CUSTOM KEY GENERATORS ====================

/**
 * Get user ID from request for authenticated endpoints
 */
const getUserId = (req) => {
  return req.user?.id || req.user?._id || req.ip;
};

/**
 * Create user-based rate limiter for authenticated endpoints
 * Applies per-user limits instead of per-IP
 */
const createUserRateLimiter = (options) => {
  return createRateLimiter({
    ...options,
    keyGenerator: (req, res) => {
      return getUserId(req);
    }
  });
};

/**
 * User-specific auth limiter
 * Prevents brute-force per user account
 */
const userLoginLimiter = createUserRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 failed attempts per user
  message: 'Too many login attempts for this account. Please try again in 15 minutes.',
  prefix: 'user-login-limit:',
  skipSuccessfulRequests: true
});

/**
 * User-specific expense creation limiter
 */
const userExpenseLimiter = createUserRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Max 30 per minute per user
  message: 'You are creating expenses too quickly. Please slow down.',
  prefix: 'user-expense-limit:',
  skipSuccessfulRequests: false
});

/**
 * User-specific payment limiter
 */
const userPaymentLimiter = createUserRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Max 5 per minute per user
  message: 'Too many payment attempts. Please wait.',
  prefix: 'user-payment-limit:',
  skipSuccessfulRequests: false
});

/**
 * Rate limit for 2FA setup initiation
 * Prevents 2FA setup spam
 */
const twoFactorLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Max 5 setup attempts per hour
  message: 'Too many 2FA setup attempts. Please try again in 1 hour.',
  prefix: '2fa-setup-limit:',
  skipSuccessfulRequests: true
});

/**
 * Rate limit for 2FA code verification
 * Prevents brute-force attacks on 2FA codes
 */
const verifyCodeLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Max 5 verification attempts per 10 minutes
  message: 'Too many verification attempts. Please try again in 10 minutes.',
  prefix: '2fa-verify-limit:',
  skipSuccessfulRequests: true
});

// ==================== EXPORTS ====================

module.exports = {
  // Authentication limiters
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  emailVerifyLimiter,
  totpVerifyLimiter,
  twoFactorLimiter,
  verifyCodeLimiter,
  
  // Payment & Financial limiters
  paymentLimiter,
  invoiceLimiter,
  invoicePaymentLimiter,
  exportLimiter,
  reportLimiter,
  
  // File & Upload limiters
  fileUploadLimiter,
  bulkOperationLimiter,
  
  // Data modification limiters
  expenseLimiter,
  budgetLimiter,
  goalLimiter,
  groupLimiter,
  
  // General API limiters
  generalLimiter,
  searchLimiter,
  analyticsLimiter,
  
  // Admin/Sensitive operation limiters
  deleteAccountLimiter,
  apiKeyLimiter,
  securitySettingsLimiter,
  
  // User-based limiters
  userLoginLimiter,
  userExpenseLimiter,
  userPaymentLimiter,
  
  // Aliases for backward compatibility
  authLimiter: loginLimiter,
  uploadLimiter: fileUploadLimiter,
  
  // Utility
  createRateLimiter,
  createUserRateLimiter,
  getUserId
};