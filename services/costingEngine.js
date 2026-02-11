const Project = require('../models/Project');
const ProjectCosting = require('../models/ProjectCosting');
const Expense = require('../models/Expense');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');

class CostingEngine {
    async calculateProjectCosts(userId, projectId, period = null) {
        const project = await Project.findOne({ _id: projectId, userId });
        if (!project) throw new Error('Project not found');

        const dateFilter = period ? {
            $gte: new Date(period.startDate),
            $lte: new Date(period.endDate)
        } : { $exists: true };

        // 1. Calculate Expenses linked to Project
        // Note: Assuming Expense model has a projectId or tags mapping
        const expenses = await Expense.find({
            userId,
            $or: [
                { projectId: projectId },
                { tags: { $in: [project.name, project.code] } }
            ],
            date: dateFilter
        });

        const expenseBreakdown = {
            travel: 0,
            software: 0,
            hardware: 0,
            others: 0,
            total: 0
        };

        expenses.forEach(exp => {
            const cat = (exp.category || '').toLowerCase();
            if (cat.includes('travel')) expenseBreakdown.travel += exp.amount;
            else if (cat.includes('software')) expenseBreakdown.software += exp.amount;
            else if (cat.includes('hardware')) expenseBreakdown.hardware += exp.amount;
            else expenseBreakdown.others += exp.amount;
            expenseBreakdown.total += exp.amount;
        });

        // 2. Calculate Labor Costs (Transactions or specific Labor logs)
        const laborTransactions = await Transaction.find({
            userId,
            $or: [
                { projectId: projectId },
                { description: { $regex: new RegExp(project.name, 'i') } }
            ],
            category: { $in: ['Salary', 'Freelance', 'Consultancy'] },
            date: dateFilter
        });

        const laborCosts = laborTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

        // 3. Revenue (Transactions of type 'income' linked to project)
        const revenueTransactions = await Transaction.find({
            userId,
            projectId: projectId,
            type: 'income',
            date: dateFilter
        });

        const revenueAmount = revenueTransactions.reduce((sum, t) => sum + t.amount, 0);

        // 4. Calculate Metrics
        const totalCost = laborCosts + expenseBreakdown.total;
        const grossMargin = revenueAmount - totalCost;
        const netMarginPercentage = revenueAmount > 0 ? (grossMargin / revenueAmount) * 100 : 0;
        const roi = totalCost > 0 ? (grossMargin / totalCost) * 100 : 0;

        // 5. Forecasting (Cost to Complete)
        // Simple linear extrapolation or budget-based
        const budgetRemaining = Math.max(0, project.budget.total - totalCost);
        const burnRate = totalCost / (this.getDaysDiff(project.timeline.startDate, new Date()) || 1);
        const estCostToComplete = budgetRemaining; // simplified

        // Update or Create Costing Record
        const costingData = {
            projectId,
            userId,
            period: period || {
                startDate: project.timeline.startDate,
                endDate: new Date()
            },
            costs: {
                labor: { internal: laborCosts, contractual: 0, hours: 0 },
                expenses: expenseBreakdown,
                overhead: totalCost * 0.1 // 10% overhead assumption
            },
            revenue: {
                billed: revenueAmount,
                accrued: revenueAmount,
                unbilled: 0
            },
            metrics: {
                grossMargin,
                netMargin: netMarginPercentage,
                roi,
                efficiencyRatio: revenueAmount / (laborCosts || 1),
                burnRate
            },
            projections: {
                estimatedCostToComplete: estCostToComplete,
                projectedMarginAtCompletion: ((revenueAmount || project.billing.value) - (totalCost + estCostToComplete)),
                varianceAtCompletion: project.budget.total - (totalCost + estCostToComplete)
            },
            lastCalculationAt: new Date()
        };

        return await ProjectCosting.findOneAndUpdate(
            { projectId, userId, 'period.startDate': costingData.period.startDate },
            { $set: costingData },
            { upsers: true, new: true, upsert: true }
        );
    }

    getDaysDiff(d1, d2) {
        const diffTime = Math.abs(d2 - d1);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    async getROIMatrix(userId) {
        // Aggregate ROI across all projects for matrix visualization
        const costings = await ProjectCosting.find({ userId }).populate('projectId');

        return costings.map(c => ({
            projectName: c.projectId?.name || 'Unknown',
            roi: c.metrics.roi,
            margin: c.metrics.netMargin,
            cost: c.costs.labor.internal + c.costs.expenses.total,
            revenue: c.revenue.billed,
            status: c.projectId?.status
        }));
    }
}

module.exports = new CostingEngine();
