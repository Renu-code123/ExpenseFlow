const mongoose = require('mongoose');
const TaxProfile = require('../models/TaxProfile');
const TaxCategory = require('../models/TaxCategory');
const Expense = require('../models/Expense');

/**
 * Tax Service - Handles tax calculations, optimization, and deduction tracking
 */
class TaxService {
  init() {
    console.log('Tax service initialized');
  }

  // ==================== TAX PROFILE MANAGEMENT ====================

  /**
   * Get or create tax profile for user and year
   */
  async getOrCreateProfile(userId, taxYear) {
    let profile = await TaxProfile.findOne({ user: userId, taxYear });
    
    if (!profile) {
      profile = new TaxProfile({
        user: userId,
        taxYear,
        taxBrackets: TaxProfile.getDefaultBrackets('IN', 'new'),
        availableDeductions: TaxProfile.getDefaultDeductions('IN')
      });
      await profile.save();
    }
    
    return profile;
  }

  /**
   * Create or update tax profile
   */
  async createOrUpdateProfile(userId, profileData) {
    const taxYear = profileData.taxYear || new Date().getFullYear();
    
    let profile = await TaxProfile.findOne({ user: userId, taxYear });
    
    if (profile) {
      Object.assign(profile, profileData);
    } else {
      profile = new TaxProfile({
        user: userId,
        taxYear,
        ...profileData,
        taxBrackets: TaxProfile.getDefaultBrackets(profileData.country || 'IN', profileData.regime || 'new'),
        availableDeductions: TaxProfile.getDefaultDeductions(profileData.country || 'IN')
      });
    }
    
    await profile.save();
    return profile;
  }

  /**
   * Update tax profile
   */
  async updateProfile(userId, taxYear, updates) {
    const profile = await this.getOrCreateProfile(userId, taxYear);
    Object.assign(profile, updates);
    await profile.save();
    return profile;
  }

  // ==================== TAX CALCULATIONS ====================

  /**
   * Calculate tax for user
   */
  async calculateTax(userId, taxYear, options = {}) {
    const profile = await this.getOrCreateProfile(userId, taxYear);
    
    // Get income from expenses
    const income = await this.calculateTotalIncome(userId, taxYear);
    
    // Get deductions
    const deductions = await this.calculateDeductions(userId, taxYear, profile, options.customDeductions);
    
    // Calculate taxable income
    const taxableIncome = Math.max(0, income.total - deductions.total);
    
    // Calculate tax based on brackets
    const taxCalculation = this.calculateTaxFromBrackets(taxableIncome, profile);
    
    // Apply credits and prepayments
    const finalTax = taxCalculation.totalTax - profile.estimatedTaxCredits;
    const taxDue = finalTax - profile.tdsDeducted - profile.advanceTaxPaid;
    
    return {
      taxYear,
      income,
      deductions,
      taxableIncome,
      taxCalculation,
      credits: profile.estimatedTaxCredits,
      prepayments: {
        tds: profile.tdsDeducted,
        advanceTax: profile.advanceTaxPaid
      },
      finalTax,
      taxDue,
      effectiveRate: income.total > 0 ? ((finalTax / income.total) * 100).toFixed(2) : 0
    };
  }

  /**
   * Calculate total income from expenses
   */
  async calculateTotalIncome(userId, taxYear) {
    const startDate = new Date(taxYear, 3, 1); // April 1
    const endDate = new Date(taxYear + 1, 2, 31); // March 31
    
    const incomeData = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          type: 'income',
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    const breakdown = {};
    let total = 0;
    
    incomeData.forEach(item => {
      breakdown[item._id] = item.total;
      total += item.total;
    });
    
    return { total, breakdown };
  }

