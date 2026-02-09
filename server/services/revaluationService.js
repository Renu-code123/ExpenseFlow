/**
 * Revaluation Service
 * Issue #521: Advanced Multi-Currency Intelligence & Forex Revaluation
 * Tracks currency fluctuations and their impact on net worth over time
 */

const mongoose = require('mongoose');
const Account = require('../models/Account');
const NetWorthSnapshot = require('../models/NetWorthSnapshot');
const currencyService = require('./currencyService');
const forexService = require('./forexService');

class RevaluationService {
    /**
     * Generate revaluation report showing currency impact on net worth
     * @param {String} userId 
     * @param {String} baseCurrency 
     * @param {Date} startDate 
     * @param {Date} endDate 
     */
    async generateRevaluationReport(userId, baseCurrency = 'USD', startDate, endDate = new Date()) {
        // Default to last 30 days if no start date
        if (!startDate) {
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
        }

        // Get all net worth snapshots in the date range
        const snapshots = await NetWorthSnapshot.find({
            userId,
            date: { $gte: startDate, $lte: endDate }
        }).sort({ date: 1 });

        if (snapshots.length === 0) {
            return {
                userId,
                baseCurrency,
                startDate,
                endDate,
                message: 'No snapshots found in date range',
                revaluations: []
            };
        }

        const revaluations = [];
        let previousSnapshot = null;

        for (const snapshot of snapshots) {
            if (previousSnapshot) {
                const revaluation = this._calculateSnapshotRevaluation(
                    previousSnapshot,
                    snapshot,
                    baseCurrency
                );
                revaluations.push(revaluation);
            }
            previousSnapshot = snapshot;
        }

        // Calculate total impact
        const totalImpact = revaluations.reduce((sum, r) => sum + r.fxImpact, 0);
        const initialNetWorth = snapshots[0].totalNetWorth;
        const finalNetWorth = snapshots[snapshots.length - 1].totalNetWorth;
        const totalChange = finalNetWorth - initialNetWorth;
        const fxAttributedPercentage = initialNetWorth !== 0 ?
            (totalImpact / Math.abs(totalChange)) * 100 : 0;

        return {
            userId,
            baseCurrency,
            startDate,
            endDate,
            summary: {
                initialNetWorth,
                finalNetWorth,
                totalChange,
                fxImpact: totalImpact,
                nonFxChange: totalChange - totalImpact,
                fxAttributedPercentage,
                snapshotsAnalyzed: snapshots.length
            },
            revaluations,
            currency: baseCurrency
        };
    }

    /**
     * Calculate FX impact between two snapshots
     */
    _calculateSnapshotRevaluation(previousSnapshot, currentSnapshot, baseCurrency) {
        // Group accounts by currency
        const currencyChanges = new Map();

        currentSnapshot.accounts.forEach(currentAcc => {
            const previousAcc = previousSnapshot.accounts.find(
                a => a.accountId && a.accountId.toString() === currentAcc.accountId.toString()
            );

            if (previousAcc && previousAcc.currency === currentAcc.currency) {
                const currency = currentAcc.currency;

                if (!currencyChanges.has(currency)) {
                    currencyChanges.set(currency, {
                        currency,
                        previousRate: previousAcc.exchangeRate || 1,
                        currentRate: currentAcc.exchangeRate || 1,
                        previousValue: 0,
                        currentValue: 0,
                        balanceChange: 0,
                        fxImpact: 0
                    });
                }

                const change = currencyChanges.get(currency);
                const balanceChange = currentAcc.balance - previousAcc.balance;

                // Calculate FX impact: (current balance * rate change)
                const rateChange = change.currentRate - change.previousRate;
                const fxImpact = currentAcc.balance * rateChange;

                change.previousValue += previousAcc.balanceInBaseCurrency || 0;
                change.currentValue += currentAcc.balanceInBaseCurrency || 0;
                change.balanceChange += balanceChange;
                change.fxImpact += fxImpact;
            }
        });

        const currencyImpacts = Array.from(currencyChanges.values());
        const totalFxImpact = currencyImpacts.reduce((sum, c) => sum + c.fxImpact, 0);

        return {
            startDate: previousSnapshot.date,
            endDate: currentSnapshot.date,
            previousNetWorth: previousSnapshot.totalNetWorth,
            currentNetWorth: currentSnapshot.totalNetWorth,
            netWorthChange: currentSnapshot.totalNetWorth - previousSnapshot.totalNetWorth,
            fxImpact: totalFxImpact,
            nonFxChange: (currentSnapshot.totalNetWorth - previousSnapshot.totalNetWorth) - totalFxImpact,
            currencyImpacts
        };
    }

    /**
     * Calculate current unrealized P&L for all user accounts
     * @param {String} userId 
     * @param {String} baseCurrency 
     */
    async calculateCurrentUnrealizedPL(userId, baseCurrency = 'USD') {
        const accounts = await Account.find({
            userId,
            isActive: true,
            currency: { $ne: baseCurrency } // Only foreign currency accounts
        });

        const plData = [];
        let totalUnrealizedPL = 0;

        for (const account of accounts) {
            try {
                // Get current rate
                const currentRateData = await forexService.getRealTimeRate(
                    account.currency,
                    baseCurrency
                );

                // Approximate acquisition rate from opening balance
                // In production, you'd track this more precisely
                const acquisitionRate = account.openingBalance > 0 ?
                    (account.balance / account.openingBalance) : currentRateData.rate;

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
                console.error(`[RevaluationService] Error calculating P&L for account ${account._id}:`, error);
            }
        }

        return {
            userId,
            baseCurrency,
            accounts: plData,
            totalUnrealizedPL,
            timestamp: new Date()
        };
    }

