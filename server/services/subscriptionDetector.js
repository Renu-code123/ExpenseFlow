const Expense = require('../models/Expense');
const Subscription = require('../models/Subscription');

class SubscriptionDetector {
    constructor() {
        this.MIN_OCCURRENCES = 3;
        this.MAX_DAY_VARIANCE = 5; // Days
        this.AMOUNT_VARIANCE_THRESHOLD = 0.1; // 10%
    }

    /**
     * Detect subscriptions from transaction history
     */
    async detectSubscriptions(userId) {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        
        const expenses = await Expense.find({
            user: userId,
            type: 'expense',
            date: { $gte: ninetyDaysAgo }
        }).sort({ date: 1 });
        
        // Group by merchant/description
        const merchantGroups = this.groupByMerchant(expenses);
        
        const detectedSubscriptions = [];
        
        for (const [merchant, transactions] of Object.entries(merchantGroups)) {
            if (transactions.length < this.MIN_OCCURRENCES) continue;
            
            const subscription = await this.analyzeRecurringPattern(userId, merchant, transactions);
            
            if (subscription) {
                detectedSubscriptions.push(subscription);
            }
        }
        
        return detectedSubscriptions;
    }

    /**
     * Group expenses by merchant
     */
    groupByMerchant(expenses) {
        const groups = {};
        
        expenses.forEach(expense => {
            const merchant = this.normalizeMerchant(expense.description);
            
            if (!groups[merchant]) {
                groups[merchant] = [];
            }
            
            groups[merchant].push(expense);
        });
        
        return groups;
    }

