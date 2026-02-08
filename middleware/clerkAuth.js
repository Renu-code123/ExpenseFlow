const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

// Simple authentication middleware
const requireAuth = ClerkExpressRequireAuth({
  onError: (error) => {
    console.error('Clerk auth error:', error);
    return {
      status: 401,
      message: 'Authentication required. Please sign in.'
    };
  }
});

// Extract user ID from request
const getUserId = (req) => {
  return req.auth?.userId || null;
};

module.exports = {
  requireAuth,
  getUserId
};