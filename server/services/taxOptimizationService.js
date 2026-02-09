const TaxProfile = require('../models/TaxProfile');
const TaxRule = require('../models/TaxRule');
const TaxDocument = require('../models/TaxDocument');
const Expense = require('../models/Expense');

class TaxOptimizationService {
    // ==================== TAX CALCULATIONS ====================
    
    async calculateUserTax(userId, taxYear = null) {
        const year = taxYear || new Date().getFullYear();
        const profile = await TaxProfile.getUserProfile(userId);
        
        if (!profile) {
            throw new Error('Tax profile not found. Please create a tax profile first.');
        }
        
        // Get applicable tax rules
        const taxRules = await TaxRule.getRulesByType(
            profile.primary_jurisdiction.country,
            'income_tax',
            year
        );
        
        if (!taxRules) {
            throw new Error(`Tax rules not found for ${profile.primary_jurisdiction.country} ${year}`);
        }
        
        // Calculate income
        const totalIncome = profile.total_annual_income;
        
        // Determine deduction
        const standardDeduction = taxRules.getStandardDeduction(profile.filing_status);
        const shouldItemize = profile.shouldItemize(standardDeduction);
        const deduction = shouldItemize ? profile.total_itemized_deductions : standardDeduction;
        
        // Calculate taxable income
        const taxableIncome = Math.max(0, totalIncome - deduction - profile.total_tax_advantaged_contributions);
        
        // Calculate tax
        const totalTax = taxRules.calculateTax(taxableIncome, profile.filing_status);
        
        // Update profile with bracket info
        const bracket = taxRules.getTaxBracket(taxableIncome, profile.filing_status);
        const effectiveRate = (totalTax / totalIncome * 100).toFixed(2);
        
        await profile.updateTaxBracket(
            bracket ? bracket.rate : 0,
            0, // State bracket - would need separate calculation
            effectiveRate,
            bracket ? bracket.rate : 0
        );
        
        return {
            total_income: totalIncome,
            deduction_type: shouldItemize ? 'itemized' : 'standard',
            deduction_amount: deduction,
            taxable_income: taxableIncome,
            total_tax: totalTax,
            effective_rate: effectiveRate,
            marginal_rate: bracket ? bracket.rate : 0,
            tax_bracket: bracket
        };
    }
    
    // ==================== TAX LOSS HARVESTING ====================
    
    async identifyTaxLossHarvestingOpportunities(userId, taxYear = null) {
        const year = taxYear || new Date().getFullYear();
        const profile = await TaxProfile.getUserProfile(userId);
        
        if (!profile || !profile.tax_preferences.enable_tax_loss_harvesting) {
            return [];
        }
        
        // Get capital gains/losses from expenses (would integrate with investment tracking)
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year, 11, 31);
        
        const investmentExpenses = await Expense.find({
            user: userId,
            date: { $gte: startOfYear, $lte: endOfYear },
            category: { $in: ['Investment', 'Stock', 'Crypto'] },
            type: 'expense' // Represents sales
        }).sort({ date: 1 });
        
        const opportunities = [];
        let totalGains = 0;
        let totalLosses = 0;
        
        for (const expense of investmentExpenses) {
            // Check if this represents a gain or loss
            const gainLoss = expense.notes ? this.parseGainLoss(expense.notes) : null;
            
            if (gainLoss) {
                if (gainLoss.amount > 0) {
                    totalGains += gainLoss.amount;
                } else {
                    totalLosses += Math.abs(gainLoss.amount);
                }
            }
        }
        
