const Budget = require('../models/Budget');
const BudgetVariance = require('../models/BudgetVariance');
const SpendForecast = require('../models/SpendForecast');

class BudgetOptimizer {
    /**
     * Generate budget reallocation recommendations
     */
    async generateRecommendations(userId, budgetId) {
        const budget = await Budget.findOne({ _id: budgetId, userId });
        if (!budget) {
            throw new Error('Budget not found');
        }

        // Get latest variance analysis
        const latestVariance = await BudgetVariance.findOne({
            userId,
            budgetId
        }).sort({ analysisDate: -1 });

        if (!latestVariance) {
            throw new Error('No variance data available for optimization');
        }

        // Get forecasts for categories
        const forecasts = await SpendForecast.find({
            userId,
            budgetId,
            status: 'active'
        });

        // Analyze current allocation efficiency
        const efficiency = this.analyzeAllocationEfficiency(latestVariance);

        // Generate reallocation recommendations
        const recommendations = this.generateReallocations(
            budget,
            latestVariance,
            forecasts,
            efficiency
        );

        // Calculate potential savings
        const savings = this.calculatePotentialSavings(recommendations);

        return {
            currentAllocation: this.getCurrentAllocation(budget),
            efficiency,
            recommendations,
            potentialSavings: savings,
            optimizationScore: this.calculateOptimizationScore(efficiency)
        };
    }

    /**
     * Analyze allocation efficiency
     */
    analyzeAllocationEfficiency(variance) {
        const efficiency = {
            overallocated: [],
            underutilized: [],
            optimal: [],
            criticalOverruns: []
        };

        for (const item of variance.items) {
            const utilizationRate = item.budgetedAmount > 0
                ? (item.actualAmount / item.budgetedAmount) * 100
                : 0;

            if (utilizationRate > 100) {
                efficiency.overallocated.push({
                    category: item.category,
                    utilizationRate,
                    excess: item.variance,
                    severity: utilizationRate > 150 ? 'critical' : 'high'
                });
            } else if (utilizationRate < 50) {
                efficiency.underutilized.push({
                    category: item.category,
                    utilizationRate,
                    surplus: item.budgetedAmount - item.actualAmount,
                    potential: 'reallocation_candidate'
                });
            } else {
                efficiency.optimal.push({
                    category: item.category,
                    utilizationRate
                });
            }

            if (item.isAnomaly && item.varianceType === 'unfavorable') {
                efficiency.criticalOverruns.push({
                    category: item.category,
                    anomalyScore: item.anomalyScore,
                    variance: item.variance
                });
            }
        }

        return efficiency;
    }

    /**
     * Generate reallocation recommendations
     */
    generateReallocations(budget, variance, forecasts, efficiency) {
        const recommendations = [];

        // Strategy 1: Reallocate from underutilized to overallocated
        for (const overalloc of efficiency.overallocated) {
            const deficit = overalloc.excess;

            // Find underutilized categories with surplus
            const donors = efficiency.underutilized
                .filter(u => u.surplus >= deficit * 0.5)
                .sort((a, b) => b.surplus - a.surplus);

            if (donors.length > 0) {
                const donor = donors[0];
                const transferAmount = Math.min(deficit, donor.surplus * 0.7);

                recommendations.push({
                    type: 'reallocation',
                    priority: overalloc.severity === 'critical' ? 'high' : 'medium',
                    action: 'transfer',
                    from: donor.category,
                    to: overalloc.category,
                    amount: transferAmount,
                    rationale: `${donor.category} is underutilized (${donor.utilizationRate.toFixed(1)}%) while ${overalloc.category} is overallocated (${overalloc.utilizationRate.toFixed(1)}%)`,
                    expectedImpact: `Reduce ${overalloc.category} overrun by ${((transferAmount / deficit) * 100).toFixed(1)}%`
                });
            } else {
                // No suitable donor - recommend budget increase
                recommendations.push({
                    type: 'increase',
                    priority: 'high',
                    action: 'increase_budget',
                    category: overalloc.category,
                    amount: deficit * 0.5,
                    rationale: `${overalloc.category} consistently exceeds budget with no reallocation options`,
                    expectedImpact: 'Prevent future overruns'
                });
            }
        }

        // Strategy 2: Reduce underutilized categories
        for (const underutil of efficiency.underutilized) {
            if (underutil.utilizationRate < 30 && underutil.surplus > 1000) {
                recommendations.push({
                    type: 'reduction',
                    priority: 'low',
                    action: 'reduce_budget',
                    category: underutil.category,
                    amount: underutil.surplus * 0.5,
                    rationale: `${underutil.category} is significantly underutilized (${underutil.utilizationRate.toFixed(1)}%)`,
                    expectedImpact: 'Free up budget for critical categories'
                });
            }
        }

        // Strategy 3: Forecast-based adjustments
        for (const forecast of forecasts) {
            const totalPredicted = forecast.summary.totalPredicted;
            const budgetCat = budget.categories?.find(c => c.category === forecast.category);

            if (budgetCat && totalPredicted > budgetCat.limit * 1.2) {
                recommendations.push({
                    type: 'forecast_adjustment',
                    priority: 'medium',
                    action: 'increase_budget',
                    category: forecast.category,
                    amount: totalPredicted - budgetCat.limit,
                    rationale: `Forecast predicts ${forecast.category} will exceed budget by ${((totalPredicted / budgetCat.limit - 1) * 100).toFixed(1)}%`,
                    expectedImpact: 'Prevent predicted overrun',
                    forecastConfidence: forecast.summary.trendStrength || 0.7
                });
            }
        }

        // Sort by priority
        const priorityOrder = { high: 1, medium: 2, low: 3 };
        recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        return recommendations;
    }

