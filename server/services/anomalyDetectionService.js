const SpendingAnomaly = require('../models/SpendingAnomaly');
const Expense = require('../models/Expense');

/**
 * Anomaly Detection Service
 * Implements statistical and ML-based anomaly detection
 */

class AnomalyDetectionService {
    
    /**
     * Detect anomalies in recent transactions
     */
    async detectAnomalies(userId, options = {}) {
        const {
            lookbackDays = 90,
            sensitivityLevel = 'medium' // low, medium, high
        } = options;
        
        // Get recent expenses
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
        
        const recentExpenses = await Expense.find({
            user: userId,
            date: { $gte: cutoffDate }
        }).sort({ date: -1 }).limit(100);
        
        if (recentExpenses.length < 5) {
            return { message: 'Insufficient data for anomaly detection', anomalies: [] };
        }
        
        const anomalies = [];
        
        // Analyze each recent expense
        for (const expense of recentExpenses.slice(0, 30)) { // Check last 30 transactions
            const anomalyResults = await this._analyzeTransaction(
                userId,
                expense,
                sensitivityLevel
            );
            
            if (anomalyResults.isAnomaly) {
                // Check if already detected
                const existing = await SpendingAnomaly.findOne({
                    user: userId,
                    expense_id: expense._id
                });
                
                if (!existing) {
                    const anomaly = await this._createAnomaly(userId, expense, anomalyResults);
                    anomalies.push(anomaly);
                }
            }
        }
        
        return {
            detected: anomalies.length,
            anomalies
        };
    }
    
    /**
     * Analyze a specific transaction for anomalies
     */
    async analyzeTransaction(userId, expenseId) {
        const expense = await Expense.findOne({
            _id: expenseId,
            user: userId
        });
        
        if (!expense) {
            throw new Error('Expense not found');
        }
        
        const results = await this._analyzeTransaction(userId, expense, 'medium');
        
        return {
            expense,
            is_anomaly: results.isAnomaly,
            anomaly_type: results.anomalyType,
            severity: results.severity,
            details: results
        };
    }
    
    /**
     * Get user's anomalies with filtering
     */
    async getUserAnomalies(userId, filters = {}) {
        return await SpendingAnomaly.getUserAnomalies(userId, filters);
    }
    
    /**
     * Get anomaly statistics
     */
    async getAnomalyStats(userId, period = 30) {
        return await SpendingAnomaly.getAnomalyStats(userId, period);
    }
    
    /**
     * Mark anomaly as reviewed
     */
    async reviewAnomaly(userId, anomalyId, action) {
        const anomaly = await SpendingAnomaly.findOne({
            _id: anomalyId,
            user: userId
        });
        
        if (!anomaly) {
            throw new Error('Anomaly not found');
        }
        
        switch (action) {
            case 'mark_normal':
                await anomaly.markAsNormal();
                break;
            case 'mark_fraud':
                await anomaly.markAsFraud('User confirmed as fraudulent');
                break;
            case 'reviewed':
                await anomaly.markAsReviewed();
                break;
            default:
                throw new Error('Invalid action');
        }
        
        return anomaly;
    }
    
    /**
     * Get anomaly detection insights
     */
    async getInsights(userId) {
        const stats = await SpendingAnomaly.getAnomalyStats(userId, 90);
        const criticalAnomalies = await SpendingAnomaly.getUnreviewedCritical(userId);
        
        const insights = {
            overview: stats,
            critical_alerts: criticalAnomalies.length,
            top_anomaly_types: [],
            recommendations: []
        };
        
        // Analyze top anomaly types
        if (stats.by_type) {
            insights.top_anomaly_types = Object.entries(stats.by_type)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([type, count]) => ({ type, count }));
        }
        
        // Generate recommendations
        if (stats.potential_fraud > 0) {
            insights.recommendations.push({
                type: 'security',
                message: `You have ${stats.potential_fraud} potential fraud alerts. Review them immediately.`,
                priority: 'critical'
            });
        }
        
