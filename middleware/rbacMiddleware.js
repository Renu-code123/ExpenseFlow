const accessService = require('../services/accessService');

/**
 * RBAC Middleware
 * Issue #658: Enforces granular permission checks on routes
 */
const requirePermission = (permissionCode) => {
    return async (req, res, next) => {
        try {
            const userId = req.user._id;
            const workspaceId = req.params.workspaceId || req.body.workspaceId || req.query.workspaceId;

            if (!workspaceId) {
                // If no workspace, check if user is a global super admin (simplified for this issue)
                if (req.user.role === 'admin') return next();
                return res.status(400).json({ success: false, error: 'Workspace context required for permission check' });
            }

            const hasAccess = await accessService.hasPermission(userId, workspaceId, permissionCode);

            if (!hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: `Access Denied: Missing permission [${permissionCode}]`
                });
            }

            next();
        } catch (error) {
            console.error('[RBAC] Middleware error:', error);
            res.status(500).json({ success: false, error: 'Internal security check failure' });
        }
    };
};

module.exports = { requirePermission };
