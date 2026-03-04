const TenantConfig = require('../models/TenantConfig');
const logger = require('../utils/structuredLogger');

/**
 * Tenant Resolver Middleware
 * Issue #729: Injects tenant (workspace) context into every request.
 * Resolves workspaceId from headers or path and validates access.
 */
const tenantResolver = async (req, res, next) => {
    try {
        // 1. Resolve Workspace ID
        // Priority: Header > Query Parameter > Body
        const workspaceId = req.headers['x-workspace-id'] || req.query.workspaceId || req.body.workspaceId;

        if (!workspaceId) {
            // Some routes might be global (auth, user settings), so we allow 'next' 
            // but log the absence of tenant context for audit.
            return next();
        }

        // 2. Validate User belongs to this workspace
        if (req.user) {
            const hasAccess = req.user.workspaces && req.user.workspaces.some(w =>
                w.workspace.toString() === workspaceId.toString()
            );

            if (!hasAccess && req.user.role !== 'admin') {
                logger.warn('Unauthorized workspace access attempt', {
                    userId: req.user._id,
                    requestedWorkspace: workspaceId
                });
                return res.status(403).json({
                    success: false,
                    error: 'Access Denied: You are not a member of this workspace.'
                });
            }
        }

        // 3. Fetch Tenant Configuration
        let config = await TenantConfig.findOne({ workspaceId });
        if (!config) {
            // Initialize default config if missing
            config = await TenantConfig.create({ workspaceId });
        }

        // 4. Inject into request object for subsequent middleware and controllers
        req.tenant = {
            id: workspaceId,
            config: config
        };

        next();
    } catch (err) {
        logger.error('[TenantResolver] Failure:', err.message);
        res.status(500).json({ success: false, error: 'Internal Tenant Error' });
    }
};

module.exports = tenantResolver;
