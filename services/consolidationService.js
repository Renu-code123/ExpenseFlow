const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Workspace = require('../models/Workspace');
const forexService = require('./forexService');
const CurrencyMath = require('../utils/currencyMath');

/**
 * Consolidation Service
 * Issue #629: Consolidated Multi-Entity Workspace Integration
 * Handles data merging and hierarchical financial reporting
 */

class ConsolidationService {
    /**
     * Get a consolidated financial report for a workspace and all its children
     * @param {String} workspaceId 
     * @param {Object} options { startDate, endDate, baseCurrency }
     */
    async getConsolidatedReport(workspaceId, options = {}) {
        const {
            startDate,
            endDate = new Date(),
            baseCurrency = 'USD'
        } = options;

        // 1. Fetch the hierarchy
        const hierarchy = await this.getWorkspaceHierarchy(workspaceId);
        const allWorkspaceIds = this._flattenHierarchy(hierarchy);

        // 2. Fetch all transactions for this cluster
        const transactions = await Transaction.find({
            workspace: { $in: allWorkspaceIds },
            date: { $gte: startDate, $lte: endDate }
        }).populate('workspace', 'name type');

        // 3. Consolidate data
        const summary = {
            totalIncome: 0,
            totalExpenses: 0,
            netFlow: 0,
            byWorkspace: {},
            byCategory: {},
            workspaceCount: allWorkspaceIds.length,
            transactionCount: transactions.length
        };

        for (const tx of transactions) {
            // Convert to base currency if needed
            let amountInBase = tx.convertedAmount || tx.amount;
            if (tx.convertedCurrency !== baseCurrency) {
                const conversion = await forexService.convertRealTime(
                    tx.amount,
                    tx.originalCurrency,
                    baseCurrency
                );
                amountInBase = conversion.convertedAmount;
            }

            const wsId = tx.workspace._id.toString();
            const wsName = tx.workspace.name;

            // Group by Workspace
            if (!summary.byWorkspace[wsId]) {
                summary.byWorkspace[wsId] = {
                    id: wsId,
                    name: wsName,
                    type: tx.workspace.type,
                    income: 0,
                    expenses: 0,
                    transactionCount: 0
                };
            }

            const wsStats = summary.byWorkspace[wsId];
            wsStats.transactionCount++;

            if (tx.type === 'income') {
                wsStats.income += amountInBase;
                summary.totalIncome += amountInBase;
            } else if (tx.type === 'expense') {
                wsStats.expenses += amountInBase;
                summary.totalExpenses += amountInBase;
            }

            // Group by Category
            if (!summary.byCategory[tx.category]) {
                summary.byCategory[tx.category] = 0;
            }
            summary.byCategory[tx.category] += (tx.type === 'expense' ? amountInBase : 0);
        }

        summary.netFlow = summary.totalIncome - summary.totalExpenses;

        // Format rounding
        summary.totalIncome = CurrencyMath.round(summary.totalIncome);
        summary.totalExpenses = CurrencyMath.round(summary.totalExpenses);
        summary.netFlow = CurrencyMath.round(summary.netFlow);

        return {
            rootWorkspaceId: workspaceId,
            baseCurrency,
            hierarchy,
            summary,
            timestamp: new Date()
        };
    }

    /**
     * Get hierarchical structure of workspaces
     */
    async getWorkspaceHierarchy(rootId) {
        const workspace = await Workspace.findById(rootId).lean();
        if (!workspace) return null;

        const children = await Workspace.find({ parentWorkspace: rootId }).lean();
        const hierarchy = {
            ...workspace,
            subWorkspaces: []
        };

        for (const child of children) {
            const childHierarchy = await this.getWorkspaceHierarchy(child._id);
            hierarchy.subWorkspaces.push(childHierarchy);
        }

        return hierarchy;
    }

    /**
     * Recursively list all workspace IDs in a hierarchy
     */
    _flattenHierarchy(node) {
        let ids = [node._id.toString()];
        if (node.subWorkspaces && node.subWorkspaces.length > 0) {
            for (const child of node.subWorkspaces) {
                ids = ids.concat(this._flattenHierarchy(child));
            }
        }
        return ids;
    }

    /**
     * Batch update permissions across a workspace cluster
     */
    async cascadePermissions(rootId, userId, role, permissions = []) {
        const hierarchy = await this.getWorkspaceHierarchy(rootId);
        const allIds = this._flattenHierarchy(hierarchy);

        const results = {
            updated: 0,
            skipped: 0
        };

        for (const wsId of allIds) {
            const ws = await Workspace.findById(wsId);
            if (ws && ws.inheritanceSettings.inheritMembers) {
                const member = ws.members.find(m => m.user.toString() === userId.toString());
                if (member) {
                    member.role = role;
                    member.permissions = permissions;
                } else {
                    ws.members.push({
                        user: userId,
                        role,
                        permissions,
                        status: 'active'
                    });
                }
                await ws.save();
                results.updated++;
            } else {
                results.skipped++;
            }
        }

        return results;
    }
}

module.exports = new ConsolidationService();
