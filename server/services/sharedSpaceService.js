const SharedSpace = require('../models/SharedSpace');
const SharedGoal = require('../models/SharedGoal');
const SpaceActivity = require('../models/SpaceActivity');
const Expense = require('../models/Expense');
const Budget = require('../models/Budget');
const mongoose = require('mongoose');

class SharedSpaceService {
    // Create new shared space
    async createSpace(ownerId, data) {
        const space = new SharedSpace({
            ...data,
            owner: ownerId,
            members: [{
                user: ownerId,
                role: 'admin',
                permissions: this.getDefaultPermissions('admin'),
                joined_at: new Date()
            }]
        });
        
        await space.save();
        
        // Log activity
        await SpaceActivity.logActivity({
            space: space._id,
            actor: ownerId,
            action: 'space_created',
            target_type: 'space',
            target_id: space._id,
            details: { description: space.name }
        });
        
        return space;
    }
    
    // Add member to space
    async addMember(spaceId, userId, memberId, role = 'viewer') {
        const space = await SharedSpace.findById(spaceId);
        
        if (!space) {
            throw new Error('Shared space not found');
        }
        
        if (!space.hasPermission(userId, 'manage_members')) {
            throw new Error('You do not have permission to add members');
        }
        
        const permissions = this.getDefaultPermissions(role);
        await space.addMember(memberId, role, permissions);
        
        // Log activity
        await SpaceActivity.logActivity({
            space: spaceId,
            actor: userId,
            action: 'member_added',
            target_type: 'member',
            target_id: memberId,
            details: { 
                member_name: memberId,
                role: role 
            }
        });
        
        return space;
    }
    
    // Remove member from space
    async removeMember(spaceId, userId, memberId) {
        const space = await SharedSpace.findById(spaceId);
        
        if (!space) {
            throw new Error('Shared space not found');
        }
        
        if (!space.hasPermission(userId, 'manage_members')) {
            throw new Error('You do not have permission to remove members');
        }
        
        await space.removeMember(memberId);
        
        // Log activity
        await SpaceActivity.logActivity({
            space: spaceId,
            actor: userId,
            action: 'member_removed',
            target_type: 'member',
            target_id: memberId
        });
        
        return space;
    }
    
    // Update member role and permissions
    async updateMemberRole(spaceId, userId, memberId, newRole, customPermissions = null) {
        const space = await SharedSpace.findById(spaceId);
        
        if (!space) {
            throw new Error('Shared space not found');
        }
        
        if (!space.hasPermission(userId, 'manage_members')) {
            throw new Error('You do not have permission to update member roles');
        }
        
        const permissions = customPermissions || this.getDefaultPermissions(newRole);
        await space.updateMemberRole(memberId, newRole, permissions);
        
        // Log activity
        await SpaceActivity.logActivity({
            space: spaceId,
            actor: userId,
            action: 'member_role_changed',
            target_type: 'member',
            target_id: memberId,
            details: { role: newRole }
        });
        
        return space;
    }
    
    // Join space via invite code
    async joinSpaceWithCode(userId, inviteCode) {
        const space = await SharedSpace.findOne({ invite_code: inviteCode, isActive: true });
        
        if (!space) {
            throw new Error('Invalid or expired invite code');
        }
        
        if (space.isMember(userId)) {
            throw new Error('You are already a member of this space');
        }
        
        const defaultRole = 'viewer';
        const permissions = this.getDefaultPermissions(defaultRole);
        await space.addMember(userId, defaultRole, permissions);
        
        // Log activity
        await SpaceActivity.logActivity({
            space: space._id,
            actor: userId,
            action: 'member_added',
            target_type: 'member',
            target_id: userId,
            details: { 
                description: 'Joined via invite code',
                role: defaultRole 
            }
        });
        
        return space;
    }
    
    // Get consolidated space report
    async getSpaceReport(spaceId, userId, startDate, endDate) {
        const space = await SharedSpace.findById(spaceId).populate('members.user', 'name email');
        
        if (!space) {
            throw new Error('Shared space not found');
        }
        
        if (!space.isMember(userId)) {
            throw new Error('You are not a member of this space');
        }
        
        if (!space.hasPermission(userId, 'view_reports')) {
            throw new Error('You do not have permission to view reports');
        }
        
        const member = space.getMember(userId);
        const memberIds = space.members.map(m => m.user._id);
        
        // Build expense query
        const expenseQuery = {
            user: { $in: memberIds },
            date: { $gte: startDate, $lte: endDate }
        };
        
        // Apply privacy filters
        if (member.privacy_settings.hide_personal_transactions && member.role !== 'admin') {
            // Only show shared expenses or user's own expenses
            expenseQuery.$or = [
                { user: userId },
                { shared_with: spaceId }
            ];
        }
        
        // Get expenses
        const expenses = await Expense.find(expenseQuery)
            .populate('user', 'name')
            .sort({ date: -1 });
        
        // Get goals
        const goals = await SharedGoal.getSpaceGoals(spaceId);
        
        // Calculate statistics
        const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const expensesByCategory = this.groupExpensesByCategory(expenses);
        const expensesByMember = this.groupExpensesByMember(expenses);
        
        // Get recent activity
        const recentActivity = await SpaceActivity.getSpaceActivity(spaceId, 20);
        
        return {
            space: {
                id: space._id,
                name: space.name,
                type: space.type,
                currency: space.settings.currency,
                members: space.members.length
            },
            period: { startDate, endDate },
            summary: {
                total_expenses: totalExpenses,
                expense_count: expenses.length,
                active_goals: goals.filter(g => g.status === 'active').length,
                completed_goals: goals.filter(g => g.status === 'completed').length
            },
            expenses: {
                by_category: expensesByCategory,
                by_member: expensesByMember,
                recent: expenses.slice(0, 10)
            },
            goals: goals,
            recent_activity: recentActivity
        };
    }
    
