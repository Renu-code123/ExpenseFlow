const FXRevaluation = require('../models/FXRevaluation');
const UnrealizedGainLoss = require('../models/UnrealizedGainLoss');
const Account = require('../models/Account');
const DebtAccount = require('../models/DebtAccount');
const TreasuryVault = require('../models/TreasuryVault');
const Transaction = require('../models/Transaction');
const currencyService = require('./currencyService');

class RevaluationEngine {
    /**
     * Run comprehensive FX revaluation across all foreign currency accounts
     */
    async runRevaluation(userId, baseCurrency = 'INR', revaluationType = 'automated') {
        const revaluationId = `REV-${Date.now()}`;
        const revaluationDate = new Date();

        // Get all foreign currency accounts
        const accounts = await this.getForeignCurrencyAccounts(userId, baseCurrency);

        if (accounts.length === 0) {
            throw new Error('No foreign currency accounts found for revaluation');
        }

        // Get current exchange rates
        const currencies = [...new Set(accounts.map(a => a.currency))];
        const exchangeRates = await this.getCurrentExchangeRates(currencies, baseCurrency);

        // Perform revaluation for each account
        const revaluationItems = [];

        for (const account of accounts) {
            const currentRate = exchangeRates.find(r => r.currency === account.currency);

            if (!currentRate) {
                console.warn(`No exchange rate found for ${account.currency}`);
                continue;
            }

            const item = await this.revalueAccount(account, currentRate.rate, baseCurrency);
            if (item) {
                revaluationItems.push(item);
            }
        }

        // Create revaluation record
        const revaluation = new FXRevaluation({
            userId,
            revaluationId,
            revaluationDate,
            baseCurrency,
            revaluationType,
            items: revaluationItems,
            exchangeRates,
            performedBy: userId,
            status: 'completed'
        });

        await revaluation.save();

        // Update unrealized gain/loss positions
        await this.updateUnrealizedPositions(userId, revaluationItems, revaluationDate);

        return revaluation;
    }

    /**
     * Get all foreign currency accounts for a user
     */
    async getForeignCurrencyAccounts(userId, baseCurrency) {
        const accounts = [];

        // Get regular accounts
        const regularAccounts = await Account.find({
            userId,
            currency: { $ne: baseCurrency },
            balance: { $ne: 0 }
        });

        accounts.push(...regularAccounts.map(a => ({
            accountId: a._id,
            accountType: 'Account',
            accountName: a.accountName,
            currency: a.currency,
            balance: a.balance,
            originalRate: a.exchangeRate || 1
        })));

        // Get debt accounts
        const debtAccounts = await DebtAccount.find({
            userId,
            currency: { $ne: baseCurrency },
            outstandingBalance: { $ne: 0 }
        });

        accounts.push(...debtAccounts.map(a => ({
            accountId: a._id,
            accountType: 'DebtAccount',
            accountName: a.accountName,
            currency: a.currency,
            balance: a.outstandingBalance,
            originalRate: a.exchangeRate || 1
        })));

        // Get treasury vaults if they exist
        try {
            const vaults = await TreasuryVault.find({
                userId,
                currency: { $ne: baseCurrency },
                balance: { $ne: 0 }
            });

            accounts.push(...vaults.map(v => ({
                accountId: v._id,
                accountType: 'TreasuryVault',
                accountName: v.vaultName,
                currency: v.currency,
                balance: v.balance,
                originalRate: v.exchangeRate || 1
            })));
        } catch (err) {
            // TreasuryVault model might not exist
            console.log('TreasuryVault model not available');
        }

        return accounts;
    }

    /**
     * Get current exchange rates for multiple currencies
     */
    async getCurrentExchangeRates(currencies, baseCurrency) {
        const rates = [];

        for (const currency of currencies) {
            try {
                const rate = await currencyService.getExchangeRate(currency, baseCurrency);
                rates.push({
                    currency,
                    rate: rate.rate,
                    source: rate.source || 'currencyService',
                    timestamp: new Date()
                });
            } catch (err) {
                console.error(`Failed to get rate for ${currency}:`, err.message);
                // Use fallback rate of 1
                rates.push({
                    currency,
                    rate: 1,
                    source: 'fallback',
                    timestamp: new Date()
                });
            }
        }

        return rates;
    }

    /**
     * Revalue a single account
     */
    async revalueAccount(account, newRate, baseCurrency) {
        const originalAmount = account.balance;
        const originalRate = account.originalRate;

        // Calculate base currency amounts
        const baseAmountOriginal = originalAmount * originalRate;
        const baseAmountNew = originalAmount * newRate;

        // Calculate gain/loss
        const gainLoss = baseAmountNew - baseAmountOriginal;

        // Skip if no change
        if (Math.abs(gainLoss) < 0.01) {
            return null;
        }

        return {
            accountId: account.accountId,
            accountType: account.accountType,
            accountName: account.accountName,
            currency: account.currency,
            originalAmount,
            originalRate,
            newRate,
            baseAmount: baseAmountOriginal,
            revaluedAmount: baseAmountNew,
            gainLoss,
            gainLossType: gainLoss >= 0 ? 'gain' : 'loss'
        };
    }

