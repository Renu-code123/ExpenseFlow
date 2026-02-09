const Workspace = require('../models/Workspace');

/**
 * Enterprise-Grade RBAC (Role-Based Access Control) Middleware
 * Issue #420: Permission checking for workspace operations
 * 
 * Roles:
 * - owner: Full control
 * - manager: Can manage members and settings
 * - editor: Can add/edit expenses
 * - viewer: Read-only access
 */

// Role hierarchy levels
const ROLE_HIERARCHY = {
  owner: 4,
  manager: 3,
  editor: 2,
  viewer: 1
};

// Permission definitions
const PERMISSIONS = {
  // Workspace permissions
  'workspace:delete': ['owner'],
  'workspace:transfer': ['owner'],
  'workspace:settings': ['owner', 'manager'],
  'workspace:view': ['owner', 'manager', 'editor', 'viewer'],
  
  // Member permissions
  'members:invite': ['owner', 'manager'],
  'members:remove': ['owner', 'manager'],
  'members:promote': ['owner', 'manager'],
  'members:demote': ['owner', 'manager'],
  'members:view': ['owner', 'manager', 'editor', 'viewer'],
  
  // Expense permissions
  'expenses:create': ['owner', 'manager', 'editor'],
  'expenses:edit': ['owner', 'manager', 'editor'],
  'expenses:delete': ['owner', 'manager', 'editor'],
  'expenses:approve': ['owner', 'manager'],
  'expenses:view': ['owner', 'manager', 'editor', 'viewer'],
  
  // Budget permissions
  'budgets:manage': ['owner', 'manager'],
  'budgets:view': ['owner', 'manager', 'editor', 'viewer'],
  
  // Report permissions
  'reports:view': ['owner', 'manager', 'editor', 'viewer'],
  'reports:export': ['owner', 'manager', 'editor'],
  
  // Audit permissions
  'audit:view': ['owner', 'manager']
};

// Role definitions for exports
const ROLES = {
  OWNER: 'owner',
  MANAGER: 'manager',
  EDITOR: 'editor',
  VIEWER: 'viewer'
};

/**
 * Check if a role has a specific permission
 */
function roleHasPermission(role, permission) {
  const allowedRoles = PERMISSIONS[permission];
  if (!allowedRoles) return false;
  return allowedRoles.includes(role);
}

/**
 * Get user's role in a workspace
 */
async function getUserRole(workspaceId, userId) {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) return null;
  
  // Check if owner
  if (workspace.owner.toString() === userId.toString()) {
    return 'owner';
  }
  
  // Check member role
  const member = workspace.members.find(
    m => m.user.toString() === userId.toString()
  );
  
  return member ? member.role : null;
}

/**
 * Legacy checkRole middleware (for backward compatibility)
 * @param {Array} allowedRoles - Roles that can access the route
 */
const checkRole = (allowedRoles = []) => {
  return async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId || req.params.id || 
                          req.body.workspaceId || req.query.workspaceId;

      if (!workspaceId) {
        // If no workspaceId, it's a personal request
        return next();
      }

      const workspace = await Workspace.findById(workspaceId);

      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
      }

      // Check if owner
      const isOwner = workspace.owner.toString() === req.user._id.toString();
      
      // Get member info
      const member = workspace.members.find(
        m => m.user.toString() === req.user._id.toString()
      );

      if (!isOwner && !member) {
        return res.status(403).json({ error: 'You are not a member of this workspace' });
      }

      const userRole = isOwner ? 'owner' : member.role;

      // Check role permissions
      if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
        return res.status(403).json({
          error: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
          code: 'INSUFFICIENT_ROLE',
          required: allowedRoles,
          current: userRole
        });
      }

      req.workspace = workspace;
      req.userRole = userRole;
      req.isOwner = isOwner;
      next();
    } catch (error) {
      console.error('[RBAC Middleware] Error:', error);
      res.status(500).json({ error: 'Internal server error during permission check' });
    }
  };
};

