const Subscription = require('../models/Subscription');
const Expense = require('../models/Expense');
const emailService = require('./emailService');
const notificationService = require('./notificationService');

// Common subscription patterns for auto-detection
const SUBSCRIPTION_PATTERNS = {
  streaming: [
    { name: 'Netflix', keywords: ['netflix'], logo: '🎬' },
    { name: 'Amazon Prime', keywords: ['amazon prime', 'prime video'], logo: '📦' },
    { name: 'Disney+', keywords: ['disney+', 'disney plus', 'hotstar'], logo: '🏰' },
    { name: 'HBO Max', keywords: ['hbo', 'hbo max'], logo: '🎭' },
    { name: 'Hulu', keywords: ['hulu'], logo: '📺' }
  ],
  music: [
    { name: 'Spotify', keywords: ['spotify'], logo: '🎵' },
    { name: 'Apple Music', keywords: ['apple music'], logo: '🍎' },
    { name: 'YouTube Music', keywords: ['youtube music', 'yt music'], logo: '🎼' },
    { name: 'Amazon Music', keywords: ['amazon music'], logo: '🎧' }
  ],
  software: [
    { name: 'Microsoft 365', keywords: ['microsoft 365', 'office 365', 'microsoft office'], logo: '💼' },
    { name: 'Adobe Creative Cloud', keywords: ['adobe', 'creative cloud'], logo: '🎨' },
    { name: 'Dropbox', keywords: ['dropbox'], logo: '📁' },
    { name: 'Google One', keywords: ['google one', 'google storage'], logo: '☁️' },
    { name: 'iCloud', keywords: ['icloud', 'apple storage'], logo: '☁️' }
  ],
  fitness: [
    { name: 'Gym Membership', keywords: ['gym', 'fitness', 'gold gym', 'anytime fitness'], logo: '💪' },
    { name: 'Peloton', keywords: ['peloton'], logo: '🚴' },
    { name: 'Headspace', keywords: ['headspace'], logo: '🧘' },
    { name: 'Calm', keywords: ['calm'], logo: '😌' }
  ],
  food_delivery: [
    { name: 'Swiggy', keywords: ['swiggy'], logo: '🍔' },
    { name: 'Zomato', keywords: ['zomato'], logo: '🍕' },
    { name: 'Uber Eats', keywords: ['uber eats'], logo: '🚗' },
    { name: 'DoorDash', keywords: ['doordash'], logo: '🚪' }
  ]
};

class SubscriptionService {
  /**
   * Create a new subscription
   */
  async create(userId, data) {
    const subscription = new Subscription({
      ...data,
      user: userId,
      nextPaymentDate: new Date(data.nextPaymentDate || data.startDate || Date.now())
    });

    // Set trial status if trial end date is provided
    if (data.trialEndDate && new Date(data.trialEndDate) > new Date()) {
      subscription.isInTrial = true;
      subscription.status = 'trial';
    }

    await subscription.save();

    // Send notification
    await notificationService.sendNotification(userId, {
      title: 'Subscription Added',
      message: `You've added ${subscription.name} to your subscriptions.`,
      type: 'subscription_added',
      priority: 'low',
      data: { subscriptionId: subscription._id }
    });

    return subscription;
  }

  /**
   * Get all subscriptions for a user
   */
  async getAllForUser(userId, options = {}) {
    const { status, category, includeInactive = false } = options;
    
    const query = { user: userId };
    
    if (status) {
      query.status = status;
    } else if (!includeInactive) {
      query.status = { $in: ['active', 'trial'] };
    }
    
    if (category) {
      query.category = category;
    }

    return await Subscription.find(query).sort({ nextPaymentDate: 1 });
  }

  /**
   * Get a single subscription
   */
  async getById(subscriptionId, userId) {
    return await Subscription.findOne({
      _id: subscriptionId,
      user: userId
    });
  }