    /**
     * Update unrealized gain/loss positions
     */
    async updateUnrealizedPositions(userId, revaluationItems, asOfDate) {
        for (const item of revaluationItems) {
            // Find existing position
            let position = await UnrealizedGainLoss.findOne({
                userId,
                accountId: item.accountId,
                accountType: item.accountType,
                status: 'active'
            });

            if (position) {
                // Update existing position
                position.currentRate = item.newRate;
                position.asOfDate = asOfDate;
                position.lastRevaluationDate = asOfDate;

                // Add to rate history
                position.rateHistory.push({
                    rate: item.newRate,
                    date: asOfDate,
                    source: 'revaluation'
                });

                await position.save();
            } else {
                // Create new position
                position = new UnrealizedGainLoss({
                    userId,
                    accountId: item.accountId,
                    accountType: item.accountType,
                    accountName: item.accountName,
                    currency: item.currency,
                    originalAmount: item.originalAmount,
                    originalRate: item.originalRate,
                    currentRate: item.newRate,
                    asOfDate,
                    lastRevaluationDate: asOfDate,
                    rateHistory: [{
                        rate: item.newRate,
                        date: asOfDate,
                        source: 'revaluation'
                    }]
                });

                await position.save();
            }
        }
    }

    /**
     * Get revaluation dashboard data
     */
    async getRevaluationDashboard(userId) {
        // Get latest revaluation
        const latestRevaluation = await FXRevaluation.findOne({
            userId,
            status: 'completed'
        }).sort({ revaluationDate: -1 });

        // Get all active unrealized positions
        const unrealizedPositions = await UnrealizedGainLoss.find({
            userId,
            status: 'active'
        }).sort({ unrealizedGainLoss: -1 });

        // Calculate totals
        const totalUnrealizedGain = unrealizedPositions
            .filter(p => p.gainLossType === 'gain')
            .reduce((sum, p) => sum + Math.abs(p.unrealizedGainLoss), 0);

        const totalUnrealizedLoss = unrealizedPositions
            .filter(p => p.gainLossType === 'loss')
            .reduce((sum, p) => sum + Math.abs(p.unrealizedGainLoss), 0);

        // Get revaluation history (last 12 months)
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

        const revaluationHistory = await FXRevaluation.find({
            userId,
            status: 'completed',
            revaluationDate: { $gte: twelveMonthsAgo }
        }).sort({ revaluationDate: 1 });

        // Currency exposure breakdown
        const currencyExposure = this.calculateCurrencyExposure(unrealizedPositions);

        return {
            latestRevaluation: latestRevaluation ? {
                date: latestRevaluation.revaluationDate,
                netGainLoss: latestRevaluation.summary.netGainLoss,
                totalGain: latestRevaluation.summary.totalGain,
                totalLoss: latestRevaluation.summary.totalLoss,
                accountsRevalued: latestRevaluation.summary.totalAccounts
            } : null,
            unrealizedPositions: {
                total: unrealizedPositions.length,
                totalGain: totalUnrealizedGain,
                totalLoss: totalUnrealizedLoss,
                netPosition: totalUnrealizedGain - totalUnrealizedLoss,
                positions: unrealizedPositions
            },
            revaluationHistory: revaluationHistory.map(r => ({
                date: r.revaluationDate,
                netGainLoss: r.summary.netGainLoss,
                accountsRevalued: r.summary.totalAccounts
            })),
            currencyExposure
        };
    }

    /**
     * Calculate currency exposure breakdown
     */
    calculateCurrencyExposure(positions) {
        const exposure = {};

        for (const position of positions) {
            if (!exposure[position.currency]) {
                exposure[position.currency] = {
                    currency: position.currency,
                    totalExposure: 0,
                    unrealizedGain: 0,
                    unrealizedLoss: 0,
                    accountCount: 0
                };
            }

            exposure[position.currency].totalExposure += position.baseAmountCurrent;
            exposure[position.currency].accountCount++;

            if (position.gainLossType === 'gain') {
                exposure[position.currency].unrealizedGain += Math.abs(position.unrealizedGainLoss);
            } else if (position.gainLossType === 'loss') {
                exposure[position.currency].unrealizedLoss += Math.abs(position.unrealizedGainLoss);
            }
        }

        return Object.values(exposure);
    }

    /**
     * Get historical revaluation report
     */
    async getRevaluationReport(userId, startDate, endDate) {
        const revaluations = await FXRevaluation.find({
            userId,
            status: 'completed',
            revaluationDate: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        }).sort({ revaluationDate: 1 });

        const totalGain = revaluations.reduce((sum, r) => sum + r.summary.totalGain, 0);
        const totalLoss = revaluations.reduce((sum, r) => sum + r.summary.totalLoss, 0);

        return {
            period: { startDate, endDate },
            revaluationCount: revaluations.length,
            totalGain,
            totalLoss,
            netGainLoss: totalGain - totalLoss,
            revaluations
        };
    }

    /**
     * Realize gain/loss when account is closed or settled
     */
    async realizeGainLoss(userId, accountId, accountType) {
        const position = await UnrealizedGainLoss.findOne({
            userId,
            accountId,
            accountType,
            status: 'active'
        });

        if (!position) {
            return null;
        }

        position.isRealized = true;
        position.realizedDate = new Date();
        position.realizedAmount = position.unrealizedGainLoss;
        position.status = 'realized';

        await position.save();

        return position;
    }
}

module.exports = new RevaluationEngine();
