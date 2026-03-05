const UnrealizedGainLoss = require('../models/UnrealizedGainLoss');
const FXRevaluation = require('../models/FXRevaluation');
const Transaction = require('../models/Transaction');

class FXGainLossService {
    /**
     * Calculate total realized and unrealized gains/losses
     */
    async calculateTotalGainLoss(userId, asOfDate = new Date()) {
        // Get unrealized positions
        const unrealizedPositions = await UnrealizedGainLoss.find({
            userId,
            status: 'active',
            asOfDate: { $lte: asOfDate }
        });

        const unrealizedGain = unrealizedPositions
            .filter(p => p.gainLossType === 'gain')
            .reduce((sum, p) => sum + Math.abs(p.unrealizedGainLoss), 0);

        const unrealizedLoss = unrealizedPositions
            .filter(p => p.gainLossType === 'loss')
            .reduce((sum, p) => sum + Math.abs(p.unrealizedGainLoss), 0);

        // Get realized positions
        const realizedPositions = await UnrealizedGainLoss.find({
            userId,
            status: 'realized',
            realizedDate: { $lte: asOfDate }
        });

        const realizedGain = realizedPositions
            .filter(p => p.gainLossType === 'gain')
            .reduce((sum, p) => sum + Math.abs(p.realizedAmount), 0);

        const realizedLoss = realizedPositions
            .filter(p => p.gainLossType === 'loss')
            .reduce((sum, p) => sum + Math.abs(p.realizedAmount), 0);

        return {
            unrealized: {
                gain: unrealizedGain,
                loss: unrealizedLoss,
                net: unrealizedGain - unrealizedLoss,
                positions: unrealizedPositions.length
            },
            realized: {
                gain: realizedGain,
                loss: realizedLoss,
                net: realizedGain - realizedLoss,
                positions: realizedPositions.length
            },
            total: {
                gain: unrealizedGain + realizedGain,
                loss: unrealizedLoss + realizedLoss,
                net: (unrealizedGain - unrealizedLoss) + (realizedGain - realizedLoss)
            }
        };
    }

    /**
     * Get gain/loss by currency
     */
    async getGainLossByCurrency(userId) {
        const positions = await UnrealizedGainLoss.find({ userId });

        const byCurrency = {};

        for (const position of positions) {
            if (!byCurrency[position.currency]) {
                byCurrency[position.currency] = {
                    currency: position.currency,
                    unrealizedGain: 0,
                    unrealizedLoss: 0,
                    realizedGain: 0,
                    realizedLoss: 0,
                    totalPositions: 0
                };
            }

            byCurrency[position.currency].totalPositions++;

            if (position.status === 'active') {
                if (position.gainLossType === 'gain') {
                    byCurrency[position.currency].unrealizedGain += Math.abs(position.unrealizedGainLoss);
                } else if (position.gainLossType === 'loss') {
                    byCurrency[position.currency].unrealizedLoss += Math.abs(position.unrealizedGainLoss);
                }
            } else if (position.status === 'realized') {
                if (position.gainLossType === 'gain') {
                    byCurrency[position.currency].realizedGain += Math.abs(position.realizedAmount);
                } else if (position.gainLossType === 'loss') {
                    byCurrency[position.currency].realizedLoss += Math.abs(position.realizedAmount);
                }
            }
        }

        // Calculate net for each currency
        Object.values(byCurrency).forEach(curr => {
            curr.unrealizedNet = curr.unrealizedGain - curr.unrealizedLoss;
            curr.realizedNet = curr.realizedGain - curr.realizedLoss;
            curr.totalNet = curr.unrealizedNet + curr.realizedNet;
        });

        return Object.values(byCurrency);
    }

    /**
     * Get gain/loss trend over time
     */
    async getGainLossTrend(userId, months = 12) {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months);

        const revaluations = await FXRevaluation.find({
            userId,
            status: 'completed',
            revaluationDate: { $gte: startDate }
        }).sort({ revaluationDate: 1 });

        const trend = revaluations.map(r => ({
            date: r.revaluationDate,
            gain: r.summary.totalGain,
            loss: r.summary.totalLoss,
            net: r.summary.netGainLoss,
            accountsRevalued: r.summary.totalAccounts
        }));

