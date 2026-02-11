const mongoose = require('mongoose');
const Account = require('../models/Account');
const NetWorthSnapshot = require('../models/NetWorthSnapshot');
const Transaction = require('../models/Transaction');
const forexService = require('./forexService');
const CurrencyMath = require('../utils/currencyMath');

class RevaluationService {
    /**
     * Generate revaluation report showing currency impact on net worth
     * Uses historical accuracy logic for precise reporting
     */
    async generateRevaluationReport(userId, baseCurrency = 'USD', startDate, endDate = new Date()) {
        if (!startDate) {
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
        }

        const snapshots = await NetWorthSnapshot.find({
            userId,
            date: { $gte: startDate, $lte: endDate }
        }).sort({ date: 1 });

        if (snapshots.length === 0) {
            return { userId, baseCurrency, message: 'No snapshots found', revaluations: [] };
        }

        const revaluations = [];
        for (let i = 1; i < snapshots.length; i++) {
            const prev = snapshots[i - 1];
            const curr = snapshots[i];

            const revaluation = await this._calculateDetailedRevaluation(prev, curr, baseCurrency);
            revaluations.push(revaluation);
        }

        const summary = this._compileRevaluationSummary(snapshots, revaluations);

        return {
            userId,
            baseCurrency,
            startDate,
            endDate,
            summary,
            revaluations,
            timestamp: new Date()
        };
    }

    /**
     * Calculate detailed FX impact between two snapshots with account-level granularity
     */
    async _calculateDetailedRevaluation(prev, curr, baseCurrency) {
        const impacts = [];
        let totalFxImpact = 0;

        for (const currAcc of curr.accounts) {
            const prevAcc = prev.accounts.find(a => a.accountId.toString() === currAcc.accountId.toString());

            if (prevAcc && currAcc.currency !== baseCurrency) {
                const oldRate = prevAcc.exchangeRate || 1;
                const newRate = currAcc.exchangeRate || 1;

                // FX Impact formula: Current Balance * (New Rate - Old Rate)
                const impactResult = CurrencyMath.calculateFxImpact(currAcc.balance, oldRate, newRate);

                impacts.push({
                    accountId: currAcc.accountId,
                    name: currAcc.name,
                    currency: currAcc.currency,
                    balance: currAcc.balance,
                    oldRate,
                    newRate,
                    impact: impactResult.impact,
                    percentage: impactResult.percentage
                });

                totalFxImpact += impactResult.impact;
            }
        }

        return {
            startDate: prev.date,
            endDate: curr.date,
            totalFxImpact: CurrencyMath.round(totalFxImpact),
            netWorthChange: curr.totalNetWorth - prev.totalNetWorth,
            accountImpacts: impacts
        };
    }

    /**
     * Retroactively update transaction exchange rates for a user/period
     * This is the "backfilling" engine
     */
    async revalueTransactions(userId, options = {}) {
        const {
            startDate,
            endDate = new Date(),
            currencies = [],
            baseCurrency = 'USD',
            dryRun = false
        } = options;

        const query = {
            user: userId,
            date: { $gte: startDate, $lte: endDate }
        };

        if (currencies.length > 0) {
            query.originalCurrency = { $in: currencies };
        }

        const transactions = await Transaction.find(query);
        const results = {
            total: transactions.length,
            updated: 0,
            skipped: 0,
            impact: 0,
            details: []
        };

        for (const tx of transactions) {
            try {
                const rateData = await forexService.getHistoricalRate(tx.originalCurrency, baseCurrency, tx.date);
                const newRate = rateData.rate;
                const oldRate = tx.exchangeRate || 1;

                if (!CurrencyMath.equals(newRate, oldRate)) {
                    const newConvertedAmount = CurrencyMath.convert(tx.originalAmount, newRate);
                    const impact = newConvertedAmount - (tx.convertedAmount || tx.amount);

                    results.impact += impact;
                    results.updated++;

                    if (!dryRun) {
                        // Store history
                        tx.revaluationHistory.push({
                            oldRate,
                            newRate,
                            oldConvertedAmount: tx.convertedAmount || tx.amount,
                            newConvertedAmount,
                            baseCurrency,
                            reason: options.reason || 'Retroactive historical revaluation'
                        });

                        tx.exchangeRate = newRate;
                        tx.convertedAmount = newConvertedAmount;
                        tx.convertedCurrency = baseCurrency;
                        tx.forexMetadata = {
                            ...tx.forexMetadata,
                            rateAtTransaction: newRate,
                            lastRevaluedAt: new Date(),
                            isHistoricallyAccurate: true,
                            rateSource: rateData.source
                        };

                        await tx.save();
                    }

                    results.details.push({
                        id: tx._id,
                        date: tx.date,
                        currency: tx.originalCurrency,
                        oldRate,
                        newRate,
                        impact
                    });
                } else {
                    results.skipped++;
                }
            } catch (error) {
                console.error(`[RevaluationService] Error revaluing transaction ${tx._id}:`, error);
            }
        }

        return results;
    }

