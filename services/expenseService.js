const Expense = require('../models/Expense');
const Policy = require('../models/Policy');
const ruleEngine = require('./ruleEngine');
const User = require('../models/User');
const currencyService = require('./currencyService');
const budgetService = require('./budgetService');
const approvalService = require('./approvalService');
const intelligenceService = require('./intelligenceService');

class ExpenseService {
    async createExpense(rawData, userId, io) {
        const user = await User.findById(userId);

        // 1. Process rules (Triggers & Actions)
        const { modifiedData, appliedRules } = await ruleEngine.processTransaction(rawData, userId);

        // 2. Prepare final data
        const expenseCurrency = modifiedData.currency || user.preferredCurrency;
        const finalData = {
            ...modifiedData,
            user: userId,
            addedBy: userId,
            workspace: modifiedData.workspace || null,
            originalAmount: modifiedData.amount,
            originalCurrency: expenseCurrency,
            appliedRules: appliedRules // Track which rules were applied
        };

        // 3. Currency conversion
        if (expenseCurrency !== user.preferredCurrency) {
            try {
                const conversion = await currencyService.convertCurrency(
                    finalData.amount,
                    expenseCurrency,
                    user.preferredCurrency
                );
                finalData.convertedAmount = conversion.convertedAmount;
                finalData.convertedCurrency = user.preferredCurrency;
                finalData.exchangeRate = conversion.exchangeRate;
            } catch (err) {
                console.error('Conversion error in ExpenseService:', err);
            }
        }

        // 4. Save Expense
        const expense = new Expense(finalData);
        await expense.save();

        // 5. Handle Approvals
        if (finalData.workspace) {
        // 4. Check governance policies
        if (finalData.workspace) {
            const policies = await Policy.find({
                workspaceId: finalData.workspace,
                isActive: true,
                deletedAt: null
            }).sort({ priority: -1 });

            const transaction = {
                amount: finalData.amount,
                category: finalData.category,
                resourceType: 'expense',
                requesterRole: user.role,
                department: modifiedData.department || 'default'
            };

            let violations = [];
            let requiresApproval = false;

            for (const policy of policies) {
                if (policy.matchesTransaction(transaction)) {
                    violations.push({
                        policyId: policy._id,
                        policyName: policy.name,
                        riskScore: policy.riskScore,
                        approvalChain: policy.getApprovalChain()
                    });
                    requiresApproval = true;
                }
            }

            if (requiresApproval) {
                finalData.approvalStatus = 'pending_approval';
                finalData.requiresApproval = true;
                finalData.policyFlags = violations;
                finalData.fundHeld = true;

                // Create approval chain from first policy
                if (violations[0]) {
                    const approvalChain = violations[0].approvalChain;
                    finalData.approvals = approvalChain.map(stage => ({
                        stage: stage.stage,
                        approverId: stage.specificApprovers?.[0],
                        approverRole: stage.approverRole,
                        status: 'pending'
                    })).filter(a => a.approverId);
                }
            }
        }

        // 5. Save Expense
        const expense = new Expense(finalData);
        await expense.save();

        // 6. Handle Approvals (fallback for non-workspace expenses)
        if (finalData.workspace && !finalData.requiresApproval) {
            const requiresApproval = await approvalService.requiresApproval(finalData, finalData.workspace);
            if (requiresApproval) {
                const workflow = await approvalService.submitForApproval(expense._id, userId);
                expense.approvalStatus = 'pending_approval';
                expense.approvalWorkflow = workflow._id;
                await expense.save();
            }
        }

        // 7. Budget Alerts & Goals
        const amountForBudget = finalData.convertedAmount || finalData.amount;
        if (finalData.type === 'expense') {
            await budgetService.checkBudgetAlerts(userId);
        }
        await budgetService.updateGoalProgress(userId, finalData.type === 'expense' ? -amountForBudget : amountForBudget, finalData.category);

        // 8. Emit WebSocket
        if (io) {
            const socketData = expense.toObject();
            socketData.displayAmount = finalData.convertedAmount || expense.amount;
            socketData.displayCurrency = finalData.convertedCurrency || expenseCurrency;
            io.to(`user_${userId}`).emit('expense_created', socketData);
        }

        return expense;
    }

    /**
     * Get expenses by approval status
     */
    async getExpensesByStatus(workspaceId, status) {
        return await Expense.find({
            workspace: workspaceId,
            approvalStatus: status
        }).populate('createdBy', 'name email');
    }
}

module.exports = new ExpenseService();
