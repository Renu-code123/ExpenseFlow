/**
 * Subscription Discovery Service - Issue #444
 * Scans past transactions to detect periodic subscription patterns
 * Identifies same merchant/amount within 28-32 day windows
 */

const Expense = require('../models/Expense');
const RecurringExpense = require('../models/RecurringExpense');
const mongoose = require('mongoose');

class DiscoveryService {
  constructor() {
    // Pattern detection thresholds
    this.MONTHLY_WINDOW_MIN = 25; // Minimum days between recurring transactions
    this.MONTHLY_WINDOW_MAX = 35; // Maximum days between recurring transactions
    this.WEEKLY_WINDOW_MIN = 5;
    this.WEEKLY_WINDOW_MAX = 9;
    this.AMOUNT_TOLERANCE = 0.05; // 5% tolerance for amount matching
    this.MIN_OCCURRENCES = 2; // Minimum occurrences to detect a pattern
    this.LOOKBACK_MONTHS = 6; // How far back to look for patterns
    
    // Common subscription keywords
    this.SUBSCRIPTION_KEYWORDS = [
      'netflix', 'spotify', 'amazon prime', 'disney', 'hulu', 'hbo',
      'apple music', 'youtube', 'adobe', 'microsoft', 'dropbox',
      'github', 'slack', 'zoom', 'gym', 'fitness', 'membership',
      'subscription', 'monthly', 'premium', 'plus', 'pro'
    ];
  }

  /**
   * Main method: Scan for all subscription patterns
   * @param {string} userId - User ID
   * @returns {Object} Detected subscriptions and statistics
   */
  async discoverSubscriptions(userId) {
    const lookbackDate = new Date();
    lookbackDate.setMonth(lookbackDate.getMonth() - this.LOOKBACK_MONTHS);

    // Get all expense transactions in the lookback period
    const transactions = await Expense.find({
      user: new mongoose.Types.ObjectId(userId),
      type: 'expense',
      date: { $gte: lookbackDate }
    }).sort({ date: 1 });

    if (transactions.length < this.MIN_OCCURRENCES) {
      return {
        detected: [],
        stats: { totalScanned: transactions.length, patternsFound: 0 }
      };
    }

    // Group transactions by merchant/description similarity
    const groupedByMerchant = this.groupByMerchant(transactions);
    
    // Detect patterns in each group
    const detectedPatterns = [];
    
    for (const [key, txns] of Object.entries(groupedByMerchant)) {
      if (txns.length < this.MIN_OCCURRENCES) continue;
      
      const pattern = this.detectPattern(txns);
      if (pattern) {
        pattern.merchantKey = key;
        pattern.confidence = this.calculateConfidence(pattern, txns);
        detectedPatterns.push(pattern);
      }
    }

    // Get existing recurring expenses to avoid duplicates
    const existingRecurring = await RecurringExpense.find({
      user: userId,
      isActive: true
    });

    // Filter out already tracked subscriptions
    const newDetections = detectedPatterns.filter(pattern => 
      !this.isAlreadyTracked(pattern, existingRecurring)
    );

    // Calculate statistics
    const monthlyTotal = newDetections
      .filter(p => p.frequency === 'monthly')
      .reduce((sum, p) => sum + p.averageAmount, 0);

    const weeklyTotal = newDetections
      .filter(p => p.frequency === 'weekly')
      .reduce((sum, p) => sum + (p.averageAmount * 4.33), 0);

    return {
      detected: newDetections.sort((a, b) => b.confidence - a.confidence),
      existing: existingRecurring.length,
      stats: {
        totalScanned: transactions.length,
        patternsFound: detectedPatterns.length,
        newDetections: newDetections.length,
        estimatedMonthlyTotal: Math.round((monthlyTotal + weeklyTotal) * 100) / 100
      }
    };
  }

  /**
   * Group transactions by normalized merchant/description
   */
  groupByMerchant(transactions) {
    const groups = {};
    
    transactions.forEach(txn => {
      const key = this.normalizeKey(txn.merchant || txn.description);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(txn);
    });

    return groups;
  }

  /**
   * Normalize merchant/description for grouping
   */
  normalizeKey(text) {
    if (!text) return 'unknown';
    
    // Lowercase, remove special chars, trim
    let normalized = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Remove common transaction ID patterns
    normalized = normalized.replace(/\b\d{4,}\b/g, '').trim();
    
    // Take first 3 significant words
    const words = normalized.split(' ').filter(w => w.length > 2);
    return words.slice(0, 3).join(' ') || normalized;
  }

