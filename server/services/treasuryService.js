const TreasuryVault = require('../models/TreasuryVault');
const LiquidityThreshold = require('../models/LiquidityThreshold');
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const FinancialModels = require('../utils/financialModels');

class TreasuryService {
    /**
     * Get comprehensive treasury dashboard data
     */
    async getTreasuryDashboard(userId) {
        const vaults = await TreasuryVault.find({ userId, isActive: true });
        const thresholds = await LiquidityThreshold.find({ userId, isActive: true });

        // Calculate total liquidity across all vaults
        const totalLiquidity = vaults.reduce((sum, v) => {
            // Convert to base currency (INR) if needed
            return sum + v.availableLiquidity;
        }, 0);

        // Get recent transactions for burn rate calculation
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentExpenses = await Transaction.find({
            user: userId,
            type: 'expense',
            date: { $gte: thirtyDaysAgo }
        });

        const dailyBurnRate = FinancialModels.calculateBurnRate(recentExpenses, 30);
        const cashRunway = FinancialModels.calculateRunway(totalLiquidity, dailyBurnRate);

        // Check threshold violations
        const violations = [];
        for (const threshold of thresholds) {
            const vault = vaults.find(v => v._id.equals(threshold.vaultId));
            if (!vault) continue;

            let isViolated = false;
            let currentValue = 0;

            switch (threshold.thresholdType) {
                case 'absolute':
                    currentValue = vault.availableLiquidity;
                    isViolated = currentValue < threshold.triggerValue;
                    break;
                case 'percentage':
                    currentValue = (vault.availableLiquidity / vault.balance) * 100;
                    isViolated = currentValue < threshold.triggerValue;
                    break;
                case 'runway_days':
                    currentValue = cashRunway;
                    isViolated = currentValue < threshold.triggerValue;
                    break;
            }

            if (isViolated) {
                violations.push({
                    thresholdId: threshold._id,
                    thresholdName: threshold.thresholdName,
                    severity: threshold.severity,
                    currentValue,
                    triggerValue: threshold.triggerValue,
                    vaultName: vault.vaultName
                });
            }
        }

        return {
            vaults,
            totalLiquidity,
            dailyBurnRate,
            cashRunway,
            violations,
            healthScore: this.calculateHealthScore(totalLiquidity, dailyBurnRate, violations.length)
        };
    }

    /**
     * Calculate treasury health score (0-100)
     */
    calculateHealthScore(liquidity, burnRate, violationCount) {
        let score = 100;

        // Deduct based on runway
        const runway = FinancialModels.calculateRunway(liquidity, burnRate);
        if (runway < 30) score -= 40;
        else if (runway < 60) score -= 20;
        else if (runway < 90) score -= 10;

        // Deduct based on violations
        score -= violationCount * 15;

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Transfer funds between vaults
     */
    async transferBetweenVaults(fromVaultId, toVaultId, amount, userId) {
        const fromVault = await TreasuryVault.findOne({ _id: fromVaultId, userId });
        const toVault = await TreasuryVault.findOne({ _id: toVaultId, userId });

        if (!fromVault || !toVault) {
            throw new Error('Vault not found');
        }

        if (fromVault.availableLiquidity < amount) {
            throw new Error('Insufficient liquidity in source vault');
        }

        // Perform transfer
        fromVault.balance -= amount;
        toVault.balance += amount;

        await fromVault.save();
        await toVault.save();

        return {
            success: true,
            fromVault: fromVault.vaultName,
            toVault: toVault.vaultName,
            amount
        };
    }

    /**
     * Auto-rebalance vaults based on allocation targets
     */
    async rebalanceVaults(userId) {
        const vaults = await TreasuryVault.find({
            userId,
            isActive: true,
            'metadata.autoRebalance': true
        });

        const totalBalance = vaults.reduce((sum, v) => sum + v.balance, 0);
        const rebalanceActions = [];

        for (const vault of vaults) {
            // Simple rebalancing: maintain equal distribution
            const targetBalance = totalBalance / vaults.length;
            const difference = vault.balance - targetBalance;

            if (Math.abs(difference) > 1000) { // Only rebalance if difference > 1000
                rebalanceActions.push({
                    vaultId: vault._id,
                    vaultName: vault.vaultName,
                    currentBalance: vault.balance,
                    targetBalance,
                    adjustment: -difference
                });
            }
        }

        return rebalanceActions;
    }

    /**
     * Monitor and trigger threshold alerts
     */
    async monitorThresholds(userId) {
        const dashboard = await this.getTreasuryDashboard(userId);
        const triggeredAlerts = [];

        for (const violation of dashboard.violations) {
            const threshold = await LiquidityThreshold.findById(violation.thresholdId);

            // Check cooldown period
            if (threshold.lastTriggered) {
                const hoursSinceLastTrigger = (Date.now() - threshold.lastTriggered) / (1000 * 60 * 60);
                if (hoursSinceLastTrigger < threshold.cooldownPeriod) {
                    continue; // Skip if in cooldown
                }
            }

            // Update threshold
            threshold.lastTriggered = new Date();
            threshold.triggerCount += 1;
            threshold.currentValue = violation.currentValue;
            await threshold.save();

            triggeredAlerts.push({
                thresholdName: threshold.thresholdName,
                severity: threshold.severity,
                message: `${threshold.thresholdName} violated: Current ${violation.currentValue.toFixed(2)}, Trigger ${violation.triggerValue}`,
                automatedActions: threshold.automatedActions
            });
        }

        return triggeredAlerts;
    }

    /**
     * Get liquidity projection for next N days
     */
    async getLiquidityProjection(userId, days = 90) {
        const dashboard = await this.getTreasuryDashboard(userId);
        const projection = [];

        for (let i = 0; i <= days; i++) {
            const projectedBalance = dashboard.totalLiquidity - (dashboard.dailyBurnRate * i);
            projection.push({
                day: i,
                date: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
                projectedBalance: Math.max(0, projectedBalance),
                burnRate: dashboard.dailyBurnRate
            });
        }

        return projection;
    }

    /**
     * Calculate portfolio metrics
     */
    async getPortfolioMetrics(userId) {
        const vaults = await TreasuryVault.find({ userId, isActive: true });

        // Get historical balances (mock data for now)
        const returns = [0.02, 0.015, -0.01, 0.03, 0.025]; // Mock monthly returns

        const totalValue = vaults.reduce((sum, v) => sum + v.balance, 0);

        return {
            totalValue,
            sharpeRatio: FinancialModels.calculateSharpeRatio(returns),
            var95: FinancialModels.calculateVaR(totalValue, 0.15, 0.95),
            diversificationScore: this.calculateDiversification(vaults)
        };
    }

    /**
     * Calculate diversification score
     */
    calculateDiversification(vaults) {
        if (vaults.length === 0) return 0;

        const totalBalance = vaults.reduce((sum, v) => sum + v.balance, 0);
        if (totalBalance === 0) return 0;

        // Herfindahl-Hirschman Index (HHI) for concentration
        const hhi = vaults.reduce((sum, v) => {
            const share = v.balance / totalBalance;
            return sum + Math.pow(share, 2);
        }, 0);

        // Convert to diversification score (0-100)
        return Math.round((1 - hhi) * 100);
    }
}

module.exports = new TreasuryService();
