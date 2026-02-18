const Workspace = require('../models/Workspace');
const Expense = require('../models/Expense');
const Policy = require('../models/Policy');
const mongoose = require('mongoose');

class WorkspaceService {
    /**
     * Create a new workspace (hierarchical support #629)
     */
    async createWorkspace(userId, data) {
        const workspace = new Workspace({
            ...data,
            owner: userId,
            members: [{ user: userId, role: 'owner', status: 'active' }]
        });
        await workspace.save();
        return workspace;
    }

    /**
     * Create a sub-workspace (child entity)
     */
    async createSubWorkspace(userId, parentId, data) {
        const parent = await Workspace.findById(parentId);
        if (!parent) throw new Error('Parent workspace not found');

        // Check if user has permission to create sub-entities in parent
        const hasPerm = await parent.hasPermission(userId, 'workspace:settings');
        if (!hasPerm && parent.owner.toString() !== userId.toString()) {
            throw new Error('No permission to create sub-workspaces in this parent');
        }

        const subWorkspace = new Workspace({
            ...data,
            owner: userId,
            parentWorkspace: parentId,
            inheritanceSettings: {
                ...parent.inheritanceSettings,
                ...data.inheritanceSettings
            },
            members: [{ user: userId, role: 'owner', status: 'active' }]
        });

        await subWorkspace.save();

        // Log activity in parent
        parent.logActivity('workspace:created', userId, { subWorkspaceId: subWorkspace._id });
        await parent.save();

        return subWorkspace;
    }

    /**
     * Check permissions considering the workspace hierarchy (Parent-level roles)
     */
    async checkHierarchicalPermission(userId, workspaceId, permission) {
        let currentWorkspace = await Workspace.findById(workspaceId);

        while (currentWorkspace) {
            // Check direct permissions in current workspace
            const hasDirect = currentWorkspace.hasPermission(userId, permission);
            if (hasDirect) return true;

            // If this workspace doesn't inherit members, don't look up
            if (!currentWorkspace.inheritanceSettings.inheritMembers) {
                break;
            }

            // Move up to parent
            if (currentWorkspace.parentWorkspace) {
                currentWorkspace = await Workspace.findById(currentWorkspace.parentWorkspace);
            } else {
                currentWorkspace = null;
            }
        }

        return false;
    }

    /**
     * Get all workspaces for a user (including those inherited via parent)
     */
    async getUserWorkspaces(userId) {
        // Direct memberships
        const direct = await Workspace.find({
            'members.user': userId,
            status: 'active'
        }).populate('owner', 'name email');

        // Find sub-workspaces of those direct memberships if inheritance is enabled
        const inherited = [];
        for (const ws of direct) {
            const children = await Workspace.find({
                parentWorkspace: ws._id,
                'inheritanceSettings.inheritMembers': true,
                'members.user': { $ne: userId } // Don't duplicate direct memberships
            });
            inherited.push(...children);
        }

        return [...direct, ...inherited];
    }

    /**
     * Get single workspace with hierarchical member resolution
     */
    async getWorkspaceById(workspaceId, userId) {
        const workspace = await Workspace.findById(workspaceId)
            .populate('members.user', 'name email')
            .populate('owner', 'name email')
            .populate('parentWorkspace', 'name type');

        if (!workspace) throw new Error('Workspace not found');

        // Check hierarchical permission
        const authorized = await this.checkHierarchicalPermission(userId, workspaceId, 'expenses:view');
        if (!authorized) throw new Error('Not authorized to view this workspace or its parent');

        return workspace;
    }

    /**
     * Update workspace
     */
    async updateWorkspace(workspaceId, userId, data) {
        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) throw new Error('Workspace not found');

        // Only owner or admin can update
        const member = workspace.members.find(m => m.user.toString() === userId.toString());
        if (!member || (member.role !== 'admin' && workspace.owner.toString() !== userId.toString())) {
            throw new Error('Only owners and admins can update workspace settings');
        }