/**
 * Main permission check middleware factory
 * @param {string|string[]} requiredPermission - Permission(s) required
 * @param {Object} options - Additional options
 */
function checkPermission(requiredPermission, options = {}) {
  const {
    workspaceIdParam = 'id',
    workspaceIdField = null,
    allowSelf = false,
    selfField = 'userId'
  } = options;

  return async (req, res, next) => {
    try {
      // Get workspace ID from params, body, or query
      const workspaceId = req.params[workspaceIdParam] || 
                          req.params.workspaceId ||
                          (workspaceIdField && req.body[workspaceIdField]) ||
                          req.query.workspaceId ||
                          req.body.workspaceId;

      if (!workspaceId) {
        return res.status(400).json({ 
          error: 'Workspace ID is required',
          code: 'MISSING_WORKSPACE_ID'
        });
      }

      const userId = req.user._id || req.user.id;

      // Get workspace and verify it exists
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        return res.status(404).json({ 
          error: 'Workspace not found',
          code: 'WORKSPACE_NOT_FOUND'
        });
      }

      // Check workspace status
      if (workspace.status !== 'active') {
        return res.status(403).json({
          error: 'Workspace is not active',
          code: 'WORKSPACE_INACTIVE'
        });
      }

      // Get user's role
      const userRole = workspace.getUserRole(userId);
      if (!userRole) {
        return res.status(403).json({
          error: 'You are not a member of this workspace',
          code: 'NOT_A_MEMBER'
        });
      }

      // Check member status
      const member = workspace.getMember(userId);
      if (member && member.status !== 'active') {
        return res.status(403).json({
          error: 'Your membership is suspended',
          code: 'MEMBERSHIP_SUSPENDED'
        });
      }

      // Check self-action permission
      if (allowSelf) {
        const targetUserId = req.params.userId || req.body[selfField];
        if (targetUserId && targetUserId.toString() === userId.toString()) {
          req.workspace = workspace;
          req.userRole = userRole;
          return next();
        }
      }

      // Check permission(s)
      const permissions = Array.isArray(requiredPermission) 
        ? requiredPermission 
        : [requiredPermission];

      const hasPermission = permissions.some(permission => {
        // Check role-based permission
        if (roleHasPermission(userRole, permission)) return true;
        
        // Check custom permission on member
        if (member && member.customPermissions?.includes(permission)) return true;
        
        // Check if permission is restricted
        if (member && member.restrictedPermissions?.includes(permission)) return false;
        
        return false;
      });

      if (!hasPermission) {
        return res.status(403).json({
          error: 'You do not have permission to perform this action',
          code: 'PERMISSION_DENIED',
          required: permissions,
          userRole
        });
      }

      // Attach workspace and role to request
      req.workspace = workspace;
      req.userRole = userRole;
      req.userPermissions = member?.effectivePermissions || 
                            Workspace.ROLE_PERMISSIONS?.[userRole] || [];

      next();
    } catch (error) {
      console.error('RBAC middleware error:', error);
      res.status(500).json({ 
        error: 'Permission check failed',
        code: 'RBAC_ERROR'
      });
    }
  };
}

/**
 * Check minimum role level
 * @param {string} minRole - Minimum required role
 */
function requireRole(minRole, options = {}) {
  const { workspaceIdParam = 'id' } = options;
  
  return async (req, res, next) => {
    try {
      const workspaceId = req.params[workspaceIdParam] || 
                          req.params.workspaceId ||
                          req.body.workspaceId ||
                          req.query.workspaceId;

      if (!workspaceId) {
        return res.status(400).json({ 
          error: 'Workspace ID is required',
          code: 'MISSING_WORKSPACE_ID'
        });
      }

      const userId = req.user._id || req.user.id;
      const workspace = await Workspace.findById(workspaceId);
      
      if (!workspace) {
        return res.status(404).json({ 
          error: 'Workspace not found',
          code: 'WORKSPACE_NOT_FOUND'
        });
      }

      const userRole = workspace.getUserRole(userId);
      if (!userRole) {
        return res.status(403).json({
          error: 'You are not a member of this workspace',
          code: 'NOT_A_MEMBER'
        });
      }

      const userLevel = ROLE_HIERARCHY[userRole] || 0;
      const requiredLevel = ROLE_HIERARCHY[minRole] || 0;

      if (userLevel < requiredLevel) {
        return res.status(403).json({
          error: `This action requires ${minRole} role or higher`,
          code: 'INSUFFICIENT_ROLE',
          required: minRole,
          current: userRole
        });
      }

      req.workspace = workspace;
      req.userRole = userRole;
      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({ 
        error: 'Role check failed',
        code: 'ROLE_CHECK_ERROR'
      });
    }
  };
}

