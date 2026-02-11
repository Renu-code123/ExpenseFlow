const { ClerkExpressRequireAuth, clerkClient } = require('@clerk/clerk-sdk-node');

// Robust Clerk authentication middleware
// Uses ClerkExpressRequireAuth with proper error handling
const requireAuth = async (req, res, next) => {
  try {
    // Use ClerkExpressRequireAuth internally
    const clerkMiddleware = ClerkExpressRequireAuth();
    
    await new Promise((resolve, reject) => {
      clerkMiddleware(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Verify we got a userId
    if (!req.auth?.userId) {
      return res.status(401).json({ 
        error: 'Authentication required. Please sign in.' 
      });
    }
    
    next();
  } catch (error) {
    console.error('Clerk auth error:', error.message || error);
    return res.status(401).json({ 
      error: 'Authentication required. Please sign in.' 
    });
  }
};

// Extract user ID from request
const getUserId = (req) => {
  return req.auth?.userId || null;
};

module.exports = {
  requireAuth,
  getUserId
};