  /**
   * Calculate deductions
   */
  async calculateDeductions(userId, taxYear, profile, customDeductions = []) {
    const startDate = new Date(taxYear, 3, 1);
    const endDate = new Date(taxYear + 1, 2, 31);
    
    // Get expense-based deductions
    const expenseDeductions = await Expense.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          type: 'expense',
          date: { $gte: startDate, $lte: endDate },
          isTaxDeductible: true
        }
      },
      {
        $group: {
          _id: '$taxCategory',
          total: { $sum: { $multiply: ['$amount', { $divide: ['$deductiblePercentage', 100] }] } }
        }
      }
    ]);
    
    let total = profile.standardDeduction || 0;
    const breakdown = { standardDeduction: profile.standardDeduction };
    
    // Add expense deductions
    expenseDeductions.forEach(d => {
      breakdown[d._id] = d.total;
      total += d.total;
    });
    
    // Add custom deductions
    customDeductions.forEach(d => {
      breakdown[d.name] = d.amount;
      total += d.amount;
    });
    
    // Add profile custom deductions
    (profile.customDeductions || []).forEach(d => {
      breakdown[d.name] = d.amount;
      total += d.amount;
    });
    
    return { total, breakdown };
  }

  /**
   * Calculate tax from brackets
   */
  calculateTaxFromBrackets(taxableIncome, profile) {
    const brackets = profile.getTaxBrackets();
    let totalTax = 0;
    let remainingIncome = taxableIncome;
    const bracketBreakdown = [];
    
    for (const bracket of brackets) {
      const max = bracket.maxIncome || Infinity;
      const taxableInBracket = Math.min(remainingIncome, max - bracket.minIncome);
      
      if (taxableInBracket > 0) {
        const taxForBracket = (taxableInBracket * bracket.rate) / 100;
        totalTax += taxForBracket;
        bracketBreakdown.push({
          rate: bracket.rate,
          amount: taxableInBracket,
          tax: taxForBracket
        });
        remainingIncome -= taxableInBracket;
      }
      
      if (remainingIncome <= 0) break;
    }
    
    // Add cess (4% for India)
    const cess = totalTax * 0.04;
    
    return {
      totalTax: totalTax + cess,
      baseTax: totalTax,
      cess,
      brackets: bracketBreakdown
    };
  }

  /**
   * Calculate tax estimate
   */
  async calculateTaxEstimate(userId, options = {}) {
    const taxYear = options.taxYear || new Date().getFullYear();
    return await this.calculateTax(userId, taxYear, options);
  }

  /**
   * Calculate quarterly estimate
   */
  async calculateQuarterlyEstimate(userId, quarter, taxYear) {
    const estimate = await this.calculateTax(userId, taxYear);
    const quarterlyPayment = estimate.taxDue / 4;
    
    const dueDates = {
      1: new Date(taxYear, 5, 15), // June 15
      2: new Date(taxYear, 8, 15), // September 15
      3: new Date(taxYear, 11, 15), // December 15
      4: new Date(taxYear + 1, 2, 15) // March 15
    };
    
    return {
      quarter,
      taxYear,
      estimatedAnnualTax: estimate.finalTax,
      quarterlyPayment,
      dueDate: dueDates[quarter],
      totalDue: estimate.taxDue
    };
  }

  // ==================== TAX REGIME COMPARISON ====================

  /**
   * Compare old vs new tax regime
   */
  async compareRegimes(userId, taxYear) {
    const profile = await this.getOrCreateProfile(userId, taxYear);
    const income = await this.calculateTotalIncome(userId, taxYear);
    
    // Calculate for new regime
    const newRegimeBrackets = TaxProfile.getDefaultBrackets(profile.country, 'new');
    const newRegimeTax = this.calculateTaxFromBracketsRaw(income.total - 50000, newRegimeBrackets);
    
    // Calculate for old regime (with deductions)
    const oldRegimeBrackets = TaxProfile.getDefaultBrackets(profile.country, 'old');
    const deductions = await this.calculateDeductions(userId, taxYear, profile);
    const oldRegimeTax = this.calculateTaxFromBracketsRaw(income.total - deductions.total, oldRegimeBrackets);
    
    return {
      income: income.total,
      newRegime: {
        taxableIncome: income.total - 50000,
        tax: newRegimeTax,
        deductions: 50000
      },
      oldRegime: {
        taxableIncome: income.total - deductions.total,
        tax: oldRegimeTax,
        deductions: deductions.total
      },
      recommendation: newRegimeTax < oldRegimeTax ? 'new' : 'old',
      savings: Math.abs(newRegimeTax - oldRegimeTax)
    };
  }

  calculateTaxFromBracketsRaw(taxableIncome, brackets) {
    let totalTax = 0;
    let remainingIncome = Math.max(0, taxableIncome);
    
    for (const bracket of brackets) {
      const max = bracket.maxIncome || Infinity;
      const taxableInBracket = Math.min(remainingIncome, max - bracket.minIncome);
      
      if (taxableInBracket > 0) {
        totalTax += (taxableInBracket * bracket.rate) / 100;
        remainingIncome -= taxableInBracket;
      }
      
      if (remainingIncome <= 0) break;
    }
    
    return totalTax * 1.04; // Add 4% cess
  }

  // ==================== TAX CATEGORIES & DEDUCTIONS ====================

  /**
   * Get deductible categories
   */
  async getDeductibleCategories(country = 'IN') {
    const categories = await TaxCategory.find({
      country,
      type: { $in: ['deductible', 'partially_deductible'] },
      isActive: true
    });
    
    if (categories.length === 0) {
      return TaxCategory.getDefaultCategories(country).filter(
        c => c.type === 'deductible' || c.type === 'partially_deductible'
      );
    }
    
    return categories;
  }

  /**
   * Initialize default categories
   */
  async initializeDefaultCategories(country = 'IN') {
    const existingCount = await TaxCategory.countDocuments({ country });
    if (existingCount > 0) return;
    
    const defaults = TaxCategory.getDefaultCategories(country);
    await TaxCategory.insertMany(defaults);
  }

  /**
   * Auto-tag expense for tax
   */
  async autoTagExpense(expense) {
    const match = await TaxCategory.findMatchingCategory(expense, 'IN');
    
    if (match && match.confidence >= 0.5) {
      return {
        isTaxDeductible: match.category.type !== 'non_deductible',
        taxCategory: match.category.code,
        section: match.category.section,
        deductiblePercentage: match.category.categoryMappings?.[0]?.deductiblePercentage || 100,
        confidence: match.confidence
      };
    }
    
    return {
      isTaxDeductible: false,
      taxCategory: null,
      confidence: 0
    };
  }

  /**
   * Categorize expense for tax
   */
  async categorizeExpenseForTax(userId, expenseId) {
    const expense = await Expense.findOne({ _id: expenseId, user: userId });
    if (!expense) {
      throw new Error('Expense not found');
    }
    
    return await this.autoTagExpense(expense);
  }

  /**
   * Get deductible expenses
   */
  async getDeductibleExpenses(userId, startDate, endDate) {
    const expenses = await Expense.find({
      user: userId,
      date: { $gte: startDate, $lte: endDate },
      isTaxDeductible: true
    }).sort({ date: -1 });
    
    return expenses.map(e => ({
      _id: e._id,
      description: e.description,
      amount: e.amount,
      category: e.category,
      taxCategory: e.taxCategory,
      deductiblePercentage: e.deductiblePercentage || 100,
      deductibleAmount: e.amount * ((e.deductiblePercentage || 100) / 100),
      date: e.date
    }));
  }

  // ==================== TAX SUMMARY & REPORTS ====================

  /**
   * Get tax summary for dashboard
   */
  async getTaxSummary(userId, taxYear) {
    const calculation = await this.calculateTax(userId, taxYear);
    const comparison = await this.compareRegimes(userId, taxYear);
    
    return {
      taxYear,
      totalIncome: calculation.income.total,
      totalDeductions: calculation.deductions.total,
      taxableIncome: calculation.taxableIncome,
      estimatedTax: calculation.finalTax,
      taxDue: calculation.taxDue,
      effectiveRate: calculation.effectiveRate,
      recommendedRegime: comparison.recommendation,
      potentialSavings: comparison.savings
    };
  }

  /**
   * Generate tax report
   */
  async generateTaxReport(userId, taxYear, format = 'summary') {
    const calculation = await this.calculateTax(userId, taxYear);
    const profile = await this.getOrCreateProfile(userId, taxYear);
    
    return {
      taxYear,
      format,
      profile: {
        country: profile.country,
        regime: profile.regime,
        filingStatus: profile.filingStatus
      },
      income: calculation.income,
      deductions: calculation.deductions,
      taxCalculation: calculation.taxCalculation,
      finalTax: calculation.finalTax,
      taxDue: calculation.taxDue,
      generatedAt: new Date()
    };
  }

  /**
   * Generate tax optimizations
   */
  async generateOptimizations(userId) {
    const taxYear = new Date().getFullYear();
    const profile = await this.getOrCreateProfile(userId, taxYear);
    const calculation = await this.calculateTax(userId, taxYear);
    
    const optimizations = [];
    
    // Check 80C limit
    const section80C = calculation.deductions.breakdown['80C'] || 0;
    if (section80C < 150000) {
      optimizations.push({
        type: 'increase_80c',
        title: 'Maximize Section 80C',
        description: `Invest ₹${(150000 - section80C).toLocaleString()} more in 80C instruments`,
        potentialSavings: Math.round((150000 - section80C) * 0.3),
        priority: 'high'
      });
    }
    
    // Check NPS contribution
    optimizations.push({
      type: 'nps_contribution',
      title: 'Consider NPS Contribution',
      description: 'Additional ₹50,000 deduction under Section 80CCD(1B)',
      potentialSavings: Math.round(50000 * 0.3),
      priority: 'medium'
    });
    
    // Regime comparison
    const comparison = await this.compareRegimes(userId, taxYear);
    if (comparison.recommendation !== profile.regime) {
      optimizations.push({
        type: 'regime_switch',
        title: `Switch to ${comparison.recommendation} regime`,
        description: `Save ₹${comparison.savings.toLocaleString()} by switching tax regime`,
        potentialSavings: comparison.savings,
        priority: 'high'
      });
    }
    
    return optimizations;
  }

  /**
   * Get year-end checklist
   */
  async getYearEndChecklist(userId) {
    const taxYear = new Date().getFullYear();
    const calculation = await this.calculateTax(userId, taxYear);
    
    const checklist = [
      {
        item: 'Maximize Section 80C investments',
        completed: (calculation.deductions.breakdown['80C'] || 0) >= 150000,
        deadline: new Date(taxYear + 1, 2, 31),
        details: 'PPF, ELSS, Life Insurance up to ₹1,50,000'
      },
      {
        item: 'Health Insurance Premium (80D)',
        completed: (calculation.deductions.breakdown['80D'] || 0) > 0,
        deadline: new Date(taxYear + 1, 2, 31)
      },
      {
        item: 'Review advance tax payments',
        completed: calculation.taxDue <= 10000,
        deadline: new Date(taxYear + 1, 2, 15)
      },
      {
        item: 'Collect Form 16 from employer',
        completed: false,
        deadline: new Date(taxYear + 1, 5, 15)
      }
    ];
    
    return checklist;
  }

  /**
   * Send quarterly reminder (for cron jobs)
   */
  async sendQuarterlyReminder(userId, quarter) {
    const notificationService = require('./notificationService');
    const estimate = await this.calculateQuarterlyEstimate(userId, quarter, new Date().getFullYear());
    
    await notificationService.sendNotification(userId, {
      title: `Q${quarter} Estimated Tax Payment Due`,
      message: `Your estimated payment of ₹${estimate.quarterlyPayment.toLocaleString()} is due ${estimate.dueDate.toLocaleDateString()}.`,
      type: 'tax_reminder',
      priority: 'high',
      data: estimate
    });
  }
}

module.exports = new TaxService();