  /**
   * Detect recurring pattern in a group of transactions
   */
  detectPattern(transactions) {
    if (transactions.length < this.MIN_OCCURRENCES) return null;

    // Sort by date
    const sorted = [...transactions].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    // Calculate intervals between consecutive transactions
    const intervals = [];
    for (let i = 1; i < sorted.length; i++) {
      const daysDiff = Math.round(
        (new Date(sorted[i].date) - new Date(sorted[i-1].date)) / (1000 * 60 * 60 * 24)
      );
      intervals.push(daysDiff);
    }

    if (intervals.length === 0) return null;

    // Determine frequency based on interval clustering
    const frequency = this.determineFrequency(intervals);
    if (!frequency) return null;

    // Calculate amount statistics
    const amounts = sorted.map(t => t.amount);
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const amountVariance = this.calculateVariance(amounts);

    // Check if amounts are consistent (within tolerance)
    const isAmountConsistent = (Math.sqrt(amountVariance) / avgAmount) <= this.AMOUNT_TOLERANCE;

    // Get representative transaction info
    const latestTxn = sorted[sorted.length - 1];
    const merchantName = latestTxn.merchant || latestTxn.description;

    // Calculate next expected date
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const nextExpectedDate = new Date(latestTxn.date);
    nextExpectedDate.setDate(nextExpectedDate.getDate() + Math.round(avgInterval));

    // Check if likely a subscription based on keywords
    const isLikelySubscription = this.checkSubscriptionKeywords(merchantName);

    return {
      merchantName,
      frequency,
      averageAmount: Math.round(avgAmount * 100) / 100,
      amountConsistent: isAmountConsistent,
      occurrences: sorted.length,
      averageInterval: Math.round(avgInterval),
      lastChargeDate: latestTxn.date,
      nextExpectedDate,
      category: latestTxn.category,
      isLikelySubscription,
      transactions: sorted.map(t => ({
        id: t._id,
        date: t.date,
        amount: t.amount
      }))
    };
  }

  /**
   * Determine transaction frequency based on intervals
   */
  determineFrequency(intervals) {
    if (intervals.length === 0) return null;

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = this.calculateVariance(intervals);
    const stdDev = Math.sqrt(variance);

    // Check if intervals are consistent enough
    const coefficientOfVariation = stdDev / avgInterval;
    if (coefficientOfVariation > 0.3) return null; // Too much variance

    // Classify frequency
    if (avgInterval >= this.MONTHLY_WINDOW_MIN && avgInterval <= this.MONTHLY_WINDOW_MAX) {
      return 'monthly';
    } else if (avgInterval >= this.WEEKLY_WINDOW_MIN && avgInterval <= this.WEEKLY_WINDOW_MAX) {
      return 'weekly';
    } else if (avgInterval >= 12 && avgInterval <= 16) {
      return 'biweekly';
    } else if (avgInterval >= 84 && avgInterval <= 98) {
      return 'quarterly';
    } else if (avgInterval >= 355 && avgInterval <= 375) {
      return 'yearly';
    }

    return null;
  }

