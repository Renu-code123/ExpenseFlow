const BaseRepository = require('./baseRepository');
const FinancialEvent = require('../models/FinancialEvent');

/**
 * CashFlowRepository
 * Issue #909: Optimized temporal queries for historical spend velocity.
 */
class CashFlowRepository extends BaseRepository {
    constructor() {
        super(FinancialEvent);
    }

    /**
     * Get historical spend velocity (drift and volatility) for a workspace.
     */
    async getSpendVelocity(workspaceId, daysLookback = 90) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysLookback);

        const events = await this.model.find({
            workspaceId,
            timestamp: { $gte: startDate },
            'payload.amount': { $exists: true }
        }).sort({ timestamp: 1 });

        if (events.length < 2) {
            return { drift: 0, volatility: 0.1, averageDailySpend: 0 };
        }

        // Calculate daily changes
        const dailyBalances = {};
        events.forEach(e => {
            const dateStr = e.timestamp.toISOString().split('T')[0];
            dailyBalances[dateStr] = (dailyBalances[dateStr] || 0) + (e.eventType === 'EXPENSE' ? -e.payload.amount : e.payload.amount);
        });

        const balances = Object.values(dailyBalances);
        const mean = balances.reduce((a, b) => a + b, 0) / balances.length;
        const variance = balances.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / balances.length;

        return {
            drift: mean, // Simple linear drift for now
            volatility: Math.sqrt(variance),
            averageDailySpend: Math.abs(balances.filter(b => b < 0).reduce((a, b) => a + b, 0) / balances.length)
        };
    }
}

module.exports = new CashFlowRepository();
