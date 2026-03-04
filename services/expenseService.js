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

        // 4. Handle Hierarchical Governance Policies (#757)
        if (finalData.workspace) {
            const policyResolver = require('./policyResolver');
            const riskScoring = require('../utils/riskScoring');

            const effectiveRule = await policyResolver.getRuleForTransaction(finalData, finalData.workspace);
            let violations = [];
            let requiresApproval = false;

            if (effectiveRule) {
                const risk = riskScoring.calculateScore(finalData, effectiveRule);
                const severity = riskScoring.getSeverity(risk);

                if (effectiveRule.action !== 'allow' || risk > 30) {
                    violations.push({
                        policyLevel: effectiveRule.level,
                        riskScore: risk,
                        severity,
                        category: effectiveRule.category
                    });
                    requiresApproval = true;
                }
            }

            if (requiresApproval) {
                finalData.approvalStatus = 'pending_approval';
                finalData.requiresApproval = true;
                finalData.policyFlags = violations;
                finalData.fundHeld = true;

                // Hierarchical escalation
                finalData.approvals = [{
                    stage: 1,
                    approverRole: violations[0].riskScore > 70 ? 'admin' : 'manager',
                    status: 'pending'
                }];
            }
        }

        // 5. Save Expense (with Journaling support for collaborative workspaces)
        const isDeferred = !!finalData.workspace;
        const expense = await expenseRepository.create(finalData, {
            deferred: isDeferred,
            workspaceId: finalData.workspace,
            userId
        });

        // 6. Handle deferred result
        if (expense.deferred) {
            // Optimistic response for collaborative environments
            if (io) {
                io.to(`user_${userId}`).emit('expense_journaled', {
                    entityId: expense.journalId,
                    status: 'optimistic_pending'
                });
            }
            return {
                ...finalData,
                _id: expense.journalId,
                status: 'journaled',
                optimistic: true
            };
        }

        // Issue #738: Immutable Ledger Event
        const event = await ledgerService.recordEvent(
            expense._id,
            'CREATED',
            finalData,
            userId,
            finalData.workspace
        );

        // Issue #768: Treasury Liquidity Settlement
        if (finalData.workspace) {
            const treasuryRepository = require('../repositories/treasuryRepository');
            const operatingNode = await treasuryRepository.findNode(finalData.workspace, 'OPERATING');
            if (operatingNode) {
                // Link expense to the fund node
                finalData.treasuryNodeId = operatingNode._id;

                // Issue #866: Semantic Financial Lineage Attestation
                const eligibilityTraversalEngine = require('./eligibilityTraversalEngine');
                const lineageResult = await eligibilityTraversalEngine.attestAndConsume(
                    operatingNode._id,
                    finalData.amount,
                    finalData.category.name || 'GENERAL',
                    finalData.tags || []
                );

                // Record fund reservation in ledger with Source-DNA lineage
                await ledgerService.recordLineageEvent(
                    operatingNode._id,
                    'FUNDS_RESERVED',
                    { amount: finalData.amount, expenseId: expense._id },
                    userId,
                    finalData.workspace,
                    lineageResult.selectedFragments
                );

                // Issue #843: Autonomous Tax Optimization Hook
                if (finalData.taxMetadata && finalData.taxMetadata.isDeductible) {
                    await ledgerService.recordEvent(
                        expense._id,
                        'TAX_DEDUCTION_ESTIMATED',
                        finalData.taxMetadata,
                        userId,
                        finalData.workspace,
                        event._id,
                        'TAX_OPTIMIZATION_NODE'
                    );
                }
            }
        }

        // Update sequence in main document
        await expenseRepository.updateById(expense._id, {
            ledgerSequence: event.sequence,
            lastLedgerEventId: event._id
        });

        // Issue #756: Explicit Indexing for Search Discovery
        // This ensures categories and merchant data are immediately searchable
        const indexingEngine = require('./indexingEngine');
        setImmediate(() => {
            indexingEngine.indexEntity('EXPENSE', expense, userId, finalData.workspace);
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
