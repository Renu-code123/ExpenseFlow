const SharedSpace = require('../models/SharedSpace');

/**
 * Middleware to check if user has specific permission in a shared space
 * Usage: router.get('/:id/resource', auth, spaceAuth('view_expenses'), handler)
 */
const spaceAuth = (requiredPermission) => {
    return async (req, res, next) => {
        try {
            const spaceId = req.params.id;
            const userId = req.user.id;
            
            // Get the shared space
            const space = await SharedSpace.findById(spaceId);
            
            if (!space) {
                return res.status(404).json({
                    success: false,
                    message: 'Shared space not found'
                });
            }
            
            // Check if user is a member
            if (!space.isMember(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a member of this shared space'
                });
            }
            
            // Check if space is active
            if (!space.isActive) {
                return res.status(403).json({
                    success: false,
                    message: 'This shared space is no longer active'
                });
            }
            
            // Check permission
            if (!space.hasPermission(userId, requiredPermission)) {
                return res.status(403).json({
                    success: false,
                    message: `You do not have permission to ${requiredPermission.replace('_', ' ')}`
                });
            }
            
            // Attach space and member info to request
            req.space = space;
            req.member = space.getMember(userId);
            
            next();
        } catch (error) {
            console.error('Space auth error:', error);
            res.status(500).json({
                success: false,
                message: 'Error checking permissions'
            });
        }
    };
};

/**
 * Middleware to check if user is owner or admin of space
 */
const spaceOwnerOrAdmin = async (req, res, next) => {
    try {
        const spaceId = req.params.id;
        const userId = req.user.id;
        
        const space = await SharedSpace.findById(spaceId);
        
        if (!space) {
            return res.status(404).json({
                success: false,
                message: 'Shared space not found'
            });
        }
        
        const member = space.getMember(userId);
        const isOwner = space.owner.toString() === userId;
        const isAdmin = member && member.role === 'admin';
        
        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Only space owner or admins can perform this action'
            });
        }
        
        req.space = space;
        req.member = member;
        
        next();
    } catch (error) {
        console.error('Space owner/admin auth error:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking permissions'
        });
    }
};

/**
 * Middleware to check if user is the space owner
 */
const spaceOwnerOnly = async (req, res, next) => {
    try {
        const spaceId = req.params.id;
        const userId = req.user.id;
        
        const space = await SharedSpace.findById(spaceId);
        
        if (!space) {
            return res.status(404).json({
                success: false,
                message: 'Shared space not found'
            });
        }
        
        if (space.owner.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Only the space owner can perform this action'
            });
        }
        
        req.space = space;
        
        next();
    } catch (error) {
        console.error('Space owner auth error:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking permissions'
        });
    }
};

module.exports = {
    spaceAuth,
    spaceOwnerOrAdmin,
    spaceOwnerOnly
};
