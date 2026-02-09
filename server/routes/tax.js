const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { validateTaxProfile, validateTaxDocument, validateEstimatedPayment } = require('../middleware/taxValidator');

const taxOptimizationService = require('../services/taxOptimizationService');
const TaxProfile = require('../models/TaxProfile');
const TaxDocument = require('../models/TaxDocument');
const TaxRule = require('../models/TaxRule');

// ==================== TAX PROFILE ====================

// Create or update tax profile
router.post('/profile', auth, validateTaxProfile, async (req, res) => {
    try {
        let profile = await TaxProfile.getUserProfile(req.user.id);
        
        if (profile) {
            // Update existing profile
            Object.assign(profile, req.body);
            await profile.save();
        } else {
            // Create new profile
            profile = new TaxProfile({
                user: req.user.id,
                ...req.body
            });
            await profile.save();
        }
        
        res.json({ success: true, data: profile });
    } catch (error) {
        console.error('Error creating/updating tax profile:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Get user's tax profile
router.get('/profile', auth, async (req, res) => {
    try {
        const profile = await TaxProfile.getUserProfile(req.user.id);
        
        if (!profile) {
            return res.status(404).json({ 
                success: false, 
                message: 'Tax profile not found. Please create one first.' 
            });
        }
        
        res.json({ success: true, data: profile });
    } catch (error) {
        console.error('Error fetching tax profile:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== TAX CALCULATIONS ====================

// Calculate user's tax liability
router.get('/calculate/:year?', auth, async (req, res) => {
    try {
        const year = req.params.year ? parseInt(req.params.year) : new Date().getFullYear();
        const calculation = await taxOptimizationService.calculateUserTax(req.user.id, year);
        
        res.json({ success: true, data: calculation });
    } catch (error) {
        console.error('Error calculating tax:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Get tax bracket optimization suggestions
router.get('/optimize/bracket/:year?', auth, async (req, res) => {
    try {
        const year = req.params.year ? parseInt(req.params.year) : new Date().getFullYear();
        const optimization = await taxOptimizationService.optimizeTaxBracket(req.user.id, year);
        
        res.json({ success: true, data: optimization });
    } catch (error) {
        console.error('Error optimizing tax bracket:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// ==================== TAX LOSS HARVESTING ====================

// Get tax loss harvesting opportunities
router.get('/optimize/harvest/:year?', auth, async (req, res) => {
    try {
        const year = req.params.year ? parseInt(req.params.year) : new Date().getFullYear();
        const opportunities = await taxOptimizationService.identifyTaxLossHarvestingOpportunities(req.user.id, year);
        
        res.json({ 
            success: true, 
            data: opportunities,
            count: opportunities.length 
        });
    } catch (error) {
        console.error('Error identifying harvesting opportunities:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Detect wash sales
router.get('/wash-sales/:year?', auth, async (req, res) => {
    try {
        const year = req.params.year ? parseInt(req.params.year) : new Date().getFullYear();
        const washSales = await taxOptimizationService.detectWashSales(req.user.id, year);
        
        res.json({ 
            success: true, 
            data: washSales,
            count: washSales.length,
            has_violations: washSales.length > 0
        });
    } catch (error) {
        console.error('Error detecting wash sales:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== CAPITAL GAINS ====================

// Categorize capital gains (short-term vs long-term)
router.get('/capital-gains/:year?', auth, async (req, res) => {
    try {
        const year = req.params.year ? parseInt(req.params.year) : new Date().getFullYear();
        const categorized = await taxOptimizationService.categorizeCapitalGains(req.user.id, year);
        
        res.json({ success: true, data: categorized });
    } catch (error) {
        console.error('Error categorizing capital gains:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// ==================== ESTIMATED TAX ====================

// Calculate estimated quarterly tax payments
router.get('/estimated/:year?', auth, async (req, res) => {
    try {
        const year = req.params.year ? parseInt(req.params.year) : new Date().getFullYear();
        const estimated = await taxOptimizationService.calculateEstimatedTax(req.user.id, year);
        
        res.json({ success: true, data: estimated });
    } catch (error) {
        console.error('Error calculating estimated tax:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Record estimated tax payment
router.post('/estimated/payment', auth, validateEstimatedPayment, async (req, res) => {
    try {
        const { quarter, confirmation_number } = req.body;
        const profile = await TaxProfile.getUserProfile(req.user.id);
        
        if (!profile) {
            return res.status(404).json({ success: false, message: 'Tax profile not found' });
        }
        
        await profile.markPaymentPaid(quarter, confirmation_number);
        
        res.json({ 
            success: true, 
            message: `Q${quarter} estimated tax payment recorded`,
            data: profile.estimated_tax_payments 
        });
    } catch (error) {
        console.error('Error recording payment:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// ==================== TAX DOCUMENTS ====================

// Generate tax document
router.post('/documents/generate', auth, validateTaxDocument, async (req, res) => {
    try {
        const { document_type, tax_year } = req.body;
        const document = await taxOptimizationService.generateTaxDocument(
            req.user.id,
            document_type,
            tax_year
        );
        
        res.status(201).json({ success: true, data: document });
    } catch (error) {
        console.error('Error generating tax document:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Get user's tax documents
router.get('/documents/:year?', auth, async (req, res) => {
    try {
        const year = req.params.year ? parseInt(req.params.year) : null;
        const documents = await TaxDocument.getUserDocuments(req.user.id, year);
        
        res.json({ success: true, data: documents, count: documents.length });
    } catch (error) {
        console.error('Error fetching tax documents:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single tax document
router.get('/documents/:documentId/view', auth, async (req, res) => {
    try {
        const document = await TaxDocument.findOne({
            _id: req.params.documentId,
            user: req.user.id
        });
        
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        res.json({ success: true, data: document });
    } catch (error) {
        console.error('Error fetching document:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark document as filed
router.put('/documents/:documentId/file', auth, async (req, res) => {
    try {
        const { confirmation_number, payment_amount, payment_method } = req.body;
        
        const document = await TaxDocument.findOne({
            _id: req.params.documentId,
            user: req.user.id
        });
        
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        await document.markFiled(confirmation_number, payment_amount, payment_method);
        
        res.json({ 
            success: true, 
            message: 'Document marked as filed',
            data: document 
        });
    } catch (error) {
        console.error('Error marking document as filed:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Implement optimization suggestion
router.put('/documents/:documentId/suggestions/:suggestionId/implement', auth, async (req, res) => {
    try {
        const document = await TaxDocument.findOne({
            _id: req.params.documentId,
            user: req.user.id
        });
        
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        await document.markSuggestionImplemented(req.params.suggestionId);
        
        res.json({ 
            success: true, 
            message: 'Suggestion marked as implemented',
            data: document 
        });
    } catch (error) {
        console.error('Error implementing suggestion:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// ==================== TAX RULES ====================

// Get tax rules for jurisdiction
router.get('/rules/:country/:year?', auth, async (req, res) => {
    try {
        const { country } = req.params;
        const year = req.params.year ? parseInt(req.params.year) : new Date().getFullYear();
        
        const rules = await TaxRule.getCurrentRules(country.toUpperCase(), null);
        
        res.json({ success: true, data: rules, count: rules.length });
    } catch (error) {
        console.error('Error fetching tax rules:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get contribution limits
router.get('/rules/:country/contribution-limits', auth, async (req, res) => {
    try {
        const { country } = req.params;
        const year = new Date().getFullYear();
        
        const rule = await TaxRule.getRulesByType(country.toUpperCase(), 'contribution_limit', year);
        
        if (!rule) {
            return res.status(404).json({ 
                success: false, 
                message: 'Contribution limits not found for this jurisdiction' 
            });
        }
        
        res.json({ success: true, data: rule.contribution_limits });
    } catch (error) {
        console.error('Error fetching contribution limits:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== YEAR-END PLANNING ====================

// Get year-end tax checklist
router.get('/year-end/:year?', auth, async (req, res) => {
    try {
        const year = req.params.year ? parseInt(req.params.year) : new Date().getFullYear();
        const profile = await TaxProfile.getUserProfile(req.user.id);
        
        if (!profile) {
            return res.status(404).json({ success: false, message: 'Tax profile not found' });
        }
        
        // Get all optimization opportunities
        const [bracket, harvest, capitalGains] = await Promise.all([
            taxOptimizationService.optimizeTaxBracket(req.user.id, year),
            taxOptimizationService.identifyTaxLossHarvestingOpportunities(req.user.id, year),
            taxOptimizationService.categorizeCapitalGains(req.user.id, year)
        ]);
        
        const checklist = {
            retirement_contributions: {
                total_contributed: profile.total_tax_advantaged_contributions,
                contribution_room: taxOptimizationService.calculateContributionRoom(profile),
                deadline: new Date(year, 11, 31)
            },
            tax_loss_harvesting: {
                opportunities: harvest,
                deadline: new Date(year, 11, 31)
            },
            bracket_optimization: {
                suggestions: bracket.optimization_suggestions,
                current_bracket: bracket.current_situation.tax_bracket
            },
            capital_gains_review: {
                short_term_total: capitalGains.short_term.total,
                long_term_total: capitalGains.long_term.total,
                total_tax: capitalGains.total_tax
            },
            business_expenses: {
                total: Object.values(profile.deductions.business_expenses).reduce((sum, val) => sum + val, 0),
                deadline: new Date(year, 11, 31)
            },
            charitable_giving: {
                contributed: profile.deductions.itemized_deductions.charitable,
                deadline: new Date(year, 11, 31)
            }
        };
        
        res.json({ success: true, data: checklist });
    } catch (error) {
        console.error('Error generating year-end checklist:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