  /**
   * Update a subscription
   */
  async update(subscriptionId, userId, data) {
    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      user: userId
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const allowedFields = [
      'name', 'description', 'amount', 'currency', 'category', 'billingCycle',
      'nextPaymentDate', 'endDate', 'trialEndDate', 'provider', 'website',
      'status', 'paymentMethod', 'reminderEnabled', 'reminderDaysBefore',
      'lastUsedDate', 'usageFrequency', 'notes', 'tags', 'color', 'logo'
    ];

    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        subscription[field] = data[field];
      }
    });

    // Update trial status if needed
    if (data.trialEndDate) {
      subscription.isInTrial = new Date(data.trialEndDate) > new Date();
      if (subscription.isInTrial && subscription.status === 'active') {
        subscription.status = 'trial';
      }
    }

    // Reset reminder flag if payment date changed
    if (data.nextPaymentDate) {
      subscription.reminderSent = false;
    }

    await subscription.save();
    return subscription;
  }

  /**
   * Cancel a subscription
   */
  async cancel(subscriptionId, userId) {
    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      user: userId
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    subscription.status = 'cancelled';
    subscription.endDate = new Date();
    await subscription.save();

    return subscription;
  }

  /**
   * Pause a subscription
   */
  async pause(subscriptionId, userId) {
    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      user: userId
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    subscription.status = 'paused';
    await subscription.save();

    return subscription;
  }

  /**
   * Resume a subscription
   */
  async resume(subscriptionId, userId) {
    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      user: userId
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    subscription.status = subscription.isInTrial ? 'trial' : 'active';
    
    // Update next payment date if it's in the past
    const today = new Date();
    if (new Date(subscription.nextPaymentDate) < today) {
      subscription.nextPaymentDate = subscription.calculateNextPaymentDate();
    }

    await subscription.save();
    return subscription;
  }

  /**
   * Delete a subscription permanently
   */
  async delete(subscriptionId, userId) {
    const result = await Subscription.findOneAndDelete({
      _id: subscriptionId,
      user: userId
    });

    if (!result) {
      throw new Error('Subscription not found');
    }

    return result;
  }

  /**
   * Record a payment for a subscription
   */
  async recordPayment(subscriptionId, userId) {
    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      user: userId
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    subscription.lastPaymentDate = new Date();
    subscription.nextPaymentDate = subscription.calculateNextPaymentDate();
    subscription.totalSpent += subscription.amount;
    subscription.paymentCount += 1;
    subscription.reminderSent = false;

    // If was in trial, move to active
    if (subscription.status === 'trial') {
      subscription.status = 'active';
      subscription.isInTrial = false;
    }

    await subscription.save();
    return subscription;
  }

  /**
   * Mark subscription as used
   */
  async markAsUsed(subscriptionId, userId) {
    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      user: userId
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    subscription.lastUsedDate = new Date();
    await subscription.save();
    return subscription;
  }

  /**
   * Get subscription statistics
   */
  async getStatistics(userId) {
    const subscriptions = await Subscription.find({
      user: userId,
      status: { $in: ['active', 'trial'] }
    });

    const totalMonthly = subscriptions.reduce((sum, sub) => sum + sub.monthlyAmount, 0);
    const totalYearly = subscriptions.reduce((sum, sub) => sum + sub.yearlyAmount, 0);

    // Category breakdown
    const categoryBreakdown = {};
    subscriptions.forEach(sub => {
      if (!categoryBreakdown[sub.category]) {
        categoryBreakdown[sub.category] = { count: 0, monthlyAmount: 0 };
      }
      categoryBreakdown[sub.category].count++;
      categoryBreakdown[sub.category].monthlyAmount += sub.monthlyAmount;
    });

    // Get unused subscriptions
    const unusedSubscriptions = await Subscription.findUnused(userId);

    // Get upcoming payments in next 7 days
    const upcomingPayments = await Subscription.getUpcoming(userId, 7);

    // Get subscriptions in trial
    const trialsEnding = subscriptions.filter(sub => 
      sub.isInTrial && sub.daysUntilTrialEnds !== null && sub.daysUntilTrialEnds <= 7
    );

    // Most expensive subscriptions
    const mostExpensive = [...subscriptions]
      .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
      .slice(0, 5);

    return {
      totalCount: subscriptions.length,
      activeCount: subscriptions.filter(s => s.status === 'active').length,
      trialCount: subscriptions.filter(s => s.status === 'trial').length,
      monthlyTotal: Math.round(totalMonthly * 100) / 100,
      yearlyTotal: Math.round(totalYearly * 100) / 100,
      categoryBreakdown,
      unusedCount: unusedSubscriptions.length,
      unusedMonthlyCost: Math.round(unusedSubscriptions.reduce((sum, sub) => sum + sub.monthlyAmount, 0) * 100) / 100,
      upcomingPayments: upcomingPayments.length,
      upcomingPaymentsAmount: Math.round(upcomingPayments.reduce((sum, sub) => sum + sub.amount, 0) * 100) / 100,
      trialsEndingSoon: trialsEnding.length,
      mostExpensive: mostExpensive.map(s => ({
        id: s._id,
        name: s.name,
        monthlyAmount: Math.round(s.monthlyAmount * 100) / 100
      }))
    };
  }

  /**
   * Get upcoming payments
   */
  async getUpcomingPayments(userId, days = 30) {
    return await Subscription.getUpcoming(userId, days);
  }

  /**
   * Get unused/underutilized subscriptions
   */
  async getUnusedSubscriptions(userId) {
    return await Subscription.findUnused(userId);
  }

  /**
   * Auto-detect subscriptions from expense history
   */
  async detectSubscriptions(userId) {
    console.log(`[SubscriptionService] Detecting subscriptions for user ${userId}`);

    // Get last 90 days of expenses
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const expenses = await Expense.find({
      user: userId,
      type: 'expense',
      date: { $gte: ninetyDaysAgo }
    }).sort({ date: 1 });

    // Group by merchant/description and amount
    const patterns = {};
    expenses.forEach(expense => {
      const key = `${expense.merchant || expense.description}_${expense.amount}`.toLowerCase();
      if (!patterns[key]) {
        patterns[key] = {
          expenses: [],
          merchant: expense.merchant || expense.description,
          amount: expense.amount
        };
      }
      patterns[key].expenses.push(expense);
    });

    // Detect recurring patterns (at least 2 occurrences with similar intervals)
    const detected = [];
    for (const [key, data] of Object.entries(patterns)) {
      if (data.expenses.length >= 2) {
        const intervals = [];
        for (let i = 1; i < data.expenses.length; i++) {
          const diff = new Date(data.expenses[i].date) - new Date(data.expenses[i-1].date);
          intervals.push(Math.round(diff / (1000 * 60 * 60 * 24))); // Days
        }

        // Check if intervals are consistent (within 5 days variance)
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const isConsistent = intervals.every(i => Math.abs(i - avgInterval) <= 5);

        if (isConsistent) {
          const billingCycle = this.detectBillingCycle(avgInterval);
          const matchedService = this.matchKnownService(data.merchant);

          detected.push({
            name: matchedService?.name || data.merchant,
            amount: data.amount,
            billingCycle,
            category: matchedService?.category || 'other',
            confidence: isConsistent ? 85 : 60,
            occurrences: data.expenses.length,
            lastExpense: data.expenses[data.expenses.length - 1],
            logo: matchedService?.logo
          });
        }
      }
    }

    return detected;
  }

  /**
   * Create subscription from detected pattern
   */
  async createFromDetection(userId, detectionData) {
    const nextPaymentDate = new Date(detectionData.lastExpense.date);
    
    // Calculate next payment date based on billing cycle
    switch (detectionData.billingCycle) {
      case 'weekly': nextPaymentDate.setDate(nextPaymentDate.getDate() + 7); break;
      case 'biweekly': nextPaymentDate.setDate(nextPaymentDate.getDate() + 14); break;
      case 'monthly': nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1); break;
      case 'quarterly': nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 3); break;
      case 'yearly': nextPaymentDate.setFullYear(nextPaymentDate.getFullYear() + 1); break;
    }

    const subscription = await this.create(userId, {
      name: detectionData.name,
      amount: detectionData.amount,
      billingCycle: detectionData.billingCycle,
      category: detectionData.category,
      nextPaymentDate,
      startDate: new Date(detectionData.lastExpense.date),
      isAutoDetected: true,
      detectionConfidence: detectionData.confidence,
      logo: detectionData.logo
    });

    return subscription;
  }

  /**
   * Detect billing cycle from average interval
   */
  detectBillingCycle(avgDays) {
    if (avgDays <= 9) return 'weekly';
    if (avgDays <= 18) return 'biweekly';
    if (avgDays <= 45) return 'monthly';
    if (avgDays <= 100) return 'quarterly';
    if (avgDays <= 200) return 'semi_annual';
    return 'yearly';
  }

  /**
   * Match expense to known subscription service
   */
  matchKnownService(merchantName) {
    const lowerName = merchantName.toLowerCase();
    
    for (const [category, services] of Object.entries(SUBSCRIPTION_PATTERNS)) {
      for (const service of services) {
        for (const keyword of service.keywords) {
          if (lowerName.includes(keyword)) {
            return { ...service, category };
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Get cheaper alternatives for a subscription
   */
  getAlternatives(subscription) {
    const alternatives = {
      streaming: [
        { name: 'Free Options', suggestions: ['YouTube (Free)', 'Tubi', 'Pluto TV'] },
        { name: 'Budget Options', suggestions: ['Netflix Basic', 'Disney+ (Annual)', 'Prime Video'] }
      ],
      music: [
        { name: 'Free Options', suggestions: ['Spotify Free', 'YouTube Music Free', 'SoundCloud'] },
        { name: 'Budget Options', suggestions: ['Spotify Student', 'Apple Music Student'] }
      ],
      software: [
        { name: 'Free Options', suggestions: ['Google Docs', 'LibreOffice', 'GIMP'] },
        { name: 'Budget Options', suggestions: ['Office 365 Basic', 'Canva'] }
      ],
      cloud_storage: [
        { name: 'Free Options', suggestions: ['Google Drive 15GB', 'Dropbox 2GB'] },
        { name: 'Budget Options', suggestions: ['Google One 100GB', 'iCloud 50GB'] }
      ]
    };

    return alternatives[subscription.category] || [];
  }

  /**
   * Send renewal reminders for upcoming subscriptions
   */
  async sendRenewalReminders() {
    console.log('[SubscriptionService] Sending renewal reminders...');

    const subscriptions = await Subscription.find({
      status: { $in: ['active', 'trial'] },
      reminderEnabled: true,
      reminderSent: false
    }).populate('user');

    let sentCount = 0;

    for (const subscription of subscriptions) {
      if (subscription.shouldSendReminder()) {
        try {
          await notificationService.sendNotification(subscription.user._id, {
            title: 'Subscription Renewal Reminder',
            message: `Your ${subscription.name} subscription (${subscription.currency} ${subscription.amount}) will renew in ${subscription.daysUntilPayment} days.`,
            type: 'subscription_reminder',
            priority: 'medium',
            data: {
              subscriptionId: subscription._id,
              amount: subscription.amount,
              nextPaymentDate: subscription.nextPaymentDate
            }
          });

          subscription.reminderSent = true;
          await subscription.save();
          sentCount++;
        } catch (error) {
          console.error(`[SubscriptionService] Error sending reminder for ${subscription._id}:`, error);
        }
      }
    }

    console.log(`[SubscriptionService] Sent ${sentCount} renewal reminders`);
    return sentCount;
  }

  /**
   * Send trial ending reminders
   */
  async sendTrialReminders() {
    console.log('[SubscriptionService] Sending trial ending reminders...');

    const subscriptions = await Subscription.find({
      status: 'trial',
      isInTrial: true,
      trialReminderSent: false,
      trialEndDate: { $ne: null }
    }).populate('user');

    let sentCount = 0;

    for (const subscription of subscriptions) {
      if (subscription.shouldSendTrialReminder()) {
        try {
          await notificationService.sendNotification(subscription.user._id, {
            title: 'Trial Ending Soon',
            message: `Your ${subscription.name} trial ends in ${subscription.daysUntilTrialEnds} days. You will be charged ${subscription.currency} ${subscription.amount}.`,
            type: 'trial_ending',
            priority: 'high',
            data: {
              subscriptionId: subscription._id,
              trialEndDate: subscription.trialEndDate,
              amount: subscription.amount
            }
          });

          subscription.trialReminderSent = true;
          await subscription.save();
          sentCount++;
        } catch (error) {
          console.error(`[SubscriptionService] Error sending trial reminder for ${subscription._id}:`, error);
        }
      }
    }

    console.log(`[SubscriptionService] Sent ${sentCount} trial reminders`);
    return sentCount;
  }

  /**
   * Export all subscriptions for a user
   */
  async exportSubscriptions(userId, format = 'json') {
    const subscriptions = await this.getAllForUser(userId, { includeInactive: true });

    if (format === 'csv') {
      const headers = ['Name', 'Amount', 'Currency', 'Billing Cycle', 'Category', 'Status', 'Next Payment', 'Monthly Cost', 'Yearly Cost'];
      const rows = subscriptions.map(sub => [
        sub.name,
        sub.amount,
        sub.currency,
        sub.billingCycle,
        sub.category,
        sub.status,
        sub.nextPaymentDate ? new Date(sub.nextPaymentDate).toISOString().split('T')[0] : '',
        sub.monthlyAmount.toFixed(2),
        sub.yearlyAmount.toFixed(2)
      ]);

      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return subscriptions;
  }
}

module.exports = new SubscriptionService();
