/**
 * Predictive Math Utility
 * Issue #647: Forecasts cash-flow impact based on subscription lifecycles
 */

class PredictiveMath {
    /**
     * Calculate compound cash-flow impact for a period
     * @param {Array} subscriptions - List of active subscriptions
     * @param {number} days - Forecast horizon
     * @returns {Object} Prediction data
     */
    forecastImpact(subscriptions, days = 30) {
        const timeline = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const horizon = new Date(today);
        horizon.setDate(horizon.getDate() + days);

        let cumulativeCost = 0;
        const dayStats = new Map();

        subscriptions.forEach(sub => {
            let nextDate = new Date(sub.next_billing_date || sub.nextPaymentDate);
            nextDate.setHours(0, 0, 0, 0);

            while (nextDate <= horizon) {
                if (nextDate >= today) {
                    const dateKey = nextDate.toISOString().split('T')[0];
                    const currentDay = dayStats.get(dateKey) || { total: 0, items: [] };

                    currentDay.total += sub.amount;
                    currentDay.items.push({
                        name: sub.name,
                        amount: sub.amount,
                        currency: sub.currency
                    });

                    dayStats.set(dateKey, currentDay);
                }

                // Project next billing based on cycle
                nextDate = this._incrementByCycle(nextDate, sub.billing_cycle || sub.billingCycle);
            }
        });

        // Convert map to sorted array
        const sortedDates = Array.from(dayStats.keys()).sort();
        sortedDates.forEach(date => {
            const stats = dayStats.get(date);
            cumulativeCost += stats.total;
            timeline.push({
                date,
                dailyTotal: Math.round(stats.total * 100) / 100,
                cumulativeTotal: Math.round(cumulativeCost * 100) / 100,
                items: stats.items
            });
        });

        return {
            periodDays: days,
            totalProjectedCost: Math.round(cumulativeCost * 100) / 100,
            averageDailyBurn: Math.round((cumulativeCost / days) * 100) / 100,
            timeline,
            riskLevel: this._calculateRiskLevel(cumulativeCost, days)
        };
    }

    /**
     * Calculate probability of renewal based on historical usage
     * @param {Object} subscription - Subscription with usage metadata
     * @returns {number} Score (0-100)
     */
    calculateRenewalProbability(subscription) {
        let score = 70; // Base baseline

        // Factor in usage frequency
        const usage = subscription.usage_frequency || subscription.usageFrequency || 'medium';
        const usageWeights = { high: 20, medium: 5, low: -15, none: -40 };
        score += usageWeights[usage] || 0;

        // Factor in history
        if (subscription.paymentCount > 5) score += 10;
        if (subscription.isInTrial) score -= 10;

        // Factor in value rating
        const rating = subscription.value_rating || subscription.valueRating || 3;
        score += (rating - 3) * 5;

        return Math.max(0, Math.min(100, score));
    }

    _incrementByCycle(date, cycle) {
        const next = new Date(date);
        switch (cycle) {
            case 'daily': next.setDate(next.getDate() + 1); break;
            case 'weekly': next.setDate(next.getDate() + 7); break;
            case 'monthly': next.setMonth(next.getMonth() + 1); break;
            case 'quarterly': next.setMonth(next.getMonth() + 3); break;
            case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
            default: next.setMonth(next.getMonth() + 1);
        }
        return next;
    }

    _calculateRiskLevel(totalCost, days) {
        const daily = totalCost / days;
        if (daily > 100) return 'high';
        if (daily > 30) return 'medium';
        return 'low';
    }
}

module.exports = new PredictiveMath();