    /**
     * Recalculate Net Worth snapshots based on corrected transaction data
     */
    async rebuildSnapshots(userId, baseCurrency = 'USD', days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        // Get all accounts once
        const accounts = await Account.find({ userId, isActive: true });

        // This would traditionally be run as a background task
        const results = {
            processedSnapshots: 0,
            snapshotsUpdated: 0
        };

        // For each day since startDate
        const tempDate = new Date(startDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        while (tempDate <= today) {
            try {
                // Fetch all transactions up to this date to determine balances
                // Optimized logic would use a running balance but for revaluation we need accuracy
                await this._rebuildSnapshotForDate(userId, accounts, new Date(tempDate), baseCurrency);
                results.snapshotsUpdated++;
                results.processedSnapshots++;
            } catch (error) {
                console.error(`[RevaluationService] Rebuild failed for ${tempDate.toISOString()}:`, error);
            }
            tempDate.setDate(tempDate.getDate() + 1);
        }

        return results;
    }

    /**
     * Private helper to rebuild a single day's snapshot
     */
    async _rebuildSnapshotForDate(userId, accounts, date, baseCurrency) {
        // Fetch exchange rates for this date
        const rates = new Map();
        for (const account of accounts) {
            if (account.currency !== baseCurrency && !rates.has(account.currency)) {
                const rateData = await forexService.getHistoricalRate(account.currency, baseCurrency, date);
                rates.set(account.currency, rateData.rate);
            }
        }

        // Logic to simulate historical balance would go here
        // For now, we'll interface with the existing createSnapshot static method
        // but passing the historical rates we just fetched
        return NetWorthSnapshot.createSnapshot(userId, accounts, rates, baseCurrency);
    }

    /**
     * Calculate current unrealized P&L for all active user accounts
     * Enhanced with historical accuracy tracking
     */
    async calculateCurrentUnrealizedPL(userId, baseCurrency = 'USD') {
        const accounts = await Account.find({
            userId,
            isActive: true,
            currency: { $ne: baseCurrency }
        });

        const plData = [];
        let totalUnrealizedPL = 0;

        for (const account of accounts) {
            try {
                const currentRateData = await forexService.getRealTimeRate(account.currency, baseCurrency);
                
                // For acquisition rate, we now look at historical transaction metadata if available
                // Otherwise fallback to opening balance approximation
                let acquisitionRate = account.openingBalance > 0 ? (account.balance / account.openingBalance) : currentRateData.rate;
                
                // Advanced: Try to find the weighted average rate from revaluationHistory of recent transactions
                const recentTx = await Transaction.find({ 
                    user: userId, 
                    originalCurrency: account.currency,
                    'forexMetadata.isHistoricallyAccurate': true
                }).sort({ date: -1 }).limit(20);

                if (recentTx.length > 0) {
                    const lots = recentTx.map(t => ({ amount: t.originalAmount, rate: t.exchangeRate }));
                    acquisitionRate = CurrencyMath.calculateWeightedAverageRate(lots);
                }

                const pl = await forexService.calculateUnrealizedPL({
                    currency: account.currency,
                    amount: account.balance,
                    acquisitionRate,
                    baseCurrency
                });

                plData.push({
                    accountId: account._id,
                    accountName: account.name,
                    ...pl
                });

                totalUnrealizedPL += pl.unrealizedPL;
            } catch (error) {
                console.error(`[RevaluationService] P&L Error for account ${account._id}:`, error);
            }
        }

        return {
            userId,
            baseCurrency,
            accounts: plData,
            totalUnrealizedPL: CurrencyMath.round(totalUnrealizedPL),
            timestamp: new Date()
        };
    }

    /**
     * Generate comprehensive currency risk assessment
     */
    async generateRiskAssessment(userId, baseCurrency = 'USD') {
        const pl = await this.calculateCurrentUnrealizedPL(userId, baseCurrency);
        const exposures = await this._getExposureData(userId, baseCurrency);

        const riskScore = this._calculateRiskScore(exposures, pl);
        
        return {
            userId,
            baseCurrency,
            riskScore,
            riskLevel: riskScore > 70 ? 'high' : riskScore > 30 ? 'medium' : 'low',
            exposures,
            unrealizedPL: pl.totalUnrealizedPL,
            recommendations: this._generateRecommendations(riskScore, exposures),
            timestamp: new Date()
        };
    }

    async _getExposureData(userId, baseCurrency) {
        const accounts = await Account.find({ userId, isActive: true });
        const exposureMap = new Map();
        let totalValue = 0;

        for (const account of accounts) {
            const rate = account.currency === baseCurrency ? 1 : (await forexService.getRealTimeRate(account.currency, baseCurrency)).rate;
            const value = account.balance * rate;
            
            if (!exposureMap.has(account.currency)) {
                exposureMap.set(account.currency, { currency: account.currency, value: 0, accounts: [] });
            }
            
            const exp = exposureMap.get(account.currency);
            exp.value += value;
            exp.accounts.push({ id: account._id, name: account.name });
            totalValue += value;
        }

        return Array.from(exposureMap.values()).map(e => ({
            ...e,
            percentage: totalValue > 0 ? (e.value / totalValue) * 100 : 0
        })).sort((a, b) => b.value - a.value);
    }

    _calculateRiskScore(exposures, pl) {
        let score = 0;
        // Concentration risk (Weight: 50%)
        const maxConcentration = Math.max(...exposures.map(e => e.currency !== 'USD' ? e.percentage : 0));
        score += Math.min(50, maxConcentration / 2);

        // Loss risk (Weight: 50%)
        if (pl.totalUnrealizedPL < 0) {
            score += Math.min(50, Math.abs(pl.totalUnrealizedPL) / 100);
        }

        return Math.round(score);
    }

    _generateRecommendations(score, exposures) {
        const recs = [];
        if (score > 70) recs.push('High concentration in volatile currencies. Consider hedging or diversifying.');
        if (exposures.some(e => e.percentage > 40 && e.currency !== 'USD')) {
            recs.push(`Heavy exposure to ${exposures.find(e => e.percentage > 40).currency}. Consider reducing this position.`);
        }
        return recs.length > 0 ? recs : ['Portfolio risk is within acceptable parameters.'];
    }

    _compileRevaluationSummary(snapshots, revaluations) {
        const totalImpact = revaluations.reduce((sum, r) => sum + r.totalFxImpact, 0);
        const initialNW = snapshots[0].totalNetWorth;
        const finalNW = snapshots[snapshots.length - 1].totalNetWorth;
        const totalChange = finalNW - initialNW;

        return {
            initialNetWorth: initialNW,
            finalNetWorth: finalNW,
            totalChange: CurrencyMath.round(totalChange),
            fxImpact: CurrencyMath.round(totalImpact),
            realGrowth: CurrencyMath.round(totalChange - totalImpact),
            fxContributionPercentage: initialNW !== 0 ? (totalImpact / Math.abs(totalChange)) * 100 : 0
        };
    }
}

module.exports = new RevaluationService();