    /**
     * Calculate potential savings
     */
    calculatePotentialSavings(recommendations) {
        let totalSavings = 0;
        let reallocations = 0;
        let reductions = 0;

        for (const rec of recommendations) {
            if (rec.type === 'reduction') {
                totalSavings += rec.amount;
                reductions++;
            } else if (rec.type === 'reallocation') {
                reallocations++;
            }
        }

        return {
            totalSavings,
            reallocations,
            reductions,
            averageSavingsPerReduction: reductions > 0 ? totalSavings / reductions : 0
        };
    }

    /**
     * Calculate optimization score
     */
    calculateOptimizationScore(efficiency) {
        const total = efficiency.overallocated.length +
            efficiency.underutilized.length +
            efficiency.optimal.length;

        if (total === 0) return 0;

        const optimalRatio = efficiency.optimal.length / total;
        const criticalPenalty = efficiency.criticalOverruns.length * 0.1;

        const score = Math.max(0, Math.min(100, (optimalRatio * 100) - (criticalPenalty * 10)));

        return score;
    }

    /**
     * Get current allocation
     */
    getCurrentAllocation(budget) {
        if (!budget.categories || budget.categories.length === 0) {
            return {
                total: budget.amount,
                categories: []
            };
        }

        return {
            total: budget.amount,
            categories: budget.categories.map(c => ({
                category: c.category,
                allocated: c.limit,
                percentage: budget.amount > 0 ? (c.limit / budget.amount) * 100 : 0
            }))
        };
    }

    /**
     * Apply recommendations
     */
    async applyRecommendations(userId, budgetId, recommendationIds) {
        const budget = await Budget.findOne({ _id: budgetId, userId });
        if (!budget) {
            throw new Error('Budget not found');
        }

        // Get recommendations
        const optimization = await this.generateRecommendations(userId, budgetId);
        const toApply = optimization.recommendations.filter((_, i) => recommendationIds.includes(i));

        // Apply each recommendation
        for (const rec of toApply) {
            if (rec.type === 'reallocation') {
                // Transfer budget between categories
                const fromCat = budget.categories.find(c => c.category === rec.from);
                const toCat = budget.categories.find(c => c.category === rec.to);

                if (fromCat && toCat) {
                    fromCat.limit -= rec.amount;
                    toCat.limit += rec.amount;
                }
            } else if (rec.type === 'increase' || rec.type === 'forecast_adjustment') {
                // Increase category budget
                const cat = budget.categories.find(c => c.category === rec.category);
                if (cat) {
                    cat.limit += rec.amount;
                    budget.amount += rec.amount;
                }
            } else if (rec.type === 'reduction') {
                // Reduce category budget
                const cat = budget.categories.find(c => c.category === rec.category);
                if (cat) {
                    cat.limit -= rec.amount;
                    budget.amount -= rec.amount;
                }
            }
        }

        await budget.save();

        return {
            success: true,
            appliedCount: toApply.length,
            updatedBudget: budget
        };
    }

    /**
     * Get optimization history
     */
    async getOptimizationHistory(userId, budgetId) {
        const variances = await BudgetVariance.find({
            userId,
            budgetId
        }).sort({ analysisDate: -1 }).limit(12);

        return variances.map(v => ({
            date: v.analysisDate,
            utilizationRate: v.summary.utilizationRate,
            anomalies: v.summary.anomaliesDetected,
            status: v.status,
            alerts: v.alerts.length
        }));
    }
}

module.exports = new BudgetOptimizer();