  /**
   * Calculate variance of values
   */
  calculateVariance(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  /**
   * Calculate confidence score for a detected pattern
   */
  calculateConfidence(pattern, transactions) {
    let confidence = 0.5; // Base confidence

    // More occurrences = higher confidence
    if (pattern.occurrences >= 6) confidence += 0.2;
    else if (pattern.occurrences >= 4) confidence += 0.15;
    else if (pattern.occurrences >= 3) confidence += 0.1;

    // Amount consistency bonus
    if (pattern.amountConsistent) confidence += 0.15;

    // Subscription keyword bonus
    if (pattern.isLikelySubscription) confidence += 0.1;

    // Regular intervals bonus
    const intervalVariance = this.calculateVariance(
      transactions.map(t => t.date).reduce((intervals, date, i, arr) => {
        if (i > 0) {
          intervals.push(Math.round(
            (new Date(date) - new Date(arr[i-1])) / (1000 * 60 * 60 * 24)
          ));
        }
        return intervals;
      }, [])
    );
    if (intervalVariance < 3) confidence += 0.1;

    return Math.min(0.99, Math.round(confidence * 100) / 100);
  }

  /**
   * Check if merchant name contains subscription-related keywords
   */
  checkSubscriptionKeywords(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return this.SUBSCRIPTION_KEYWORDS.some(keyword => lower.includes(keyword));
  }

  /**
   * Check if pattern is already tracked as recurring expense
   */
  isAlreadyTracked(pattern, existingRecurring) {
    return existingRecurring.some(recurring => {
      // Check merchant/description similarity
      const existingKey = this.normalizeKey(recurring.description);
      const patternKey = this.normalizeKey(pattern.merchantName);
      
      if (existingKey !== patternKey) return false;

      // Check amount similarity (within tolerance)
      const amountDiff = Math.abs(recurring.amount - pattern.averageAmount);
      const amountMatch = (amountDiff / pattern.averageAmount) <= this.AMOUNT_TOLERANCE;

      return amountMatch;
    });
  }

  /**
   * Convert detected pattern to RecurringExpense format for saving
   */
  async confirmSubscription(userId, detection) {
    const startDate = new Date();
    
    const recurringData = {
      user: userId,
      description: detection.merchantName,
      amount: detection.averageAmount,
      category: detection.category || 'subscription',
      type: 'expense',
      frequency: detection.frequency,
      startDate,
      nextDueDate: detection.nextExpectedDate,
      isActive: true,
      autoCreate: true,
      reminderDays: 3,
      notes: `Auto-detected subscription (${detection.occurrences} occurrences, ${Math.round(detection.confidence * 100)}% confidence)`,
      tags: ['auto-detected', 'subscription']
    };

    const recurring = new RecurringExpense(recurringData);
    await recurring.save();

    return recurring;
  }

  /**
   * Batch confirm multiple detected subscriptions
   */
  async confirmMultiple(userId, detectionIds, detections) {
    const results = {
      confirmed: [],
      failed: []
    };

    for (const id of detectionIds) {
      const detection = detections.find(d => d.merchantKey === id);
      if (!detection) {
        results.failed.push({ id, reason: 'Detection not found' });
        continue;
      }

      try {
        const recurring = await this.confirmSubscription(userId, detection);
        results.confirmed.push({
          id,
          recurringId: recurring._id,
          description: recurring.description
        });
      } catch (error) {
        results.failed.push({ id, reason: error.message });
      }
    }

    return results;
  }

  /**
   * Calculate burn rate from all subscriptions (detected + existing)
   */
  async calculateBurnRate(userId) {
    // Get confirmed recurring expenses
    const recurring = await RecurringExpense.find({
      user: userId,
      isActive: true,
      isPaused: false,
      type: 'expense'
    });

    // Calculate monthly equivalent for each
    let monthlyBurn = 0;
    const breakdown = [];

    recurring.forEach(item => {
      const monthlyAmount = item.getMonthlyEstimate();
      monthlyBurn += monthlyAmount;
      
      breakdown.push({
        id: item._id,
        description: item.description,
        amount: item.amount,
        frequency: item.frequency,
        monthlyEquivalent: Math.round(monthlyAmount * 100) / 100,
        nextDueDate: item.nextDueDate,
        category: item.category
      });
    });

    // Sort by monthly equivalent (highest first)
    breakdown.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);

    return {
      monthlyBurnRate: Math.round(monthlyBurn * 100) / 100,
      weeklyBurnRate: Math.round((monthlyBurn / 4.33) * 100) / 100,
      dailyBurnRate: Math.round((monthlyBurn / 30) * 100) / 100,
      annualProjection: Math.round(monthlyBurn * 12 * 100) / 100,
      totalSubscriptions: recurring.length,
      breakdown,
      calculatedAt: new Date()
    };
  }

  /**
   * Get upcoming subscription charges for the next N days
   */
  async getUpcomingCharges(userId, days = 30) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const upcoming = await RecurringExpense.find({
      user: userId,
      isActive: true,
      isPaused: false,
      type: 'expense',
      nextDueDate: { $lte: futureDate }
    }).sort({ nextDueDate: 1 });

    const charges = upcoming.map(item => ({
      id: item._id,
      description: item.description,
      amount: item.amount,
      dueDate: item.nextDueDate,
      daysUntilDue: Math.ceil((new Date(item.nextDueDate) - new Date()) / (1000 * 60 * 60 * 24)),
      category: item.category,
      frequency: item.frequency
    }));

    const totalUpcoming = charges.reduce((sum, c) => sum + c.amount, 0);

    return {
      charges,
      totalAmount: Math.round(totalUpcoming * 100) / 100,
      count: charges.length,
      period: `Next ${days} days`
    };
  }
}

module.exports = new DiscoveryService();
