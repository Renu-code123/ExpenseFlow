/**
 * Role-Based Access Control Middleware
 * Issue #552: Expense Approval Workflow & Team Management
 */

const roleCheck = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const userRole = req.user.role || 'submitter';

        if (!roles.includes(userRole)) {
            return res.status(403).json({
                error: 'Access denied: Insufficient permissions',
                requiredRoles: roles,
                currentRole: userRole
            });
        }

        next();
    };
};

module.exports = { roleCheck };
