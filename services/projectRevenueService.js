const Project = require('../models/Project');
const Transaction = require('../models/Transaction');

class ProjectRevenueService {
    /**
     * Calculate Project Budget Burn Rate & Profitability
     */
    async getProjectFinancials(projectId) {
        const project = await Project.findById(projectId);
        if (!project) throw new Error('Project not found');

        const expenses = await Transaction.find({
            projectId,
            type: 'expense'
        });

        const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
        const billableExpenses = expenses.filter(e => e.billing && e.billing.isBillable);

        const totalBillable = billableExpenses.reduce((sum, e) => {
            const markup = e.billing.markupOverride || project.markupPercentage;
            return sum + (e.amount * (1 + markup / 100));
        }, 0);

        const margin = totalBillable - totalExpenses;
        const burnRate = (totalExpenses / project.budget.total) * 100;

        return {
            projectName: project.name,
            budget: project.budget.total,
            totalExpenses,
            totalBillable,
            profitMargin: margin,
            burnRatePercentage: burnRate,
            isOverBudget: totalExpenses > project.budget.total
        };
    }

    /**
     * Get Projects with financial health status
     */
    async getAllProjectFinancials(userId) {
        const projects = await Project.find({ userId });
        const summaries = [];
        for (const p of projects) {
            summaries.push(await this.getProjectFinancials(p._id));
        }
        return summaries;
    }
}

module.exports = new ProjectRevenueService();
