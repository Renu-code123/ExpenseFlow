const expenseRepository = require('../repositories/expenseRepository');
const userRepository = require('../repositories/userRepository');
const Policy = require('../models/Policy');
const ruleEngine = require('./ruleEngine');
const currencyService = require('./currencyService');
const budgetService = require('./budgetService');
const approvalService = require('./approvalService');
const intelligenceService = require('./intelligenceService');
const categorizationEngine = require('./categorizationEngine');
const merchantLearningService = require('./merchantLearningService');
const ledgerService = require('./ledgerService');

// Wrapper for backward compatibility
class ExpenseService {
    async createExpense(rawData, userId, io) {
        const user = await userRepository.findById(userId);

        // 1. Process rules (Triggers & Actions) - Legacy Rule Engine
        let { modifiedData, appliedRules } = await ruleEngine.processTransaction(rawData, userId);

        // 2. Smart Categorization Engine (Intelligence Layer)
        await categorizationEngine.applyToTransaction({
            user: userId,
            merchant: modifiedData.merchant || '',
            description: modifiedData.description || '',
            amount: modifiedData.amount,
            get category() { return modifiedData.category; },
            set category(val) { modifiedData.category = val; },
            get tags() { return modifiedData.tags; },
            set tags(val) { modifiedData.tags = val; }
        });

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

        // 4. Handle Governance Policies (Workspace only)
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
        const expense = await expenseRepository.create(finalData);

        // Issue #738: Immutable Ledger Event
        const event = await ledgerService.recordEvent(
            expense._id,
            'CREATED',
            finalData,
            userId
        );

        // Update sequence in main document
        await expenseRepository.updateById(expense._id, {
            ledgerSequence: event.sequence,
            lastLedgerEventId: event._id
        });

        // 6. Handle Approvals (fallback for non-policy workspace expenses)
        if (finalData.workspace && !finalData.requiresApproval) {
            const requiresApproval = await approvalService.requiresApproval(finalData, finalData.workspace);
            if (requiresApproval) {
                const workflow = await approvalService.submitForApproval(expense._id, userId);
                await expenseRepository.updateById(expense._id, {
                    approvalStatus: 'pending_approval',
                    approvalWorkflow: workflow._id
                });
                expense.approvalStatus = 'pending_approval';
                expense.approvalWorkflow = workflow._id;
            }
        }

        // 7. Budget Alerts & Goals
        const amountForBudget = finalData.convertedAmount || finalData.amount;
        if (finalData.type === 'expense') {
            await budgetService.checkBudgetAlerts(userId);
        }
        await budgetService.updateGoalProgress(userId, finalData.type === 'expense' ? -amountForBudget : amountForBudget, finalData.category);

        // 8. Trigger Intelligence Analysis (async, non-blocking)
        setImmediate(async () => {
            try {
                const burnRate = await intelligenceService.calculateBurnRate(userId, {
                    categoryId: finalData.category,
                    workspaceId: finalData.workspace
                });

                if (io && burnRate.trend === 'increasing' && burnRate.trendPercentage > 15) {
                    io.to(`user_${userId}`).emit('burn_rate_alert', {
                        type: 'warning',
                        category: finalData.category,
                        burnRate: burnRate.dailyBurnRate,
                        trend: burnRate.trend,
                        trendPercentage: burnRate.trendPercentage
                    });
                }
            } catch (intelligenceError) {
                console.error('[ExpenseService] Intelligence analysis error:', intelligenceError);
            }
        });

        // 9. Trigger Wellness Score Recalculation (async, non-blocking)
        setImmediate(async () => {
            try {
                const wellnessService = require('./wellnessService');
                const healthScore = await wellnessService.calculateHealthScore(userId, { timeWindow: 30 });

                if (io && healthScore.previousScore) {
                    const scoreDiff = Math.abs(healthScore.score - healthScore.previousScore);
                    if (scoreDiff >= 5) {
                        io.to(`user_${userId}`).emit('health_score_update', {
                            score: healthScore.score,
                            grade: healthScore.grade,
                            change: healthScore.scoreChange,
                            trend: healthScore.trend
                        });
                    }
                }
            } catch (wellnessError) {
                console.error('[ExpenseService] Wellness calculation error:', wellnessError);
            }
        });

        // 10. Emit WebSocket
        if (io) {
            const socketData = expense.toObject ? expense.toObject() : expense;
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
        return await expenseRepository.findAll({
            workspace: workspaceId,
            approvalStatus: status
        }, { populate: { path: 'createdBy', select: 'name email' } });
    }
}

module.exports = new ExpenseService();
