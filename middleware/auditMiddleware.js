const AuditLog = require('../models/AuditLog');
const crypto = require('crypto');

/**
 * Audit Middleware
 * Automatically captures and logs all state-changing operations
 * Issue #469: Enterprise-Grade Security Audit Trail & Forensics Engine
 */

class AuditMiddleware {
  /**
   * Main audit interceptor for PUT/PATCH/DELETE/POST requests
   */
  static auditInterceptor() {
    return async (req, res, next) => {
      // Only audit state-changing operations
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        return next();
      }
      
      // Skip audit endpoints themselves to prevent recursion
      if (req.path.includes('/api/audit')) {
        return next();
      }
      
      // Store original data for comparison
      req.auditData = {
        method: req.method,
        endpoint: req.path,
        body: { ...req.body },
        params: { ...req.params },
        query: { ...req.query },
        timestamp: new Date()
      };
      
      // Capture original response methods
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);
      
      // Intercept response to capture result
      res.json = function(data) {
        req.auditData.responseData = data;
        req.auditData.statusCode = res.statusCode;
        
        // Create audit log asynchronously (don't block response)
        setImmediate(() => {
          AuditMiddleware.createAuditLog(req, res).catch(err => {
            console.error('[AuditMiddleware] Failed to create audit log:', err);
          });
        });
        
        return originalJson(data);
      };
      
      res.send = function(data) {
        req.auditData.responseData = data;
        req.auditData.statusCode = res.statusCode;
        
        // Create audit log asynchronously
        setImmediate(() => {
          AuditMiddleware.createAuditLog(req, res).catch(err => {
            console.error('[AuditMiddleware] Failed to create audit log:', err);
          });
        });
        
        return originalSend(data);
      };
      