        Object.assign(workspace, data);
        await workspace.save();
        return workspace;
    }

    /**
     * Remove member from workspace
     */
    async removeMember(workspaceId, adminId, targetUserId) {
        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) throw new Error('Workspace not found');

        // Check if requester is owner or admin
        const adminMember = workspace.members.find(m => m.user.toString() === adminId.toString());
        const isOwner = workspace.owner.toString() === adminId.toString();
        if (!isOwner && (!adminMember || adminMember.role !== 'admin')) {
            throw new Error('Only owners and admins can remove members');
        }

        // Cannot remove owner
        if (workspace.owner.toString() === targetUserId.toString()) {
            throw new Error('Cannot remove the workspace owner');
        }

        workspace.members = workspace.members.filter(m => m.user.toString() !== targetUserId.toString());
        await workspace.save();
        return workspace;
    }

    /**
     * Update member role
     */
    async updateMemberRole(workspaceId, adminId, targetUserId, newRole) {
        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) throw new Error('Workspace not found');

        const adminMember = workspace.members.find(m => m.user.toString() === adminId.toString());
        const isOwner = workspace.owner.toString() === adminId.toString();
        if (!isOwner && (!adminMember || adminMember.role !== 'admin')) {
            throw new Error('Only owners and admins can change roles');
        }

        const member = workspace.members.find(m => m.user.toString() === targetUserId.toString());
        if (!member) throw new Error('User is not a member of this workspace');

        member.role = newRole;
        await workspace.save();
        return workspace;
    }

    /**
     * Get workspace statistics
     */
    async getWorkspaceStats(workspaceId) {
        const stats = await Expense.aggregate([
            { $match: { workspace: new mongoose.Types.ObjectId(workspaceId) } },
            {
                $group: {
                    _id: '$type',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const categoryBreakdown = await Expense.aggregate([
            { $match: { workspace: new mongoose.Types.ObjectId(workspaceId), type: 'expense' } },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { total: -1 } }
        ]);

        return {
            summary: stats,
            categoryBreakdown
        };
    }

    /**
     * Create governance policy
     */
    async createPolicy(workspaceId, userId, policyData) {
        const policy = new Policy({
            workspaceId,
            createdBy: userId,
            ...policyData
        });
        await policy.save();
        return policy;
    }

    /**
     * Get workspace policies
     */
    async getPolicies(workspaceId, filters = {}) {
        const query = { workspaceId, deletedAt: null };
        if (filters.active === true) query.isActive = true;
        if (filters.resourceType) query['conditions.resourceType'] = filters.resourceType;

        return await Policy.find(query).sort({ priority: -1 });
    }

    /**
     * Update policy
     */
    async updatePolicy(workspaceId, policyId, userId, updateData) {
        const policy = await Policy.findOne({ _id: policyId, workspaceId });
        if (!policy) throw new Error('Policy not found');

        Object.assign(policy, updateData);
        policy.updatedBy = userId;
        policy.updatedAt = Date.now();
        await policy.save();
        return policy;
    }

    /**
     * Delete policy (soft delete)
     */
    async deletePolicy(workspaceId, policyId, userId) {
        const policy = await Policy.findOne({ _id: policyId, workspaceId });
        if (!policy) throw new Error('Policy not found');

        policy.deletedAt = Date.now();
        policy.deletedBy = userId;
        await policy.save();
        return policy;
    }

    /**
     * Calculate workspace available balance (considering held funds)
     */
    async calculateAvailableBalance(workspaceId) {
        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) throw new Error('Workspace not found');

        // Get total expenses approved and available
        const expenses = await Expense.aggregate([
            {
                $match: {
                    workspace: new mongoose.Types.ObjectId(workspaceId),
                    type: 'expense'
                }
            },
            {
                $group: {
                    _id: '$approvalStatus',
                    total: { $sum: '$amount' }
                }
            }
        ]);

        const balanceBreakdown = {
            total: workspace.budget || 0,
            spent: 0,
            pending: 0,
            held: 0
        };

        expenses.forEach(exp => {
            if (exp._id === 'approved') balanceBreakdown.spent += exp.total;
            if (exp._id === 'pending_approval') balanceBreakdown.pending += exp.total;
            if (exp._id === 'draft') balanceBreakdown.held += exp.total;
        });

        return {
            ...balanceBreakdown,
            available: balanceBreakdown.total - balanceBreakdown.spent
        };
    }

    /**
     * Get pending approvals for workspace
     */
    async getPendingApprovals(workspaceId, userId) {
        const expenses = await Expense.find({
            workspace: workspaceId,
            approvalStatus: 'pending_approval'
        })
            .populate('createdBy', 'name email')
            .populate('policyFlags.policyId', 'name description')
            .sort({ createdAt: -1 });

        // Filter by user's approval responsibilities
        return expenses.filter(exp => {
            if (!exp.approvals) return false;
            return exp.approvals.some(approval =>
                approval.approverId.toString() === userId.toString() &&
                approval.status === 'pending'
            );
        });
    }

    /**
     * Approve expense
     */
    async approveExpense(workspaceId, expenseId, userId, notes = '') {
        const expense = await Expense.findOne({ _id: expenseId, workspace: workspaceId });
        if (!expense) throw new Error('Expense not found');
        if (expense.approvalStatus === 'rejected') throw new Error('Cannot approve rejected expense');

        // Find pending approval for this user
        const approval = expense.approvals.find(a => a.approverId.toString() === userId.toString());
        if (!approval) throw new Error('No approval required from this user');

        approval.status = 'approved';
        approval.approvedAt = Date.now();
        approval.notes = notes;

        // Check if all approvals complete
        const allApproved = expense.approvals.every(a => a.status === 'approved');
        if (allApproved) {
            expense.approvalStatus = 'approved';
            expense.approverId = userId;
            expense.approvedAt = Date.now();
            expense.fundHeld = false;
        }

        await expense.save();
        return expense;
    }

    /**
     * Reject expense
     */
    async rejectExpense(workspaceId, expenseId, userId, reason) {
        const expense = await Expense.findOne({ _id: expenseId, workspace: workspaceId });
        if (!expense) throw new Error('Expense not found');

        // Find approval for this user
        const approval = expense.approvals.find(a => a.approverId.toString() === userId.toString());
        if (!approval) throw new Error('No approval required from this user');

        approval.status = 'rejected';
        approval.rejectionReason = reason;
        approval.approvedAt = Date.now();

        expense.approvalStatus = 'rejected';
        expense.fundHeld = false;
        expense.rejectionReason = reason;

        await expense.save();
        return expense;
    }
}

module.exports = new WorkspaceService();