    /**
     * Normalize merchant name
     */
    normalizeMerchant(description) {
        return description
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[^a-z0-9\s]/g, '');
    }

    /**
     * Analyze if transactions form a recurring pattern
     */
    async analyzeRecurringPattern(userId, merchant, transactions) {
        // Sort by date
        const sorted = transactions.sort((a, b) => a.date - b.date);
        
        // Calculate intervals between transactions
        const intervals = [];
        for (let i = 1; i < sorted.length; i++) {
            const days = (sorted[i].date - sorted[i - 1].date) / (1000 * 60 * 60 * 24);
            intervals.push(days);
        }
        
        // Check if intervals are consistent
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const intervalVariance = this.calculateVariance(intervals);
        
        // If variance is too high, not a subscription
        if (intervalVariance > this.MAX_DAY_VARIANCE) {
            return null;
        }
        
        // Check if amounts are consistent
        const amounts = sorted.map(t => t.amount);
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const amountVariance = this.calculateVariancePercent(amounts, avgAmount);
        
        // If amount variance is too high, not a subscription
        if (amountVariance > this.AMOUNT_VARIANCE_THRESHOLD) {
            return null;
        }
        
        // Determine billing cycle
        const billingCycle = this.determineBillingCycle(avgInterval);
        
        // Calculate next billing date
        const lastTransaction = sorted[sorted.length - 1];
        const nextBillingDate = new Date(lastTransaction.date);
        nextBillingDate.setDate(nextBillingDate.getDate() + avgInterval);
        
        // Check if this subscription already exists
        const existing = await Subscription.findOne({
            user: userId,
            merchant,
            status: 'active'
        });
        
        if (existing) {
            // Update existing subscription
            existing.amount = avgAmount;
            existing.confidence_score = this.calculateConfidence(sorted.length, intervalVariance, amountVariance);
            existing.next_billing_date = nextBillingDate;
            existing.last_billing_date = lastTransaction.date;
            existing.transaction_history = sorted.map(t => ({
                transaction_id: t._id,
                amount: t.amount,
                date: t.date
            }));
            
            await existing.save();
            return existing;
        }
        
        // Create new subscription
        const subscription = new Subscription({
            user: userId,
            name: this.generateSubscriptionName(merchant, sorted[0].category),
            merchant,
            category: sorted[0].category,
            amount: avgAmount,
            billing_cycle: billingCycle,
            billing_day: lastTransaction.date.getDate(),
            next_billing_date: nextBillingDate,
            last_billing_date: lastTransaction.date,
            detection_method: 'auto',
            confidence_score: this.calculateConfidence(sorted.length, intervalVariance, amountVariance),
            status: 'active',
            transaction_history: sorted.map(t => ({
                transaction_id: t._id,
                amount: t.amount,
                date: t.date
            }))
        });
        
        await subscription.save();
        return subscription;
    }

    /**
     * Determine billing cycle from average interval
     */
    determineBillingCycle(avgInterval) {
        if (avgInterval <= 2) return 'daily';
        if (avgInterval <= 8) return 'weekly';
        if (avgInterval <= 35) return 'monthly';
        if (avgInterval <= 100) return 'quarterly';
        return 'yearly';
    }

    /**
     * Calculate variance of values
     */
    calculateVariance(values) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
    }

    /**
     * Calculate variance as percentage
     */
    calculateVariancePercent(values, mean) {
        const variance = this.calculateVariance(values);
        return variance / mean;
    }

    /**
     * Calculate confidence score
     */
    calculateConfidence(occurrences, intervalVariance, amountVariance) {
        let confidence = 0.5;
        
        // More occurrences = higher confidence
        confidence += Math.min(occurrences / 10, 0.3);
        
        // Lower interval variance = higher confidence
        confidence += Math.max(0, 0.1 - intervalVariance / 50);
        
        // Lower amount variance = higher confidence
        confidence += Math.max(0, 0.1 - amountVariance);
        
        return Math.min(confidence, 1);
    }

    /**
     * Generate subscription name
     */
    generateSubscriptionName(merchant, category) {
        const knownSubscriptions = {
            netflix: 'Netflix Subscription',
            spotify: 'Spotify Premium',
            'amazon prime': 'Amazon Prime',
            hotstar: 'Disney+ Hotstar',
            youtube: 'YouTube Premium',
            gym: 'Gym Membership',
            insurance: 'Insurance Premium',
            rent: 'Rent Payment'
        };
        
        const merchantLower = merchant.toLowerCase();
        
        for (const [key, name] of Object.entries(knownSubscriptions)) {
            if (merchantLower.includes(key)) {
                return name;
            }
        }
        
        // Generate generic name
        const categoryNames = {
            entertainment: 'Entertainment Subscription',
            utilities: 'Utility Service',
            healthcare: 'Health Service',
            other: 'Recurring Payment'
        };
        
        return categoryNames[category] || `${merchant} Subscription`;
    }

    /**
     * Check for upcoming subscription renewals
     */
    async checkUpcomingRenewals(userId, daysAhead = 3) {
        const upcoming = await Subscription.getUpcoming(userId, daysAhead);
        return upcoming.filter(sub => !sub.reminder_sent);
    }

    /**
     * Mark reminder as sent
     */
    async markReminderSent(subscriptionId) {
        const subscription = await Subscription.findById(subscriptionId);
        if (subscription) {
            subscription.reminder_sent = true;
            subscription.reminder_date = new Date();
            await subscription.save();
        }
    }

    /**
     * Identify unused subscriptions
     */
    async identifyUnusedSubscriptions(userId) {
        const subscriptions = await Subscription.find({
            user: userId,
            status: 'active'
        });
        
        const unused = [];
        
        for (const sub of subscriptions) {
            // Check if there's been any related activity
            const recentActivity = await Expense.findOne({
                user: userId,
                description: { $regex: new RegExp(sub.merchant, 'i') },
                date: { $gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
                type: 'expense'
            });
            
            // If subscription is entertainment and no usage detected
            if (!recentActivity && sub.category === 'entertainment') {
                unused.push({
                    subscription: sub,
                    reason: 'No recent usage detected',
                    potential_savings: sub.annual_cost
                });
            }
        }
        
        return unused;
    }
}

module.exports = new SubscriptionDetector();