        return trend;
    }

    /**
     * Get top gaining and losing positions
     */
    async getTopPositions(userId, limit = 10) {
        const activePositions = await UnrealizedGainLoss.find({
            userId,
            status: 'active'
        }).sort({ unrealizedGainLoss: -1 });

        const topGains = activePositions
            .filter(p => p.gainLossType === 'gain')
            .slice(0, limit);

        const topLosses = activePositions
            .filter(p => p.gainLossType === 'loss')
            .sort((a, b) => a.unrealizedGainLoss - b.unrealizedGainLoss)
            .slice(0, limit);

        return {
            topGains,
            topLosses
        };
    }

    /**
     * Calculate Value at Risk (VaR) for FX positions
     */
    async calculateVaR(userId, confidenceLevel = 0.95, timeHorizon = 1) {
        const positions = await UnrealizedGainLoss.find({
            userId,
            status: 'active'
        });

        if (positions.length === 0) {
            return { var: 0, positions: 0 };
        }

        // Calculate historical volatility for each position
        const positionRisks = positions.map(position => {
            const rateHistory = position.rateHistory || [];

            if (rateHistory.length < 2) {
                return {
                    position,
                    volatility: 0,
                    var: 0
                };
            }

            // Calculate daily returns
            const returns = [];
            for (let i = 1; i < rateHistory.length; i++) {
                const dailyReturn = (rateHistory[i].rate - rateHistory[i - 1].rate) / rateHistory[i - 1].rate;
                returns.push(dailyReturn);
            }

            // Calculate volatility (standard deviation)
            const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
            const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
            const volatility = Math.sqrt(variance);

            // Calculate VaR using parametric method
            const zScore = this.getZScore(confidenceLevel);
            const var95 = position.baseAmountCurrent * volatility * zScore * Math.sqrt(timeHorizon);

            return {
                position,
                volatility,
                var: var95
            };
        });

        // Total portfolio VaR (simplified - assumes independence)
        const totalVaR = Math.sqrt(
            positionRisks.reduce((sum, pr) => sum + Math.pow(pr.var, 2), 0)
        );

        return {
            var: totalVaR,
            positions: positionRisks.length,
            positionRisks: positionRisks.sort((a, b) => b.var - a.var).slice(0, 10)
        };
    }

    /**
     * Get Z-score for confidence level
     */
    getZScore(confidenceLevel) {
        const zScores = {
            0.90: 1.28,
            0.95: 1.65,
            0.99: 2.33
        };
        return zScores[confidenceLevel] || 1.65;
    }

    /**
     * Generate compliance report (IFRS/GAAP)
     */
    async generateComplianceReport(userId, reportingPeriod) {
        const { startDate, endDate } = reportingPeriod;

        // Get all revaluations in period
        const revaluations = await FXRevaluation.find({
            userId,
            status: 'completed',
            revaluationDate: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        }).sort({ revaluationDate: 1 });

        // Get unrealized positions at period end
        const unrealizedPositions = await UnrealizedGainLoss.find({
            userId,
            status: 'active',
            asOfDate: { $lte: new Date(endDate) }
        });

        // Get realized positions in period
        const realizedPositions = await UnrealizedGainLoss.find({
            userId,
            status: 'realized',
            realizedDate: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        });

        // Calculate totals
        const totalUnrealizedGain = unrealizedPositions
            .filter(p => p.gainLossType === 'gain')
            .reduce((sum, p) => sum + Math.abs(p.unrealizedGainLoss), 0);

        const totalUnrealizedLoss = unrealizedPositions
            .filter(p => p.gainLossType === 'loss')
            .reduce((sum, p) => sum + Math.abs(p.unrealizedGainLoss), 0);

        const totalRealizedGain = realizedPositions
            .filter(p => p.gainLossType === 'gain')
            .reduce((sum, p) => sum + Math.abs(p.realizedAmount), 0);

        const totalRealizedLoss = realizedPositions
            .filter(p => p.gainLossType === 'loss')
            .reduce((sum, p) => sum + Math.abs(p.realizedAmount), 0);

        return {
            reportingPeriod: {
                startDate,
                endDate
            },
            summary: {
                unrealizedGain: totalUnrealizedGain,
                unrealizedLoss: totalUnrealizedLoss,
                unrealizedNet: totalUnrealizedGain - totalUnrealizedLoss,
                realizedGain: totalRealizedGain,
                realizedLoss: totalRealizedLoss,
                realizedNet: totalRealizedGain - totalRealizedLoss,
                totalNet: (totalUnrealizedGain - totalUnrealizedLoss) + (totalRealizedGain - totalRealizedLoss)
            },
            revaluationCount: revaluations.length,
            unrealizedPositions: unrealizedPositions.length,
            realizedPositions: realizedPositions.length,
            detailedRevaluations: revaluations,
            detailedUnrealized: unrealizedPositions,
            detailedRealized: realizedPositions
        };
    }

    /**
     * Get sensitivity analysis for rate changes
     */
    async getSensitivityAnalysis(userId, rateChangePercentages = [-10, -5, 0, 5, 10]) {
        const positions = await UnrealizedGainLoss.find({
            userId,
            status: 'active'
        });

        const scenarios = rateChangePercentages.map(changePercent => {
            let totalImpact = 0;

            for (const position of positions) {
                const newRate = position.currentRate * (1 + changePercent / 100);
                const newBaseAmount = position.originalAmount * newRate;
                const newGainLoss = newBaseAmount - position.baseAmountOriginal;
                totalImpact += newGainLoss;
            }

            return {
                rateChange: changePercent,
                impact: totalImpact,
                currentNet: positions.reduce((sum, p) => sum + p.unrealizedGainLoss, 0)
            };
        });

        return scenarios;
    }
}

module.exports = new FXGainLossService();