/**
 * Check if user is workspace owner
 */
function requireOwner(options = {}) {
  return requireRole('owner', options);
}

/**
 * Check if user is at least a manager
 */
function requireManager(options = {}) {
  return requireRole('manager', options);
}

/**
 * Check if user is at least an editor
 */
function requireEditor(options = {}) {
  return requireRole('editor', options);
}

/**
 * Check if user is at least a member (viewer)
 */
function requireMember(options = {}) {
  return requireRole('viewer', options);
}

/**
 * Workspace access middleware (just checks membership)
 */
function workspaceAccess(options = {}) {
  const { workspaceIdParam = 'id' } = options;

  return async (req, res, next) => {
    try {
      const workspaceId = req.params[workspaceIdParam] || 
                          req.params.workspaceId ||
                          req.body.workspaceId ||
                          req.query.workspaceId;

      if (!workspaceId) {
        return res.status(400).json({ 
          error: 'Workspace ID is required',
          code: 'MISSING_WORKSPACE_ID'
        });
      }

      const userId = req.user._id || req.user.id;
      const workspace = await Workspace.findById(workspaceId)
        .populate('owner', 'name email avatar')
        .populate('members.user', 'name email avatar');

      if (!workspace) {
        return res.status(404).json({ 
          error: 'Workspace not found',
          code: 'WORKSPACE_NOT_FOUND'
        });
      }

      // Check if user has access
      const isOwner = workspace.owner._id.toString() === userId.toString();
      const isMember = workspace.members.some(
        m => m.user._id.toString() === userId.toString() && m.status === 'active'
      );

      if (!isOwner && !isMember) {
        return res.status(403).json({
          error: 'You do not have access to this workspace',
          code: 'ACCESS_DENIED'
        });
      }

      req.workspace = workspace;
      req.userRole = workspace.getUserRole(userId);
      req.isOwner = isOwner;

      next();
    } catch (error) {
      console.error('Workspace access error:', error);
      res.status(500).json({ 
        error: 'Access check failed',
        code: 'ACCESS_CHECK_ERROR'
      });
    }
  };
}

/**
 * Check if user can manage target role
 */
function canManageRole(options = {}) {
  const { targetRoleField = 'role' } = options;

  return async (req, res, next) => {
    try {
      const targetRole = req.body[targetRoleField] || req.params.role;
      
      if (!targetRole) {
        return res.status(400).json({
          error: 'Target role is required',
          code: 'MISSING_TARGET_ROLE'
        });
      }

      const workspace = req.workspace;
      const userId = req.user._id || req.user.id;

      if (!workspace.canManageRole(userId, targetRole)) {
        return res.status(403).json({
          error: 'You cannot assign or manage this role',
          code: 'CANNOT_MANAGE_ROLE',
          targetRole,
          yourRole: req.userRole
        });
      }

      next();
    } catch (error) {
      console.error('Role management check error:', error);
      res.status(500).json({
        error: 'Role management check failed',
        code: 'ROLE_MANAGEMENT_ERROR'
      });
    }
  };
}

// Export middleware functions
module.exports = {
  checkRole,
  checkPermission,
  requireRole,
  requireOwner,
  requireManager,
  requireEditor,
  requireMember,
  workspaceAccess,
  canManageRole,
  roleHasPermission,
  getUserRole,
  PERMISSIONS,
  ROLES,
  ROLE_HIERARCHY
};