    // Get member's contribution summary
    async getMemberContributions(spaceId, userId, memberId = null) {
        const space = await SharedSpace.findById(spaceId);
        
        if (!space) {
            throw new Error('Shared space not found');
        }
        
        if (!space.isMember(userId)) {
            throw new Error('You are not a member of this space');
        }
        
        const targetMemberId = memberId || userId;
        
        // Get all goals for the space
        const goals = await SharedGoal.find({ space: spaceId });
        
        const contributions = goals.map(goal => {
            const contributor = goal.contributors.find(c => 
                c.user.toString() === targetMemberId.toString()
            );
            
            return {
                goal: {
                    id: goal._id,
                    name: goal.name,
                    target_amount: goal.target_amount
                },
                target_contribution: contributor?.target_contribution || 0,
                current_contribution: contributor?.current_contribution || 0,
                progress: contributor ? 
                    (contributor.current_contribution / contributor.target_contribution * 100).toFixed(2) 
                    : 0
            };
        });
        
        const totalTarget = contributions.reduce((sum, c) => sum + c.target_contribution, 0);
        const totalContributed = contributions.reduce((sum, c) => sum + c.current_contribution, 0);
        
        return {
            member_id: targetMemberId,
            space_id: spaceId,
            summary: {
                total_target: totalTarget,
                total_contributed: totalContributed,
                overall_progress: totalTarget > 0 ? (totalContributed / totalTarget * 100).toFixed(2) : 0
            },
            goals: contributions
        };
    }
    
    // Helper: Group expenses by category
    groupExpensesByCategory(expenses) {
        const grouped = {};
        
        expenses.forEach(expense => {
            const category = expense.category || 'Uncategorized';
            if (!grouped[category]) {
                grouped[category] = {
                    total: 0,
                    count: 0
                };
            }
            grouped[category].total += expense.amount;
            grouped[category].count += 1;
        });
        
        return grouped;
    }
    
    // Helper: Group expenses by member
    groupExpensesByMember(expenses) {
        const grouped = {};
        
        expenses.forEach(expense => {
            const userId = expense.user._id.toString();
            const userName = expense.user.name;
            
            if (!grouped[userId]) {
                grouped[userId] = {
                    name: userName,
                    total: 0,
                    count: 0
                };
            }
            grouped[userId].total += expense.amount;
            grouped[userId].count += 1;
        });
        
        return grouped;
    }
    
    // Helper: Get default permissions for role
    getDefaultPermissions(role) {
        const permissions = {
            admin: {
                view_expenses: true,
                add_expenses: true,
                edit_expenses: true,
                delete_expenses: true,
                view_goals: true,
                manage_goals: true,
                view_budgets: true,
                manage_budgets: true,
                approve_expenses: true,
                manage_members: true,
                view_reports: true
            },
            manager: {
                view_expenses: true,
                add_expenses: true,
                edit_expenses: true,
                delete_expenses: false,
                view_goals: true,
                manage_goals: true,
                view_budgets: true,
                manage_budgets: true,
                approve_expenses: true,
                manage_members: false,
                view_reports: true
            },
            contributor: {
                view_expenses: true,
                add_expenses: true,
                edit_expenses: true,
                delete_expenses: false,
                view_goals: true,
                manage_goals: false,
                view_budgets: true,
                manage_budgets: false,
                approve_expenses: false,
                manage_members: false,
                view_reports: true
            },
            viewer: {
                view_expenses: true,
                add_expenses: false,
                edit_expenses: false,
                delete_expenses: false,
                view_goals: true,
                manage_goals: false,
                view_budgets: true,
                manage_budgets: false,
                approve_expenses: false,
                manage_members: false,
                view_reports: true
            }
        };
        
        return permissions[role] || permissions.viewer;
    }
}

module.exports = new SharedSpaceService();