      next();
    };
  }
  
  /**
   * Create audit log entry
   */
  static async createAuditLog(req, res) {
    try {
      // Skip if no user (shouldn't happen for protected routes)
      if (!req.user) {
        return;
      }
      
      const userId = req.user.id || req.user._id;
      
      // Determine resource and action from endpoint
      const { resource, resourceId, action } = AuditMiddleware.parseEndpoint(req);
      
      // Skip if resource couldn't be determined
      if (!resource) {
        return;
      }
      
      // Calculate delta if available
      const delta = AuditMiddleware.calculateDelta(req);
      
      // Get previous hash for chaining
      const previousHash = await AuditLog.getLatestHash(userId);
      
      // Determine severity
      const severity = AuditMiddleware.determineSeverity(action, req.method);
      
      // Create audit log entry
      const auditLog = new AuditLog({
        userId,
        action,
        resource,
        resourceId,
        originalState: req.auditData.originalState || null,
        newState: req.auditData.newState || null,
        delta,
        ipAddress: AuditMiddleware.getClientIP(req),
        userAgent: req.get('user-agent') || '',
        method: req.method,
        endpoint: req.path,
        statusCode: req.auditData.statusCode || res.statusCode,
        previousHash,
        sessionId: req.sessionID || req.headers['x-session-id'],
        workspaceId: req.body.workspaceId || req.params.workspaceId || null,
        severity,
        metadata: {
          queryParams: req.query,
          bodyKeys: Object.keys(req.body),
          responseSuccess: req.auditData.responseData?.success || false
        }
      });
      
      // Generate cryptographic hash
      auditLog.generateHash();
      
      // Save audit log
      await auditLog.save();
      
      // Check for suspicious activity
      const suspicious = await AuditLog.detectSuspiciousActivity(userId);
      if (suspicious.detected) {
        await AuditMiddleware.flagSuspiciousActivity(userId, suspicious);
      }
      
    } catch (error) {
      console.error('[AuditMiddleware] Error creating audit log:', error);
    }
  }
  
  /**
   * Parse endpoint to determine resource and action
   */
  static parseEndpoint(req) {
    const path = req.path.toLowerCase();
    const method = req.method;
    
    let resource = null;
    let resourceId = null;
    let action = null;
    
    // Extract resource from path
    if (path.includes('/expenses')) {
      resource = 'expense';
      resourceId = req.params.id || req.params.expenseId;
    } else if (path.includes('/budgets')) {
      resource = 'budget';
      resourceId = req.params.id || req.params.budgetId;
    } else if (path.includes('/goals')) {
      resource = 'goal';
      resourceId = req.params.id || req.params.goalId;
    } else if (path.includes('/rules')) {
      resource = 'rule';
      resourceId = req.params.id || req.params.ruleId;
    } else if (path.includes('/workspaces')) {
      resource = 'workspace';
      resourceId = req.params.id || req.params.workspaceId;
    } else if (path.includes('/users')) {
      resource = 'user';
      resourceId = req.params.id || req.params.userId;
    } else if (path.includes('/categories')) {
      resource = 'category';
      resourceId = req.params.id || req.params.categoryId;
    } else if (path.includes('/receipts')) {
      resource = 'receipt';
      resourceId = req.params.id || req.params.receiptId;
    } else if (path.includes('/reports') || path.includes('/export')) {
      resource = 'report';
      resourceId = req.params.id;
    } else if (path.includes('/settings')) {
      resource = 'setting';
      resourceId = 'global';
    } else if (path.includes('/auth') || path.includes('/login') || path.includes('/logout')) {
      resource = 'auth';
      action = path.includes('/login') ? 'login' : 'logout';
    }
    
    // Determine action from method if not set
    if (!action) {
      if (method === 'POST') {
        action = path.includes('/bulk') ? 'bulk_create' : 'create';
      } else if (method === 'PUT' || method === 'PATCH') {
        action = path.includes('/bulk') ? 'bulk_update' : 'update';
      } else if (method === 'DELETE') {
        action = path.includes('/bulk') ? 'bulk_delete' : 'delete';
      }
    }
    
    return { resource, resourceId, action };
  }
  
  /**
   * Calculate delta between original and new state
   */
  static calculateDelta(req) {
    // If original and new states are provided
    if (req.auditData.originalState && req.auditData.newState) {
      return AuditLog.calculateDelta(req.auditData.originalState, req.auditData.newState);
    }
    
    // Otherwise, just return the request body as the delta
    if (req.method === 'PUT' || req.method === 'PATCH') {
      return req.body;
    }
    
    return {};
  }
  
  /**
   * Determine severity based on action and method
   */
  static determineSeverity(action, method) {
    // Critical actions
    if (action === 'bulk_delete' || action === 'permission_change') {
      return 'critical';
    }
    
    // High severity actions
    if (action === 'delete' || action === 'bulk_update' || method === 'DELETE') {
      return 'high';
    }
    
    // Medium severity actions
    if (action === 'update' || method === 'PUT' || method === 'PATCH') {
      return 'medium';
    }
    
    // Low severity (create operations)
    return 'low';
  }
  
  /**
   * Get client IP address
   */
  static getClientIP(req) {
    return (
      req.headers['x-forwarded-for'] ||
      req.headers['x-real-ip'] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }
  
  /**
   * Flag suspicious activity
   */
  static async flagSuspiciousActivity(userId, suspicious) {
    try {
      // Find recent logs from this user
      const recentLogs = await AuditLog.find({
        userId,
        createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
        flagged: false
      });
      
      // Flag them
      await AuditLog.updateMany(
        { _id: { $in: recentLogs.map(log => log._id) } },
        {
          $set: {
            flagged: true,
            flagReason: `Suspicious activity detected: ${suspicious.reasons.join(', ')}`,
            severity: suspicious.severity
          }
        }
      );
      
      // TODO: Send alert to administrators
      console.warn(`[AuditMiddleware] Suspicious activity detected for user ${userId}:`, suspicious.reasons);
      
    } catch (error) {
      console.error('[AuditMiddleware] Error flagging suspicious activity:', error);
    }
  }
  
  /**
   * Middleware to capture original state before update/delete
   */
  static captureOriginalState(Model, idParam = 'id') {
    return async (req, res, next) => {
      if (req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
        try {
          const id = req.params[idParam];
          if (id && Model) {
            const original = await Model.findById(id).lean();
            if (original) {
              req.auditData = req.auditData || {};
              req.auditData.originalState = original;
            }
          }
        } catch (error) {
          console.error('[AuditMiddleware] Error capturing original state:', error);
        }
      }
      next();
    };
  }
  
  /**
   * Middleware to capture new state after operation
   */
  static captureNewState(getNewState) {
    return (req, res, next) => {
      const originalJson = res.json.bind(res);
      
      res.json = function(data) {
        if (data && data.data) {
          req.auditData = req.auditData || {};
          req.auditData.newState = typeof getNewState === 'function' 
            ? getNewState(data.data) 
            : data.data;
        }
        return originalJson(data);
      };
      
      next();
    };
  }
}

module.exports = AuditMiddleware;