        // Identify if harvesting would be beneficial
        if (totalGains > totalLosses) {
            const potentialHarvest = totalGains - totalLosses;
            const profile = await TaxProfile.getUserProfile(userId);
            const taxRules = await TaxRule.getRulesByType(profile.primary_jurisdiction.country, 'capital_gains');
            
            if (taxRules) {
                const taxRate = taxRules.capital_gains_rules.short_term.rate || 20;
                const potentialSavings = potentialHarvest * (taxRate / 100);
                
                opportunities.push({
                    type: 'tax_loss_harvest',
                    title: 'Harvest Tax Losses to Offset Gains',
                    description: `You have ₹${totalGains.toFixed(2)} in capital gains. Consider harvesting losses to reduce tax liability.`,
                    unrealized_gains: totalGains,
                    realized_losses: totalLosses,
                    potential_harvest: potentialHarvest,
                    potential_savings: potentialSavings,
                    deadline: new Date(year, 11, 31),
                    priority: potentialSavings > 10000 ? 'high' : 'medium'
                });
            }
        }
        
        return opportunities;
    }
    
    // ==================== WASH SALE DETECTION ====================
    
    async detectWashSales(userId, taxYear = null) {
        const year = taxYear || new Date().getFullYear();
        const profile = await TaxProfile.getUserProfile(userId);
        
        if (!profile || !profile.tax_preferences.enable_wash_sale_detection) {
            return [];
        }
        
        const taxRules = await TaxRule.getRulesByType(
            profile.primary_jurisdiction.country,
            'wash_sale',
            year
        );
        
        if (!taxRules || !taxRules.wash_sale_rules.enabled) {
            return [];
        }
        
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year, 11, 31);
        
        // Get all investment transactions
        const transactions = await Expense.find({
            user: userId,
            date: { $gte: startOfYear, $lte: endOfYear },
            category: { $in: ['Investment', 'Stock', 'Crypto'] }
        }).sort({ date: 1 });
        
        const washSales = [];
        const windowDays = taxRules.wash_sale_rules.days_before + taxRules.wash_sale_rules.days_after;
        
        // Group transactions by asset (would need better asset tracking)
        const salesAtLoss = transactions.filter(t => {
            const gainLoss = this.parseGainLoss(t.notes);
            return gainLoss && gainLoss.amount < 0 && t.type === 'expense';
        });
        
        for (const sale of salesAtLoss) {
            // Look for purchases of same asset within wash sale window
            const saleDate = sale.date;
            const windowStart = new Date(saleDate.getTime() - windowDays * 24 * 60 * 60 * 1000);
            const windowEnd = new Date(saleDate.getTime() + windowDays * 24 * 60 * 60 * 1000);
            
            const suspiciousPurchases = transactions.filter(t => 
                t.type === 'income' && // Represents purchases
                t.date >= windowStart &&
                t.date <= windowEnd &&
                t.description === sale.description // Same asset
            );
            
            if (suspiciousPurchases.length > 0) {
                washSales.push({
                    sale_date: saleDate,
                    sale_id: sale._id,
                    asset: sale.description,
                    loss_amount: Math.abs(this.parseGainLoss(sale.notes)?.amount || 0),
                    repurchase_dates: suspiciousPurchases.map(p => p.date),
                    warning: 'Potential wash sale detected - loss may be disallowed',
                    recommendation: 'Wait 31 days before repurchasing or consider similar but not identical securities'
                });
            }
        }
        
        return washSales;
    }
    
    // ==================== CAPITAL GAINS CATEGORIZATION ====================
    
    async categorizeCapitalGains(userId, taxYear = null) {
        const year = taxYear || new Date().getFullYear();
        const profile = await TaxProfile.getUserProfile(userId);
        
        if (!profile) {
            throw new Error('Tax profile not found');
        }
        
        const taxRules = await TaxRule.getRulesByType(
            profile.primary_jurisdiction.country,
            'capital_gains',
            year
        );
        
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year, 11, 31);
        
        const transactions = await Expense.find({
            user: userId,
            date: { $gte: startOfYear, $lte: endOfYear },
            category: { $in: ['Investment', 'Stock', 'Crypto'] },
            type: 'expense'
        });
        
        const shortTerm = [];
        const longTerm = [];
        let shortTermTotal = 0;
        let longTermTotal = 0;
        
        for (const transaction of transactions) {
            const gainLoss = this.parseGainLoss(transaction.notes);
            if (!gainLoss) continue;
            
            const holdingDays = gainLoss.holding_days || 0;
            const thresholdDays = taxRules?.capital_gains_rules.short_term.holding_period_days || 365;
            
            if (holdingDays < thresholdDays) {
                shortTerm.push({
                    ...transaction.toObject(),
                    gain_loss: gainLoss.amount,
                    holding_days: holdingDays
                });
                shortTermTotal += gainLoss.amount;
            } else {
                longTerm.push({
                    ...transaction.toObject(),
                    gain_loss: gainLoss.amount,
                    holding_days: holdingDays
                });
                longTermTotal += gainLoss.amount;
            }
        }
        
        // Calculate tax implications
        const income = profile.total_annual_income;
        const shortTermRate = taxRules ? taxRules.getCapitalGainsRate(180, income, profile.filing_status) : 25;
        const longTermRate = taxRules ? taxRules.getCapitalGainsRate(400, income, profile.filing_status) : 15;
        
        return {
            short_term: {
                transactions: shortTerm,
                total: shortTermTotal,
                count: shortTerm.length,
                tax_rate: shortTermRate,
                estimated_tax: shortTermTotal > 0 ? shortTermTotal * (shortTermRate / 100) : 0
            },
            long_term: {
                transactions: longTerm,
                total: longTermTotal,
                count: longTerm.length,
                tax_rate: longTermRate,
                estimated_tax: longTermTotal > 0 ? longTermTotal * (longTermRate / 100) : 0
            },
            total_gains: shortTermTotal + longTermTotal,
            total_tax: (shortTermTotal > 0 ? shortTermTotal * (shortTermRate / 100) : 0) +
                      (longTermTotal > 0 ? longTermTotal * (longTermRate / 100) : 0)
        };
    }
    
    // ==================== TAX BRACKET OPTIMIZATION ====================
    
    async optimizeTaxBracket(userId, taxYear = null) {
        const year = taxYear || new Date().getFullYear();
        const taxCalculation = await this.calculateUserTax(userId, year);
        const profile = await TaxProfile.getUserProfile(userId);
        
        const suggestions = [];
        
        // Check if near bracket threshold
        const taxRules = await TaxRule.getRulesByType(
            profile.primary_jurisdiction.country,
            'income_tax',
            year
        );
        
        if (taxRules) {
            const currentBracket = taxRules.getTaxBracket(
                taxCalculation.taxable_income,
                profile.filing_status
            );
            
            // Check distance to next bracket
            if (currentBracket && currentBracket.max_income) {
                const distanceToNext = currentBracket.max_income - taxCalculation.taxable_income;
                
                if (distanceToNext < 50000 && distanceToNext > 0) {
                    suggestions.push({
                        type: 'defer_income',
                        title: 'Consider Deferring Income',
                        description: `You are ₹${distanceToNext.toFixed(2)} away from the next tax bracket. Consider deferring bonuses or income to next year.`,
                        potential_savings: distanceToNext * (currentBracket.rate / 100),
                        deadline: new Date(year, 11, 31),
                        priority: 'medium'
                    });
                }
            }
        }
        
        // Check retirement contribution opportunities
        const contributionRoom = this.calculateContributionRoom(profile);
        if (contributionRoom.total > 0) {
            const taxSavings = contributionRoom.total * (taxCalculation.marginal_rate / 100);
            suggestions.push({
                type: 'contribution_increase',
                title: 'Maximize Retirement Contributions',
                description: `You have ₹${contributionRoom.total.toFixed(2)} in unused retirement contribution room. Maxing out could save ₹${taxSavings.toFixed(2)} in taxes.`,
                potential_savings: taxSavings,
                deadline: new Date(year, 11, 31),
                priority: taxSavings > 20000 ? 'high' : 'medium'
            });
        }
        
        return {
            current_situation: taxCalculation,
            optimization_suggestions: suggestions,
            bracket_analysis: {
                current_bracket: taxCalculation.tax_bracket,
                distance_to_next_bracket: currentBracket ? 
                    (currentBracket.max_income - taxCalculation.taxable_income) : null
            }
        };
    }
    
    // ==================== ESTIMATED TAX CALCULATOR ====================
    
    async calculateEstimatedTax(userId, taxYear = null) {
        const year = taxYear || new Date().getFullYear();
        const taxCalculation = await this.calculateUserTax(userId, year);
        const profile = await TaxProfile.getUserProfile(userId);
        
        if (!profile.tax_preferences.enable_quarterly_estimates) {
            return null;
        }
        
        const taxRules = await TaxRule.getRulesByType(
            profile.primary_jurisdiction.country,
            'income_tax',
            year
        );
        
        if (!taxRules || !taxRules.estimated_tax_requirements.quarterly.enabled) {
            return null;
        }
        
        const requirements = taxRules.estimated_tax_requirements.quarterly;
        
        // Check if user needs to pay estimated tax
        if (taxCalculation.total_income < requirements.minimum_income) {
            return {
                required: false,
                reason: 'Income below threshold for estimated tax payments'
            };
        }
        
        // Calculate quarterly payments
        const annualTaxLiability = taxCalculation.total_tax;
        const safeHarborAmount = annualTaxLiability * (requirements.safe_harbor_percentage / 100);
        const quarterlyPayment = safeHarborAmount / 4;
        
        // Generate due dates
        const dueDates = requirements.due_dates.map(dd => 
            new Date(year, dd.month - 1, dd.day)
        );
        
        return {
            required: true,
            annual_tax_liability: annualTaxLiability,
            safe_harbor_amount: safeHarborAmount,
            quarterly_payment: quarterlyPayment,
            due_dates: dueDates.map((date, index) => ({
                quarter: index + 1,
                due_date: date,
                amount: quarterlyPayment,
                paid: false
            }))
        };
    }
    
    // ==================== TAX DOCUMENT GENERATION ====================
    
    async generateTaxDocument(userId, documentType, taxYear = null) {
        const year = taxYear || new Date().getFullYear();
        const profile = await TaxProfile.getUserProfile(userId);
        
        if (!profile) {
            throw new Error('Tax profile not found');
        }
        
        // Check if document already exists
        let document = await TaxDocument.getDocumentsByType(userId, documentType, year);
        
        if (!document) {
            document = new TaxDocument({
                user: userId,
                tax_year: year,
                document_type: documentType,
                filing_status: profile.filing_status
            });
        }
        
        // Populate document data based on type
        switch (documentType) {
            case 'Tax_Summary':
                await this.populateTaxSummary(document, userId, year);
                break;
            case 'Schedule_D':
                await this.populateScheduleD(document, userId, year);
                break;
            case 'Schedule_C':
                await this.populateScheduleC(document, userId, year);
                break;
            case 'Estimated_Tax':
                await this.populateEstimatedTax(document, userId, year);
                break;
            default:
                throw new Error(`Document type ${documentType} not supported`);
        }
        
        document.status = 'generated';
        await document.save();
        
        return document;
    }
    
    async populateTaxSummary(document, userId, year) {
        const taxCalc = await this.calculateUserTax(userId, year);
        const profile = await TaxProfile.getUserProfile(userId);
        const capitalGains = await this.categorizeCapitalGains(userId, year);
        
        document.data = {
            wages: profile.annual_income.salary,
            business_income: profile.annual_income.business,
            interest_income: profile.annual_income.investment,
            capital_gains: {
                short_term: capitalGains.short_term.total,
                long_term: capitalGains.long_term.total
            },
            rental_income: profile.annual_income.rental,
            other_income: profile.annual_income.other,
            standard_deduction: taxCalc.deduction_type === 'standard' ? taxCalc.deduction_amount : 0,
            itemized_deductions: taxCalc.deduction_type === 'itemized' ? 
                profile.deductions.itemized_deductions : {},
            business_expenses: profile.deductions.business_expenses,
            retirement_contributions: profile.total_tax_advantaged_contributions,
            adjusted_gross_income: taxCalc.total_income,
            taxable_income: taxCalc.taxable_income,
            total_tax: taxCalc.total_tax
        };
        
        // Add optimization suggestions
        const opportunities = await this.identifyTaxLossHarvestingOpportunities(userId, year);
        for (const opp of opportunities) {
            await document.addOptimizationSuggestion(
                opp.type,
                opp.title,
                opp.description,
                opp.potential_savings,
                opp.deadline,
                opp.priority
            );
        }
    }
    
    async populateScheduleD(document, userId, year) {
        const capitalGains = await this.categorizeCapitalGains(userId, year);
        
        document.capital_transactions = [
            ...capitalGains.short_term.transactions.map(t => ({
                asset_name: t.description,
                sale_date: t.date,
                proceeds: t.amount,
                gain_loss: t.gain_loss,
                term: 'short'
            })),
            ...capitalGains.long_term.transactions.map(t => ({
                asset_name: t.description,
                sale_date: t.date,
                proceeds: t.amount,
                gain_loss: t.gain_loss,
                term: 'long'
            }))
        ];
        
        document.data.capital_gains = {
            short_term: capitalGains.short_term.total,
            long_term: capitalGains.long_term.total
        };
    }
    
    async populateScheduleC(document, userId, year) {
        const profile = await TaxProfile.getUserProfile(userId);
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year, 11, 31);
        
        // Get business expenses
        const businessExpenses = await Expense.find({
            user: userId,
            date: { $gte: startOfYear, $lte: endOfYear },
            category: { $in: ['Business', 'Home Office', 'Travel', 'Equipment', 'Professional Services'] }
        });
        
        document.transactions = businessExpenses.map(exp => ({
            expense_id: exp._id,
            date: exp.date,
            description: exp.description,
            category: exp.category,
            amount: exp.amount,
            tax_category: this.mapToTaxCategory(exp.category),
            deductible_amount: exp.amount,
            deductible_percentage: 100
        }));
        
        document.data.business_income = profile.annual_income.business;
        document.data.business_expenses = profile.deductions.business_expenses;
    }
    
    async populateEstimatedTax(document, userId, year) {
        const estimated = await this.calculateEstimatedTax(userId, year);
        
        if (estimated && estimated.required) {
            document.data.total_tax = estimated.annual_tax_liability;
            document.data.estimated_payments = estimated.safe_harbor_amount;
        }
    }
    
    // ==================== HELPER METHODS ====================
    
    parseGainLoss(notes) {
        if (!notes) return null;
        
        // Parse format like "Gain: 5000, Held: 400 days" or "Loss: -2000, Held: 180 days"
        const gainMatch = notes.match(/(?:Gain|Loss):\s*([-\d.]+)/i);
        const daysMatch = notes.match(/Held:\s*(\d+)\s*days/i);
        
        if (gainMatch) {
            return {
                amount: parseFloat(gainMatch[1]),
                holding_days: daysMatch ? parseInt(daysMatch[1]) : 0
            };
        }
        
        return null;
    }
    
    calculateContributionRoom(profile) {
        const room = {
            accounts: [],
            total: 0
        };
        
        for (const account of profile.tax_advantaged_accounts) {
            const remaining = account.contribution_limit - account.current_contribution;
            if (remaining > 0) {
                room.accounts.push({
                    type: account.account_type,
                    remaining: remaining
                });
                room.total += remaining;
            }
        }
        
        return room;
    }
    
    mapToTaxCategory(expenseCategory) {
        const mapping = {
            'Business': 'business_expense',
            'Home Office': 'home_office',
            'Travel': 'travel',
            'Equipment': 'equipment',
            'Professional Services': 'professional_services'
        };
        
        return mapping[expenseCategory] || 'other';
    }
}

module.exports = new TaxOptimizationService();
