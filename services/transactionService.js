const Transaction = require('../models/Transaction');
const ruleEngine = require('./ruleEngine');
const User = require('../models/User');
const currencyService = require('./currencyService');
const budgetService = require('./budgetService');
const approvalService = require('./approvalService');
const intelligenceService = require('./intelligenceService');

class TransactionService {
    async createTransaction(rawData, userId, io) {
        const user = await User.findById(userId);

        // 1. Process rules (Triggers & Actions)
        const { modifiedData, appliedRules } = await ruleEngine.processTransaction(rawData, userId);

        // 2. Prepare final data
        const transactionCurrency = modifiedData.currency || user.preferredCurrency;
        const finalData = {
            ...modifiedData,
            user: userId,
            addedBy: userId,
            workspace: modifiedData.workspace || null,
            originalAmount: modifiedData.amount,
            originalCurrency: transactionCurrency,
            kind: modifiedData.type || 'expense', // Default to type or expense
            appliedRules: appliedRules // Track which rules were applied
        };

        // 3. Currency conversion
        if (transactionCurrency !== user.preferredCurrency) {
            try {
                const conversion = await currencyService.convertCurrency(
                    finalData.amount,
                    transactionCurrency,
                    user.preferredCurrency
                );
                finalData.convertedAmount = conversion.convertedAmount;
                finalData.convertedCurrency = user.preferredCurrency;
                finalData.exchangeRate = conversion.exchangeRate;
            } catch (err) {
                console.error('Conversion error in TransactionService:', err);
            }
        }

        // 4. Save Transaction
        const transaction = new Transaction(finalData);
        await transaction.save();

        // 5. Handle Approvals
        if (finalData.workspace) {
            const requiresApproval = await approvalService.requiresApproval(finalData, finalData.workspace);
            if (requiresApproval) {
                const workflow = await approvalService.submitForApproval(transaction._id, userId);
                transaction.status = 'pending_approval';
                transaction.approvalWorkflow = workflow._id;
                await transaction.save();
            }
        }

        // 6. Budget Alerts & Goals
        const amountForBudget = finalData.convertedAmount || finalData.amount;
        if (finalData.type === 'expense') {
            await budgetService.checkBudgetAlerts(userId);
        }
        await budgetService.updateGoalProgress(userId, finalData.type === 'expense' ? -amountForBudget : amountForBudget, finalData.category);

        // 7. Trigger Intelligence Analysis (async, non-blocking)
        setImmediate(async () => {
            try {
                const burnRate = await intelligenceService.calculateBurnRate(userId, {
                    categoryId: finalData.category,
                    workspaceId: finalData.workspace
                });

                // Emit burn rate update to client
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
                console.error('[TransactionService] Intelligence analysis error:', intelligenceError);
            }
        });

        // 8. Trigger Wellness Score Recalculation (async, non-blocking) - Issue #481
        setImmediate(async () => {
            try {
                const wellnessService = require('./wellnessService');
                const healthScore = await wellnessService.calculateHealthScore(userId, { timeWindow: 30 });

                // Emit health score update to client if score changed significantly
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
                console.error('[TransactionService] Wellness calculation error:', wellnessError);
            }
        });

        // 9. Emit WebSocket
        if (io) {
            const socketData = transaction.toObject();
            socketData.displayAmount = finalData.convertedAmount || transaction.amount;
            socketData.displayCurrency = finalData.convertedCurrency || transactionCurrency;
            // Emit as 'expense_created' for backward compatibility, and 'transaction_created' for new
            io.to(`user_${userId}`).emit('expense_created', socketData);
            io.to(`user_${userId}`).emit('transaction_created', socketData);
        }

        return transaction;
    }
}

module.exports = new TransactionService();
