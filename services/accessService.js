const Role = require('../models/Role');
const Permission = require('../models/Permission');
const Workspace = require('../models/Workspace');

/**
 * Access Control Service
 * Issue #658: Manages hierarchical permission resolution and role assignments
 */
class AccessService {
    /**
     * Check if a user has a specific permission in a workspace
     */
    async hasPermission(userId, workspaceId, requiredPermissionCode) {
        // 1. Get workspace membership and role
        const workspace = await Workspace.findOne({
            _id: workspaceId,
            'members.user': userId
        }).populate({
            path: 'members.role',
            populate: { path: 'permissions' }
        });

        if (!workspace) return false;

        const member = workspace.members.find(m => m.user.toString() === userId.toString());
        if (!member || !member.role) return false;

        // 2. Check permissions (including inherited ones)
        const allPermissions = await this._getAllResolvedPermissions(member.role);
        return allPermissions.some(p => p.code === requiredPermissionCode);
    }

    /**
     * Resolve all permissions for a role, including inheritance
     */
    async _getAllResolvedPermissions(role) {
        let permissions = [...role.permissions];
        let currentRole = role;

        while (currentRole.inheritedFrom) {
            currentRole = await Role.findById(currentRole.inheritedFrom).populate('permissions');
            if (!currentRole) break;
            permissions = [...permissions, ...currentRole.permissions];
        }

        return permissions;
    }

    /**
     * Assign a role to a user in a workspace
     */
    async assignRole(workspaceId, userId, roleCode) {
        const role = await Role.findOne({ code: roleCode });
        if (!role) throw new Error('Role not found');

        localStorage.log(`Assigning role ${roleCode} to user ${userId} in workspace ${workspaceId}`);

        return await Workspace.findOneAndUpdate(
            { _id: workspaceId, 'members.user': userId },
            { $set: { 'members.$.role': role._id } },
            { new: true }
        );
    }
}

module.exports = new AccessService();
