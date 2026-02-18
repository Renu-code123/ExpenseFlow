const Transaction = require('../models/Transaction');
const ruleEngine = require('./ruleEngine');
const User = require('../models/User');
const currencyService = require('./currencyService');
const budgetService = require('./budgetService');
const approvalService = require('./approvalService');
const intelligenceService = require('./intelligenceService');
const eventDispatcher = require('./eventDispatcher');

class TransactionService {
    /**
     * Entry point for transaction creation
     */
    async createTransaction(rawData, userId, io) {
        // Stage 1: Pre-processing & Persistence
        const transaction = await this._persistTransaction(rawData, userId);

        // Stage 2: Asynchronous Multi-Stage Pipeline
        this._runProcessingPipeline(transaction, userId, io).catch(err => {
            console.error(`[TransactionService] Critical failure in pipeline for ${transaction._id}:`, err);
        });

        return transaction;
    }

    /**
     * Initial persistence to ensure data is saved before heavy processing
     */
    async _persistTransaction(rawData, userId) {
        const user = await User.findById(userId);

        // Initial Enrichment
        const finalData = {
            ...rawData,
            user: userId,
            addedBy: userId,
            status: 'pending',
            originalAmount: rawData.amount,
            originalCurrency: rawData.currency || user.preferredCurrency,
            kind: rawData.type || 'expense'
        };

        const transaction = new Transaction(finalData);
        await transaction.save();
        if (typeof transaction.logStep === 'function') {
            await transaction.logStep('persistence', 'success', 'Transaction record created in pending state');
        }

        return transaction;
    }

    /**
     * The core pipeline logic
     */
    async _runProcessingPipeline(transaction, userId, io) {
        try {
            if (typeof transaction.logStep === 'function') {
                await transaction.logStep('pipeline', 'processing', 'Starting asynchronous processing pipeline');
            }
            transaction.status = 'processing';
            await transaction.save();

            // 1. Rule Engine Processing
            const { modifiedData, appliedRules } = await ruleEngine.processTransaction(transaction.toObject(), userId);
            Object.assign(transaction, modifiedData);
            transaction.appliedRules = appliedRules;
            if (typeof transaction.logStep === 'function') {
                await transaction.logStep('rules', 'success', `Applied ${appliedRules.length} rules`);
            }

            // 2. Currency Conversion & Forex Metadata
            if (transaction.originalCurrency !== (await this._getUserCurrency(userId))) {
                await this._handleCurrencyConversion(transaction, userId);
            } else {
                transaction.forexMetadata = { rateAtTransaction: 1, rateSource: 'native', isHistoricallyAccurate: true };
            }

            // 3. Approvals Logic
            if (transaction.workspace) {
                await this._handleApprovals(transaction, userId);
            }

            // 4. Final Validation & State Transition
            transaction.status = 'validated';
            if (typeof transaction.logStep === 'function') {
                await transaction.logStep('finalization', 'success', 'Transaction successfully validated and indexed');
            }
            await transaction.save();

            // 5. Post-Processing Events (Budgets, Goals, Intelligence)
            await this._dispatchEvents(transaction, userId, io);

        } catch (error) {
            if (typeof transaction.logStep === 'function') {
                await transaction.logStep('pipeline', 'failed', 'Processing aborted due to error', { error: error.message });
            }
            throw error;
        }
    }

    async _handleCurrencyConversion(transaction, userId) {
        try {
            const user = await User.findById(userId);
            const conversion = await currencyService.convertCurrency(
                transaction.originalAmount,
                transaction.originalCurrency,
                user.preferredCurrency
            );

            transaction.convertedAmount = conversion.convertedAmount;
            transaction.convertedCurrency = user.preferredCurrency;
            transaction.exchangeRate = conversion.exchangeRate;
            transaction.forexMetadata = {
                rateAtTransaction: conversion.exchangeRate,
                rateSource: 'automated',
                lastRevaluedAt: new Date(),
                isHistoricallyAccurate: true
            };
            if (typeof transaction.logStep === 'function') {
                await transaction.logStep('currency', 'success', `Converted to ${user.preferredCurrency} at ${conversion.exchangeRate}`);
            }
        } catch (err) {
            if (typeof transaction.logStep === 'function') {
                await transaction.logStep('currency', 'failed', 'Currency conversion failed, using fallback');
            }
            transaction.forexMetadata = { rateAtTransaction: 0, rateSource: 'failed', isHistoricallyAccurate: false };
        }
    }

    async _handleApprovals(transaction, userId) {
        const requiresApproval = await approvalService.requiresApproval(transaction, transaction.workspace);
        if (requiresApproval) {
            const workflow = await approvalService.submitForApproval(transaction._id, userId);
            transaction.status = 'pending_approval';
            transaction.approvalWorkflow = workflow._id;
            if (typeof transaction.logStep === 'function') {
                await transaction.logStep('approval', 'success', 'Sent to approval workflow');
            }
        }
    }

    async _dispatchEvents(transaction, userId, io) {
        // Budget & Goal Updates via Event Dispatcher
        const amountForImpact = transaction.convertedAmount || transaction.amount;

        eventDispatcher.emit('transaction:validated', { transaction, userId });

        // Intelligence & Scoring (Non-blocking)
        setImmediate(async () => {
            try {
                await intelligenceService.calculateBurnRate(userId, {
                    categoryId: transaction.category,
                    workspaceId: transaction.workspace
                });
                const wellnessService = require('./wellnessService');
                await wellnessService.calculateHealthScore(userId, { timeWindow: 30 });
            } catch (err) {
                console.error('[TransactionService] Async event dispatch error:', err);
            }
        });

        // WebSocket Notify
        if (io) {
            io.to(`user_${userId}`).emit('transaction_updated', {
                id: transaction._id,
                status: transaction.status,
                displayAmount: amountForImpact
            });
        }
    }

    async _getUserCurrency(userId) {
        const user = await User.findById(userId);
        return user.preferredCurrency;
    }
}

module.exports = new TransactionService();