        if (stats.by_type.amount_spike > 5) {
            insights.recommendations.push({
                type: 'budget',
                message: 'Multiple unusual spending spikes detected. Consider reviewing your budget.',
                priority: 'medium'
            });
        }
        
        return insights;
    }
    
    /**
     * PRIVATE METHODS - Detection Algorithms
     */
    
    async _analyzeTransaction(userId, expense, sensitivityLevel) {
        const results = {
            isAnomaly: false,
            anomalyType: null,
            severity: 'low',
            zScore: 0,
            confidence: 0,
            reasons: []
        };
        
        // Get historical data for comparison
        const historicalData = await this._getHistoricalData(userId, expense);
        
        if (historicalData.length < 3) {
            return results; // Not enough data
        }
        
        // 1. Amount-based anomaly detection (Z-score method)
        const amountAnomaly = this._detectAmountAnomaly(
            expense.amount,
            historicalData.amounts,
            sensitivityLevel
        );
        
        if (amountAnomaly.isAnomaly) {
            results.isAnomaly = true;
            results.anomalyType = 'amount_spike';
            results.zScore = amountAnomaly.zScore;
            results.confidence = amountAnomaly.confidence;
            results.severity = amountAnomaly.severity;
            results.reasons.push(amountAnomaly.reason);
            results.statisticalAnalysis = amountAnomaly.analysis;
        }
        
        // 2. Frequency anomaly detection
        const frequencyAnomaly = await this._detectFrequencyAnomaly(
            userId,
            expense,
            historicalData
        );
        
        if (frequencyAnomaly.isAnomaly) {
            results.isAnomaly = true;
            results.anomalyType = 'frequency_anomaly';
            results.reasons.push(frequencyAnomaly.reason);
            if (frequencyAnomaly.severity > results.severity) {
                results.severity = frequencyAnomaly.severity;
            }
        }
        
        // 3. Merchant anomaly detection
        const merchantAnomaly = await this._detectMerchantAnomaly(
            userId,
            expense,
            historicalData
        );
        
        if (merchantAnomaly.isAnomaly) {
            results.isAnomaly = true;
            results.anomalyType = 'unusual_merchant';
            results.reasons.push(merchantAnomaly.reason);
            results.merchantHistory = merchantAnomaly.history;
        }
        
        // 4. Time-based anomaly detection
        const timeAnomaly = this._detectTimeAnomaly(expense, historicalData);
        
        if (timeAnomaly.isAnomaly) {
            results.isAnomaly = true;
            results.anomalyType = 'time_anomaly';
            results.reasons.push(timeAnomaly.reason);
        }
        
        // 5. Duplicate detection
        const duplicateCheck = await this._detectDuplicate(userId, expense);
        
        if (duplicateCheck.isDuplicate) {
            results.isAnomaly = true;
            results.anomalyType = 'duplicate_transaction';
            results.severity = 'high';
            results.reasons.push(duplicateCheck.reason);
            results.flags = { is_duplicate: true };
        }
        
        return results;
    }
    
    _detectAmountAnomaly(amount, historicalAmounts, sensitivityLevel) {
        const n = historicalAmounts.length;
        const mean = historicalAmounts.reduce((sum, a) => sum + a, 0) / n;
        const variance = historicalAmounts.reduce((sum, a) => 
            sum + Math.pow(a - mean, 2), 0) / n;
        const stdDev = Math.sqrt(variance);
        
        // Calculate z-score
        const zScore = stdDev === 0 ? 0 : (amount - mean) / stdDev;
        
        // Determine threshold based on sensitivity
        let threshold;
        switch (sensitivityLevel) {
            case 'low':
                threshold = 3.0; // 99.7% confidence
                break;
            case 'high':
                threshold = 1.5; // ~86.6% confidence
                break;
            case 'medium':
            default:
                threshold = 2.0; // 95% confidence
        }
        
        const isAnomaly = Math.abs(zScore) > threshold;
        
        // Calculate percentile
        const sortedAmounts = [...historicalAmounts].sort((a, b) => a - b);
        const percentile = (sortedAmounts.filter(a => a <= amount).length / n) * 100;
        
        // Determine severity
        let severity = 'low';
        if (Math.abs(zScore) > 3) {
            severity = 'critical';
        } else if (Math.abs(zScore) > 2.5) {
            severity = 'high';
        } else if (Math.abs(zScore) > 2) {
            severity = 'medium';
        }
        
        return {
            isAnomaly,
            zScore,
            confidence: Math.min(100, Math.abs(zScore) * 33.3),
            severity,
            reason: isAnomaly 
                ? `Amount $${amount.toFixed(2)} is ${Math.abs(zScore).toFixed(1)} standard deviations from average ($${mean.toFixed(2)})`
                : null,
            analysis: {
                z_score: zScore,
                percentile,
                historical_average: mean,
                historical_std_dev: stdDev,
                standard_deviations: Math.abs(zScore)
            }
        };
    }
    
    async _detectFrequencyAnomaly(userId, expense, historicalData) {
        // Check transaction frequency for this category
        const categoryExpenses = historicalData.byCategory[expense.category] || [];
        
        if (categoryExpenses.length < 3) {
            return { isAnomaly: false };
        }
        
        // Calculate average days between transactions
        const sortedDates = categoryExpenses.map(e => e.date).sort((a, b) => a - b);
        const intervals = [];
        
        for (let i = 1; i < sortedDates.length; i++) {
            const daysDiff = (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
            intervals.push(daysDiff);
        }
        
        const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
        const lastTransactionDate = sortedDates[sortedDates.length - 1];
        const daysSinceLastTransaction = (expense.date - lastTransactionDate) / (1000 * 60 * 60 * 24);
        
        // Check if this transaction is too soon
        const isAnomaly = daysSinceLastTransaction < (avgInterval * 0.3) && categoryExpenses.length > 5;
        
        return {
            isAnomaly,
            severity: isAnomaly ? 'medium' : 'low',
            reason: isAnomaly 
                ? `Transaction occurs ${daysSinceLastTransaction.toFixed(0)} days after last transaction (average interval: ${avgInterval.toFixed(0)} days)`
                : null
        };
    }
    
    async _detectMerchantAnomaly(userId, expense, historicalData) {
        if (!expense.description) {
            return { isAnomaly: false };
        }
        
        // Check if merchant is new or unusual
        const allMerchants = historicalData.expenses.map(e => e.description);
        const merchantCount = allMerchants.filter(m => m === expense.description).length;
        
        // New merchant with large transaction
        const avgAmount = historicalData.amounts.reduce((sum, a) => sum + a, 0) / historicalData.amounts.length;
        const isNewMerchant = merchantCount === 0;
        const isLargeAmount = expense.amount > avgAmount * 1.5;
        
        const isAnomaly = isNewMerchant && isLargeAmount;
        
        return {
            isAnomaly,
            reason: isAnomaly 
                ? `New merchant "${expense.description}" with unusually large transaction`
                : null,
            history: {
                total_transactions: merchantCount,
                average_amount: merchantCount > 0 ? 
                    allMerchants.filter(m => m === expense.description)
                        .reduce((sum, _, i, arr) => sum + historicalData.expenses[i].amount, 0) / merchantCount
                    : 0,
                last_transaction_date: merchantCount > 0 ?
                    Math.max(...historicalData.expenses
                        .filter(e => e.description === expense.description)
                        .map(e => e.date))
                    : null
            }
        };
    }
    
    _detectTimeAnomaly(expense, historicalData) {
        // Check if transaction occurs at unusual time (e.g., late night for certain categories)
        const hour = expense.date.getHours();
        
        // Get typical hours for this category
        const categoryExpenses = historicalData.byCategory[expense.category] || [];
        const hours = categoryExpenses.map(e => e.date.getHours());
        
        if (hours.length < 5) {
            return { isAnomaly: false };
        }
        
        const avgHour = hours.reduce((sum, h) => sum + h, 0) / hours.length;
        const hourDiff = Math.abs(hour - avgHour);
        
        // Anomaly if transaction is > 6 hours outside typical range
        const isAnomaly = hourDiff > 6;
        
        return {
            isAnomaly,
            reason: isAnomaly 
                ? `Transaction at ${hour}:00 is unusual (typical time: ${Math.round(avgHour)}:00)`
                : null
        };
    }
    
    async _detectDuplicate(userId, expense) {
        // Look for potential duplicate transactions
        const timeDelta = 5 * 60 * 1000; // 5 minutes
        const startTime = new Date(expense.date.getTime() - timeDelta);
        const endTime = new Date(expense.date.getTime() + timeDelta);
        
        const potentialDuplicates = await Expense.find({
            user: userId,
            _id: { $ne: expense._id },
            amount: expense.amount,
            category: expense.category,
            date: { $gte: startTime, $lte: endTime }
        });
        
        const isDuplicate = potentialDuplicates.length > 0;
        
        return {
            isDuplicate,
            reason: isDuplicate 
                ? `Potential duplicate: similar transaction found within 5 minutes`
                : null
        };
    }
    
    async _getHistoricalData(userId, expense) {
        const lookbackDate = new Date();
        lookbackDate.setDate(lookbackDate.getDate() - 90);
        
        const expenses = await Expense.find({
            user: userId,
            date: { $gte: lookbackDate, $lt: expense.date }
        }).sort({ date: 1 });
        
        // Organize data
        const byCategory = {};
        expenses.forEach(e => {
            if (!byCategory[e.category]) {
                byCategory[e.category] = [];
            }
            byCategory[e.category].push(e);
        });
        
        return {
            expenses,
            amounts: expenses.map(e => e.amount),
            byCategory
        };
    }
    
    async _createAnomaly(userId, expense, results) {
        const anomaly = new SpendingAnomaly({
            user: userId,
            expense_id: expense._id,
            detection_date: new Date(),
            anomaly_type: results.anomalyType,
            severity: results.severity,
            anomaly_details: {
                transaction_amount: expense.amount,
                expected_amount: results.statisticalAnalysis?.historical_average || null,
                deviation_percentage: results.statisticalAnalysis 
                    ? ((expense.amount - results.statisticalAnalysis.historical_average) / 
                       results.statisticalAnalysis.historical_average * 100)
                    : null,
                merchant: expense.description,
                category: expense.category,
                date: expense.date,
                description: results.reasons.join('; ')
            },
            statistical_analysis: results.statisticalAnalysis || {},
            context: {
                merchant_history: results.merchantHistory || null
            },
            flags: results.flags || {},
            recommendations: this._generateAnomalyRecommendations(results)
        });
        
        await anomaly.save();
        
        // Send alert if high severity
        if (results.severity === 'high' || results.severity === 'critical') {
            await anomaly.sendAlert(['email', 'in_app']);
        }
        
        return anomaly;
    }
    
    _generateAnomalyRecommendations(results) {
        const recommendations = [];
        
        if (results.anomalyType === 'amount_spike') {
            recommendations.push({
                action: 'verify_transaction',
                description: 'Verify this transaction is correct and authorized'
            });
            
            if (results.severity === 'high' || results.severity === 'critical') {
                recommendations.push({
                    action: 'update_budget',
                    description: 'Consider adjusting your budget if this is a recurring expense'
                });
            }
        }
        
        if (results.anomalyType === 'unusual_merchant') {
            recommendations.push({
                action: 'verify_transaction',
                description: 'Verify this new merchant transaction is legitimate'
            });
        }
        
        if (results.anomalyType === 'duplicate_transaction') {
            recommendations.push({
                action: 'contact_merchant',
                description: 'Contact merchant to verify if this is a duplicate charge'
            });
            recommendations.push({
                action: 'report_fraud',
                description: 'Report as fraud if unauthorized'
            });
        }
        
        return recommendations;
    }
}

module.exports = new AnomalyDetectionService();
