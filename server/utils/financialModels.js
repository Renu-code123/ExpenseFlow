/**
 * Financial Models Utility
 * Advanced mathematical functions for treasury operations
 */

const FinancialModels = {
    /**
     * Calculate Internal Rate of Return (IRR)
     * Uses Newton-Raphson method for approximation
     */
    calculateIRR: (cashFlows, guess = 0.1) => {
        const maxIterations = 100;
        const tolerance = 0.00001;
        let rate = guess;

        for (let i = 0; i < maxIterations; i++) {
            let npv = 0;
            let dnpv = 0;

            cashFlows.forEach((cf, t) => {
                npv += cf / Math.pow(1 + rate, t);
                dnpv -= (t * cf) / Math.pow(1 + rate, t + 1);
            });

            const newRate = rate - npv / dnpv;

            if (Math.abs(newRate - rate) < tolerance) {
                return newRate;
            }
            rate = newRate;
        }

        return rate;
    },

    /**
     * Calculate Net Present Value (NPV)
     */
    calculateNPV: (cashFlows, discountRate) => {
        return cashFlows.reduce((npv, cf, t) => {
            return npv + cf / Math.pow(1 + discountRate, t);
        }, 0);
    },

    /**
     * Calculate Cash Runway (days until funds depleted)
     */
    calculateRunway: (currentBalance, dailyBurnRate) => {
        if (dailyBurnRate <= 0) return Infinity;
        return Math.floor(currentBalance / dailyBurnRate);
    },

    /**
     * Calculate Burn Rate from historical data
     */
    calculateBurnRate: (expenses, days) => {
        if (days === 0) return 0;
        const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
        return totalExpenses / days;
    },

    /**
     * FX Variance Analysis
     * Measures volatility of exchange rate movements
     */
    calculateFXVariance: (rates) => {
        if (rates.length < 2) return 0;

        const mean = rates.reduce((sum, r) => sum + r, 0) / rates.length;
        const squaredDiffs = rates.map(r => Math.pow(r - mean, 2));
        const variance = squaredDiffs.reduce((sum, sd) => sum + sd, 0) / rates.length;

        return {
            variance,
            standardDeviation: Math.sqrt(variance),
            coefficientOfVariation: (Math.sqrt(variance) / mean) * 100
        };
    },

    /**
     * Value at Risk (VaR) - Parametric Method
     * Estimates maximum potential loss at given confidence level
     */
    calculateVaR: (portfolioValue, volatility, confidenceLevel = 0.95, timeHorizon = 1) => {
        // Z-score for confidence levels
        const zScores = {
            0.90: 1.28,
            0.95: 1.65,
            0.99: 2.33
        };

        const zScore = zScores[confidenceLevel] || 1.65;
        const var_ = portfolioValue * volatility * zScore * Math.sqrt(timeHorizon);

        return var_;
    },

    /**
     * Sharpe Ratio - Risk-adjusted return metric
     */
    calculateSharpeRatio: (returns, riskFreeRate = 0.05) => {
        if (returns.length === 0) return 0;

        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const excessReturn = avgReturn - riskFreeRate;

        const variance = returns.reduce((sum, r) => {
            return sum + Math.pow(r - avgReturn, 2);
        }, 0) / returns.length;

        const stdDev = Math.sqrt(variance);

        return stdDev === 0 ? 0 : excessReturn / stdDev;
    },

    /**
     * Liquidity Coverage Ratio (LCR)
     * Basel III metric for short-term resilience
     */
    calculateLCR: (highQualityLiquidAssets, netCashOutflows) => {
        if (netCashOutflows === 0) return Infinity;
        return (highQualityLiquidAssets / netCashOutflows) * 100;
    },

    /**
     * Compound Annual Growth Rate (CAGR)
     */
    calculateCAGR: (beginningValue, endingValue, years) => {
        if (beginningValue === 0 || years === 0) return 0;
        return (Math.pow(endingValue / beginningValue, 1 / years) - 1) * 100;
    },

    /**
     * Weighted Average Cost of Capital (WACC)
     */
    calculateWACC: (equityValue, debtValue, costOfEquity, costOfDebt, taxRate) => {
        const totalValue = equityValue + debtValue;
        if (totalValue === 0) return 0;

        const equityWeight = equityValue / totalValue;
        const debtWeight = debtValue / totalValue;

        return (equityWeight * costOfEquity) + (debtWeight * costOfDebt * (1 - taxRate));
    },

    /**
     * Moving Average Convergence Divergence (MACD) for trend analysis
     */
    calculateMACD: (prices, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) => {
        const ema = (data, period) => {
            const k = 2 / (period + 1);
            let emaValue = data[0];
            const emaArray = [emaValue];

            for (let i = 1; i < data.length; i++) {
                emaValue = (data[i] * k) + (emaValue * (1 - k));
                emaArray.push(emaValue);
            }
            return emaArray;
        };

        const shortEMA = ema(prices, shortPeriod);
        const longEMA = ema(prices, longPeriod);

        const macdLine = shortEMA.map((val, i) => val - longEMA[i]);
        const signalLine = ema(macdLine, signalPeriod);
        const histogram = macdLine.map((val, i) => val - signalLine[i]);

        return {
            macdLine: macdLine[macdLine.length - 1],
            signalLine: signalLine[signalLine.length - 1],
            histogram: histogram[histogram.length - 1]
        };
    }
};

module.exports = FinancialModels;
