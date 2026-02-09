/**
 * Forecasting Engine
 * Handles mathematical projections, trend analysis, and regression models
 * for cash flow forecasting.
 */

class ForecastingEngine {
    constructor() {
        this.DEFAULT_CONFIDENCE_INTERVAL = 0.95;
    }

    /**
     * Calculate Simple Moving Average
     * @param {Array<number>} data - Array of values
     * @param {number} window - Window size
     */
    calculateSMA(data, window) {
        if (data.length < window) return null;
        let sum = 0;
        for (let i = 0; i < window; i++) {
            sum += data[i];
        }
        return sum / window;
    }

    /**
     * Calculate Weighted Moving Average (giving more weight to recent data)
     * @param {Array<number>} data - Array of values (newest last)
     */
    calculateWMA(data) {
        if (!data || data.length === 0) return 0;

        let sum = 0;
        let weightSum = 0;

        data.forEach((val, index) => {
            const weight = index + 1; // Linear weighting
            sum += val * weight;
            weightSum += weight;
        });

        return sum / weightSum;
    }

    /**
     * Perform Linear Regression to find trend line
     * y = mx + c
     * @param {Array<{x: number, y: number}>} points 
     */
    calculateLinearRegression(points) {
        const n = points.length;
        if (n === 0) return { slope: 0, intercept: 0 };

        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        for (const p of points) {
            sumX += p.x;
            sumY += p.y;
            sumXY += p.x * p.y;
            sumXX += p.x * p.x;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return { slope, intercept };
    }

    /**
     * Calculate Burn Rate
     * Average monthly net loss (if applicable)
     * @param {Array<number>} monthlyNetFlows - Last N months of (Income - Expense)
     */
    calculateBurnRate(monthlyNetFlows) {
        // Filter only negative flows (spending more than income)
        // Or should we look at total expenses? Usually burn rate is specifically for net loss scenarios or total spend.
        // For personal finance, 'Burn Rate' is usually total expenses.
        // For startups, it's net loss.
        // We will return both: 'Gross Burn' (Total Expenses) and 'Net Burn' (Net Loss)

        // This method expects generic monthlyNetFlows to calculate Net Burn
        const negativeFlows = monthlyNetFlows.filter(flow => flow < 0);

        if (negativeFlows.length === 0) return 0; // Profitable or break-even

        return Math.abs(this.calculateWMA(negativeFlows));
    }

    /**
     * Project Future Balance
     * @param {number} currentBalance 
     * @param {number} dailyBurnRate 
     * @param {Array<Object>} recurringEvents - { amount, dayOfMonth, type: 'income'|'expense' }
     * @param {number} daysToProject 
     */
    generateProjection(currentBalance, dailyBurnRate, recurringEvents, daysToProject = 180) {
        const projection = [];
        let runningBalance = currentBalance;
        let date = new Date(); // Start from today
        date.setHours(0, 0, 0, 0);

        for (let i = 0; i < daysToProject; i++) {
            // increment date
            date.setDate(date.getDate() + 1);
            const currentDate = new Date(date);

            // 1. Apple Daily Variable Spend (Burn Rate component)
            // We assume dailyBurnRate includes variable expenses averaged out
            runningBalance -= dailyBurnRate;

            // 2. Apply Fixed Recurring Events for this specific day
            const dayOfMonth = currentDate.getDate();

            recurringEvents.forEach(event => {
                // Simplistic day matching. In real app, need to handle month lengths, etc.
                if (event.dayOfMonth === dayOfMonth) {
                    if (event.type === 'income') {
                        runningBalance += event.amount;
                    } else {
                        runningBalance -= event.amount;
                    }
                }
            });

            projection.push({
                date: currentDate.toISOString(),
                balance: parseFloat(runningBalance.toFixed(2)),
                isProjected: true
            });
        }

        return projection;
    }

    /**
     * Calculate Runway (Time To Zero)
     * @param {Array<{balance: number}>} projectionData 
     */
    calculateRunway(projectionData) {
        const negativePointIndex = projectionData.findIndex(p => p.balance < 0);

        if (negativePointIndex === -1) {
            return null; // Infinite runway within projection period
        }

        return negativePointIndex; // Days until zero
    }
}

// Export a singleton instance
module.exports = new ForecastingEngine();
