const RiskProfile = require('../models/RiskProfile');
const Transaction = require('../models/Transaction');
const statisticalMath = require('../utils/statisticalMath');

/**
 * Anomaly Detection Service
 * Issue #645: Heavy-lifting for financial risk analysis
 */
class AnomalyService {
    /**
     * Analyze a single transaction for risks
     */
    async analyzeTransaction(transaction) {
        const userId = transaction.user;
        let profile = await RiskProfile.findOne({ user: userId });

        if (!profile) {
            profile = await this.updateUserBaselines(userId);
        }

        const riskDetails = [];
        let totalRiskScore = 0;

        // 1. Check for extreme amount (Z-score analysis)
        if (profile.baselines.dailyAvg > 0) {
            const zScore = statisticalMath.zScore(
                transaction.amount,
                profile.baselines.dailyAvg,
                profile.baselines.dailyStdDev || (profile.baselines.dailyAvg * 0.5)
            );

            if (zScore > 3) {
                const impact = Math.min(40, zScore * 5);
                totalRiskScore += impact;
                riskDetails.push({
                    factor: 'EXTREME_AMOUNT',
                    impact,
                    description: `Transaction amount is ${zScore.toFixed(1)} standard deviations above average.`
                });
            }
        }

        // 2. Check for Category Spikes
        const categoryAvg = profile.baselines.categoryAverages.get(transaction.category);
        if (categoryAvg && transaction.amount > categoryAvg * 4) {
            totalRiskScore += 20;
            riskDetails.push({
                factor: 'CATEGORY_SPIKE',
                impact: 20,
                description: `Spending in ${transaction.category} is over 4x your typical average.`
            });
        }

        // 3. New Merchant Check
        const previousTransaction = await Transaction.findOne({
            user: userId,
            merchant: transaction.merchant,
            _id: { $ne: transaction._id }
        });

        if (!previousTransaction && transaction.amount > 1000) {
            totalRiskScore += 15;
            riskDetails.push({
                factor: 'NEW_MERCHANT',
                impact: 15,
                description: 'Large transaction at a previously unseen merchant.'
            });
        }

        // Apply results to transaction
        transaction.riskScore = Math.min(100, totalRiskScore);
        transaction.riskDetails = riskDetails;
        transaction.isAnomaly = totalRiskScore > 50;
        transaction.anomalyConfidence = Math.min(100, totalRiskScore);

        if (transaction.isAnomaly) {
            profile.historicalFlags.push({
                transaction: transaction._id,
                reason: riskDetails.map(d => d.factor).join(', '),
                scoreAtTime: totalRiskScore
            });
            await profile.save();
        }

        return transaction;
    }

    /**
     * Recalculate statistical baselines for a user
     */
    async updateUserBaselines(userId) {
        const transactions = await Transaction.find({ user: userId }).select('amount category date');

        if (transactions.length < 5) {
            return await RiskProfile.findOneAndUpdate(
                { user: userId },
                { lastAnalyzedAt: new Date() },
                { upsert: true, new: true }
            );
        }

        const amounts = transactions.map(t => t.amount);
        const dailyAvg = statisticalMath.mean(amounts);
        const dailyStdDev = statisticalMath.standardDeviation(amounts);

        const categoryMap = new Map();
        transactions.forEach(t => {
            if (!categoryMap.has(t.category)) categoryMap.set(t.category, []);
            categoryMap.get(t.category).push(t.amount);
        });

        const categoryAverages = {};
        for (const [cat, vals] of categoryMap) {
            categoryAverages[cat] = statisticalMath.mean(vals);
        }

        return await RiskProfile.findOneAndUpdate(
            { user: userId },
            {
                baselines: {
                    dailyAvg,
                    dailyStdDev,
                    categoryAverages
                },
                lastAnalyzedAt: new Date()
            },
            { upsert: true, new: true }
        );
    }
}

module.exports = new AnomalyService();
