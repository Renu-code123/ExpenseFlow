/**
 * Diff Engine Utility
 * Issue #769: Calculating patch deltas between pending and current states.
 * Issue #798: Extended for simulation impact analysis.
 */
class DiffEngine {
    /**
     * Compare two objects and return only the changes
     */
    static calculateDelta(current, pending) {
        const delta = {};
        const keys = new Set([...Object.keys(current), ...Object.keys(pending)]);

        for (const key of keys) {
            // Ignore internal mongoose fields
            if (key.startsWith('_') || key === 'createdAt' || key === 'updatedAt') continue;

            const val1 = current[key];
            const val2 = pending[key];

            if (JSON.stringify(val1) !== JSON.stringify(val2)) {
                delta[key] = {
                    old: val1,
                    new: val2
                };
            }
        }
        return delta;
    }

    /**
     * Apply a delta patch to an object
     */
    static applyPatch(base, patch) {
        const result = { ...base };
        for (const [key, change] of Object.entries(patch)) {
            result[key] = change.new;
        }
        return result;
    }

    /**
     * Calculate impact of state changes on simulation models
     * Issue #798: Monte Carlo simulation impact analysis
     * @param {Object} currentState - Current financial state
     * @param {Object} proposedChange - Proposed change to apply
     * @returns {Object} Impact analysis on simulation parameters
     */
    static calculateSimulationImpact(currentState, proposedChange) {
        const impact = {
            affectedParameters: [],
            riskDelta: 0,
            volatilityImpact: 0,
            recommendedResimulation: false
        };

        // Income changes have high simulation impact
        if (proposedChange.income !== undefined) {
            const incomeChange = proposedChange.income - (currentState.income || 0);
            const changePercent = currentState.income ? (incomeChange / currentState.income) * 100 : 100;
            
            impact.affectedParameters.push({
                parameter: 'income',
                change: incomeChange,
                changePercent: Math.round(changePercent * 100) / 100,
                sensitivity: 'high'
            });

            // Income drops > 10% trigger re-simulation
            if (changePercent < -10) {
                impact.recommendedResimulation = true;
                impact.riskDelta += Math.abs(changePercent) * 0.5;
            }
        }

        // Expense changes affect burn rate
        if (proposedChange.expense !== undefined) {
            const expenseChange = proposedChange.expense - (currentState.expense || 0);
            const changePercent = currentState.expense ? (expenseChange / currentState.expense) * 100 : 100;
            
            impact.affectedParameters.push({
                parameter: 'expense',
                change: expenseChange,
                changePercent: Math.round(changePercent * 100) / 100,
                sensitivity: 'high'
            });

            // Expense increases > 15% trigger re-simulation
            if (changePercent > 15) {
                impact.recommendedResimulation = true;
                impact.riskDelta += changePercent * 0.3;
            }
        }

        // Balance changes directly affect runway
        if (proposedChange.balance !== undefined) {
            const balanceChange = proposedChange.balance - (currentState.balance || 0);
            const changePercent = currentState.balance ? (balanceChange / currentState.balance) * 100 : 100;
            
            impact.affectedParameters.push({
                parameter: 'balance',
                change: balanceChange,
                changePercent: Math.round(changePercent * 100) / 100,
                sensitivity: 'critical'
            });

            // Balance drops > 20% trigger re-simulation
            if (changePercent < -20) {
                impact.recommendedResimulation = true;
                impact.riskDelta += Math.abs(changePercent) * 0.7;
            }
        }

        // Recurring expense changes affect long-term projections
        if (proposedChange.recurringExpenses !== undefined) {
            const recurringChange = proposedChange.recurringExpenses - (currentState.recurringExpenses || 0);
            
            impact.affectedParameters.push({
                parameter: 'recurringExpenses',
                change: recurringChange,
                sensitivity: 'medium'
            });

            // Any recurring change should trigger re-simulation
            if (Math.abs(recurringChange) > 0) {
                impact.recommendedResimulation = true;
                impact.volatilityImpact += 5;
            }
        }

        // Calculate overall volatility impact
        if (proposedChange.volatility !== undefined) {
            const volatilityChange = proposedChange.volatility - (currentState.volatility || 0);
            impact.volatilityImpact += volatilityChange * 10;
            
            impact.affectedParameters.push({
                parameter: 'volatility',
                change: volatilityChange,
                sensitivity: 'high'
            });
        }

        // Cap risk delta at reasonable bounds
        impact.riskDelta = Math.min(100, Math.max(-100, Math.round(impact.riskDelta)));
        impact.volatilityImpact = Math.round(impact.volatilityImpact * 100) / 100;

        return impact;
    }

    /**
     * Merge multiple simulation results with weighted averaging
     * @param {Array} results - Array of simulation results
     * @param {Array} weights - Corresponding weights (must sum to 1)
     * @returns {Object} Merged result
     */
    static mergeSimulationResults(results, weights = null) {
        if (!results || results.length === 0) return null;
        
        // Default to equal weights if not provided
        if (!weights) {
            weights = results.map(() => 1 / results.length);
        }

        // Normalize weights
        const weightSum = weights.reduce((a, b) => a + b, 0);
        weights = weights.map(w => w / weightSum);

        const merged = {
            p10: 0,
            p25: 0,
            p50: 0,
            p75: 0,
            p90: 0,
            mean: 0,
            stdDev: 0
        };

        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const w = weights[i];
            
            merged.p10 += (r.p10 || 0) * w;
            merged.p25 += (r.p25 || 0) * w;
            merged.p50 += (r.p50 || 0) * w;
            merged.p75 += (r.p75 || 0) * w;
            merged.p90 += (r.p90 || 0) * w;
            merged.mean += (r.mean || 0) * w;
            merged.stdDev += (r.stdDev || 0) * w;
        }

        return merged;
    }

    /**
     * Calculate divergence between two simulation runs
     * @param {Object} sim1 - First simulation result
     * @param {Object} sim2 - Second simulation result
     * @returns {Object} Divergence metrics
     */
    static calculateSimulationDivergence(sim1, sim2) {
        if (!sim1 || !sim2) return null;

        const divergence = {
            p10Divergence: sim2.p10 - sim1.p10,
            p50Divergence: sim2.p50 - sim1.p50,
            p90Divergence: sim2.p90 - sim1.p90,
            meanDivergence: sim2.mean - sim1.mean
        };

        // Calculate relative divergence
        divergence.relativeP50Divergence = sim1.p50 !== 0 
            ? (divergence.p50Divergence / sim1.p50) * 100 
            : 0;

        // Determine if divergence is significant (>10% change in P50)
        divergence.isSignificant = Math.abs(divergence.relativeP50Divergence) > 10;

        return divergence;
    }
}

module.exports = DiffEngine;