    /**
     * Get currency exposure breakdown
     * Shows how much value is held in each currency
     * @param {String} userId 
     * @param {String} baseCurrency 
     */
    async getCurrencyExposure(userId, baseCurrency = 'USD') {
        const accounts = await Account.find({
            userId,
            isActive: true,
            includeInNetWorth: true
        });

        const exposureMap = new Map();
        let totalValueInBase = 0;

        for (const account of accounts) {
            try {
                let valueInBase;

                if (account.currency === baseCurrency) {
                    valueInBase = account.balance;
                } else {
                    const conversion = await forexService.convertRealTime(
                        account.balance,
                        account.currency,
                        baseCurrency
                    );
                    valueInBase = conversion.convertedAmount;
                }

                if (!exposureMap.has(account.currency)) {
                    exposureMap.set(account.currency, {
                        currency: account.currency,
                        accounts: [],
                        totalBalance: 0,
                        valueInBase: 0
                    });
                }

                const exposure = exposureMap.get(account.currency);
                exposure.accounts.push({
                    id: account._id,
                    name: account.name,
                    balance: account.balance
                });
                exposure.totalBalance += account.balance;
                exposure.valueInBase += valueInBase;
                totalValueInBase += valueInBase;
            } catch (error) {
                console.error(`[RevaluationService] Error processing account ${account._id}:`, error);
            }
        }

        // Calculate percentages
        const exposures = Array.from(exposureMap.values()).map(exp => ({
            ...exp,
            percentage: totalValueInBase > 0 ? (exp.valueInBase / totalValueInBase) * 100 : 0
        }));

        // Sort by value descending
        exposures.sort((a, b) => b.valueInBase - a.valueInBase);

        return {
            userId,
            baseCurrency,
            exposures,
            totalValueInBase,
            currenciesCount: exposures.length,
            timestamp: new Date()
        };
    }

    /**
     * Generate currency risk assessment
     * @param {String} userId 
     * @param {String} baseCurrency 
     */
    async generateRiskAssessment(userId, baseCurrency = 'USD') {
        const exposure = await this.getCurrencyExposure(userId, baseCurrency);
        const pl = await this.calculateCurrentUnrealizedPL(userId, baseCurrency);

        // Analyze concentration risk
        const highConcentrationThreshold = 30; // 30% in one currency is high risk
        const concentrationRisks = exposure.exposures.filter(
            exp => exp.percentage > highConcentrationThreshold && exp.currency !== baseCurrency
        );

        // Analyze volatility
        const volatilityAssessments = [];
        for (const exp of exposure.exposures) {
            if (exp.currency !== baseCurrency) {
                const volatility = await forexService.getCurrencyVolatility(exp.currency, baseCurrency);
                volatilityAssessments.push({
                    currency: exp.currency,
                    exposure: exp.percentage,
                    volatility: volatility.volatilityScore,
                    recommendation: volatility.recommendation
                });
            }
        }

        // Generate overall risk score (0-100)
        let riskScore = 0;

        // Factor 1: Concentration (40% weight)
        const concentrationScore = Math.min(100, concentrationRisks.reduce((sum, r) => sum + r.percentage, 0) * 2);
        riskScore += concentrationScore * 0.4;

        // Factor 2: Volatility (40% weight)
        const highVolatilityCount = volatilityAssessments.filter(v =>
            v.volatility === 'very_high' || v.volatility === 'high'
        ).length;
        const volatilityScore = (highVolatilityCount / Math.max(1, volatilityAssessments.length)) * 100;
        riskScore += volatilityScore * 0.4;

        // Factor 3: Unrealized losses (20% weight)
        const lossScore = pl.totalUnrealizedPL < 0 ? Math.min(100, Math.abs(pl.totalUnrealizedPL) / 1000) : 0;
        riskScore += lossScore * 0.2;

        let riskLevel = 'low';
        if (riskScore > 70) riskLevel = 'high';
        else if (riskScore > 40) riskLevel = 'medium';

        return {
            userId,
            baseCurrency,
            riskScore: Math.round(riskScore),
            riskLevel,
            concentrationRisks,
            volatilityAssessments,
            unrealizedPL: pl.totalUnrealizedPL,
            recommendations: this._generateRiskRecommendations(riskLevel, concentrationRisks, volatilityAssessments),
            timestamp: new Date()
        };
    }

    /**
     * Generate recommendations based on risk assessment
     */
    _generateRiskRecommendations(riskLevel, concentrationRisks, volatilityAssessments) {
        const recommendations = [];

        if (riskLevel === 'high') {
            recommendations.push({
                priority: 'high',
                category: 'diversification',
                message: 'Your currency portfolio has high risk. Consider diversifying your holdings.'
            });
        }

        if (concentrationRisks.length > 0) {
            concentrationRisks.forEach(risk => {
                recommendations.push({
                    priority: 'medium',
                    category: 'concentration',
                    message: `${risk.percentage.toFixed(1)}% of your portfolio is in ${risk.currency}. Consider reducing concentration.`
                });
            });
        }

        const highVolatility = volatilityAssessments.filter(v => v.volatility === 'very_high');
        if (highVolatility.length > 0) {
            recommendations.push({
                priority: 'high',
                category: 'volatility',
                message: `You have exposure to high-volatility currencies: ${highVolatility.map(v => v.currency).join(', ')}. Monitor closely.`
            });
        }

        if (recommendations.length === 0) {
            recommendations.push({
                priority: 'low',
                category: 'status',
                message: 'Your currency portfolio appears well-balanced.'
            });
        }

        return recommendations;
    }
}

module.exports = new RevaluationService();
