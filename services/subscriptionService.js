const Subscription = require('../models/Subscription');
const Expense = require('../models/Expense');
const predictiveMath = require('../utils/predictiveMath');
const eventDispatcher = require('./eventDispatcher');

/**
 * Enhanced Subscription Service
 * Issue #647: Automated Lifecycle & Predictive Engine
 */
class SubscriptionService {
  /**
   * Create a new subscription with intelligent defaults
   */
  async create(userId, data) {
    const subscription = new Subscription({
      ...data,
      user: userId,
      nextPaymentDate: new Date(data.nextPaymentDate || data.startDate || Date.now())
    });

    if (data.trialEndDate && new Date(data.trialEndDate) > new Date()) {
      subscription.isInTrial = true;
      subscription.status = 'trial';
    }

    await subscription.save();

    // Notify other systems (e.g., budget alerts)
    eventDispatcher.dispatch('subscription:created', { userId, subscriptionId: subscription._id });

    return subscription;
  }

  /**
   * Get comprehensive forecast for a user
   */
  async getForecast(userId, days = 30) {
    const subscriptions = await Subscription.find({
      user: userId,
      status: { $in: ['active', 'trial', 'grace_period'] }
    });

    return predictiveMath.forecastImpact(subscriptions, days);
  }

  /**
   * Process due renewals and update state
   */
  async processDueRenewals() {
    console.log('[SubscriptionService] Processing due renewals...');
    const due = await Subscription.getUpcomingForProcess();

    const results = { processed: 0, renewed: 0, expired: 0, failed: 0 };

    for (const sub of due) {
      try {
        results.processed++;

        // Logic for auto-renewal vs expiry
        if (sub.status === 'cancelled') {
          sub.transitionTo('expired', 'Natural expiry after cancellation period');
          results.expired++;
        } else if (sub.status === 'trial' && sub.trialEndDate <= new Date()) {
          // Conversion check: in a real app, verify payment method presence
          sub.transitionTo('active', 'Trial converted to active subscription');
          sub.isInTrial = false;
          await this._recordRenewal(sub);
          results.renewed++;
        } else {
          // Standard renewal
          await this._recordRenewal(sub);
          results.renewed++;
        }

        await sub.save();
      } catch (error) {
        console.error(`[SubscriptionService] Error processing ${sub._id}:`, error);
        results.failed++;
      }
    }

    return results;
  }

  /**
   * Record a payment and update metrics
   */
  async _recordRenewal(sub) {
    sub.lastPaymentDate = new Date();
    sub.totalSpent += sub.amount;
    sub.paymentCount += 1;
    sub.nextPaymentDate = sub.calculateNextPaymentDate();
    sub.reminderSent = false;

    // Create actual expense record in history
    await Expense.create({
      user: sub.user,
      amount: sub.amount,
      currency: sub.currency,
      category: sub.category,
      description: `Subscription: ${sub.name}`,
      date: new Date(),
      type: 'expense',
      merchant: sub.merchant,
      metadata: { subscriptionId: sub._id, isAutomated: true }
    });
  }

  /**
   * Health Check: Identify high-risk/unused subscriptions
   */
  async getAudit(userId) {
    const subscriptions = await Subscription.find({ user: userId, status: 'active' });

    const audit = {
      underutilized: [],
      highImpact: [],
      upcomingTrials: []
    };

    subscriptions.forEach(sub => {
      const probability = predictiveMath.calculateRenewalProbability(sub);

      if (probability < 40) {
        audit.underutilized.push({
          id: sub._id,
          name: sub.name,
          score: probability,
          reason: 'Low usage frequency detected'
        });
      }

      if (sub.monthlyAmount > 5000) {
        audit.highImpact.push({
          id: sub._id,
          name: sub.name,
          monthlyCost: sub.monthlyAmount
        });
      }
    });

    const trials = await Subscription.find({
      user: userId,
      status: 'trial',
      trialEndDate: { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
    });

    audit.upcomingTrials = trials.map(t => ({
      name: t.name,
      endsIn: t.daysUntilTrialEnds
    }));

    return audit;
  }

  /**
   * Detect potential new subscriptions from recent expenses
   */
  async detectNewSubscriptions(userId) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const expenses = await Expense.find({
      user: userId,
      date: { $gte: ninetyDaysAgo }
    }).sort({ date: 1 });

    const merchantGroups = {};
    expenses.forEach(e => {
      const key = e.merchant || e.description;
      if (!key) return;
      if (!merchantGroups[key]) merchantGroups[key] = [];
      merchantGroups[key].push(e);
    });

    const detected = [];
    for (const [name, items] of Object.entries(merchantGroups)) {
      if (items.length >= 3) {
        // Check interval consistency
        const intervals = [];
        for (let i = 1; i < items.length; i++) {
          intervals.push((items[i].date - items[i - 1].date) / (1000 * 60 * 60 * 24));
        }

        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / intervals.length;

        if (variance < 25) { // Threshold for "recurring"
          detected.push({
            merchant: name,
            frequency: items.length,
            averageAmount: items.reduce((a, b) => a + b.amount, 0) / items.length,
            confidence: 100 - (variance * 2)
          });
        }
      }
    }

    return detected;
  }
}

module.exports = new SubscriptionService();
