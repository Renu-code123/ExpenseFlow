const Pattern = require('../models/Pattern');
const CategoryPattern = require('../models/CategoryPattern');
const Expense = require('../models/Expense');

// Confidence threshold for auto-categorization
const AUTO_APPLY_THRESHOLD = 0.85;
const SUGGESTION_THRESHOLD = 0.4;

// Category keywords with weights for NLP matching
const CATEGORY_KEYWORDS = {
    food: {
        keywords: [
            { term: 'restaurant', weight: 1.0 },
            { term: 'food', weight: 0.9 },
            { term: 'cafe', weight: 0.9 },
            { term: 'coffee', weight: 0.85 },
            { term: 'pizza', weight: 0.95 },
            { term: 'burger', weight: 0.9 },
            { term: 'dining', weight: 0.9 },
            { term: 'lunch', weight: 0.8 },
            { term: 'dinner', weight: 0.8 },
            { term: 'breakfast', weight: 0.8 },
            { term: 'snack', weight: 0.75 },
            { term: 'dessert', weight: 0.8 },
            { term: 'bakery', weight: 0.85 },
            { term: 'grocery', weight: 0.9 },
            { term: 'supermarket', weight: 0.85 },
            { term: 'meal', weight: 0.85 },
            { term: 'eat', weight: 0.7 },
            { term: 'kitchen', weight: 0.6 },
            { term: 'cook', weight: 0.6 },
            { term: 'delivery', weight: 0.5 }
        ],
        merchants: ['starbucks', 'mcdonalds', 'kfc', 'subway', 'dominos', 'pizzahut', 'burgerking', 'wendys', 'dunkin', 'chipotle', 'swiggy', 'zomato', 'doordash', 'ubereats', 'grubhub']
    },
    transport: {
        keywords: [
            { term: 'uber', weight: 1.0 },
            { term: 'taxi', weight: 0.95 },
            { term: 'cab', weight: 0.95 },
            { term: 'ride', weight: 0.7 },
            { term: 'petrol', weight: 0.95 },
            { term: 'gas', weight: 0.85 },
            { term: 'fuel', weight: 0.95 },
            { term: 'diesel', weight: 0.95 },
            { term: 'parking', weight: 0.9 },
            { term: 'toll', weight: 0.95 },
            { term: 'metro', weight: 0.9 },
            { term: 'bus', weight: 0.85 },
            { term: 'train', weight: 0.85 },
            { term: 'railway', weight: 0.85 },
            { term: 'flight', weight: 0.8 },
            { term: 'airline', weight: 0.85 },
            { term: 'airport', weight: 0.75 },
            { term: 'car', weight: 0.6 },
            { term: 'vehicle', weight: 0.7 },
            { term: 'transport', weight: 0.9 },
            { term: 'commute', weight: 0.85 }
        ],
        merchants: ['uber', 'lyft', 'ola', 'grab', 'didi', 'shell', 'chevron', 'exxon', 'bp', 'mobil', 'texaco', 'hpcl', 'iocl', 'bpcl']
    },
    shopping: {
        keywords: [
            { term: 'amazon', weight: 0.8 },
            { term: 'shopping', weight: 0.9 },
            { term: 'store', weight: 0.7 },
            { term: 'mall', weight: 0.85 },
            { term: 'purchase', weight: 0.6 },
            { term: 'buy', weight: 0.5 },
            { term: 'clothes', weight: 0.9 },
            { term: 'clothing', weight: 0.9 },
            { term: 'fashion', weight: 0.85 },
            { term: 'shoes', weight: 0.9 },
            { term: 'electronics', weight: 0.85 },
            { term: 'gadget', weight: 0.8 },
            { term: 'appliance', weight: 0.8 },
            { term: 'furniture', weight: 0.85 },
            { term: 'home', weight: 0.5 },
            { term: 'decor', weight: 0.75 },
            { term: 'gift', weight: 0.7 },
            { term: 'retail', weight: 0.8 }
        ],
        merchants: ['amazon', 'walmart', 'target', 'costco', 'bestbuy', 'ikea', 'flipkart', 'myntra', 'ajio', 'ebay', 'etsy']
    },
    entertainment: {
        keywords: [
            { term: 'movie', weight: 0.95 },
            { term: 'cinema', weight: 0.95 },
            { term: 'theater', weight: 0.9 },
            { term: 'theatre', weight: 0.9 },
            { term: 'netflix', weight: 0.95 },
            { term: 'spotify', weight: 0.9 },
            { term: 'game', weight: 0.85 },
            { term: 'gaming', weight: 0.9 },
            { term: 'concert', weight: 0.9 },
            { term: 'ticket', weight: 0.6 },
            { term: 'show', weight: 0.6 },
            { term: 'event', weight: 0.6 },
            { term: 'subscription', weight: 0.65 },
            { term: 'streaming', weight: 0.85 },
            { term: 'gym', weight: 0.85 },
            { term: 'fitness', weight: 0.8 },
            { term: 'sport', weight: 0.8 },
            { term: 'club', weight: 0.6 },
            { term: 'music', weight: 0.75 },
            { term: 'party', weight: 0.7 },
            { term: 'fun', weight: 0.5 }
        ],
        merchants: ['netflix', 'spotify', 'hulu', 'disney', 'hbo', 'amazon prime', 'apple music', 'youtube', 'playstation', 'xbox', 'steam', 'bookmyshow']
    },
    utilities: {
        keywords: [
            { term: 'electricity', weight: 0.95 },
            { term: 'electric', weight: 0.9 },
            { term: 'power', weight: 0.75 },
            { term: 'water', weight: 0.9 },
            { term: 'gas', weight: 0.7 },
            { term: 'internet', weight: 0.9 },
            { term: 'wifi', weight: 0.9 },
            { term: 'broadband', weight: 0.9 },
            { term: 'phone', weight: 0.75 },
            { term: 'mobile', weight: 0.7 },
            { term: 'cellular', weight: 0.8 },
            { term: 'bill', weight: 0.65 },
            { term: 'rent', weight: 0.9 },
            { term: 'housing', weight: 0.8 },
            { term: 'insurance', weight: 0.85 },
            { term: 'utility', weight: 0.95 },
            { term: 'maintenance', weight: 0.7 },
            { term: 'service', weight: 0.4 },
            { term: 'monthly', weight: 0.4 }
        ],
        merchants: ['att', 'verizon', 'tmobile', 'comcast', 'spectrum', 'jio', 'airtel', 'vodafone', 'bsnl']
    },
    healthcare: {
        keywords: [
            { term: 'hospital', weight: 0.95 },
            { term: 'medical', weight: 0.95 },
            { term: 'doctor', weight: 0.95 },
            { term: 'clinic', weight: 0.95 },
            { term: 'pharmacy', weight: 0.95 },
            { term: 'medicine', weight: 0.95 },
            { term: 'drug', weight: 0.8 },
            { term: 'prescription', weight: 0.9 },
            { term: 'health', weight: 0.7 },
            { term: 'dentist', weight: 0.95 },
            { term: 'dental', weight: 0.95 },
            { term: 'lab', weight: 0.7 },
            { term: 'diagnostic', weight: 0.9 },
            { term: 'therapy', weight: 0.9 },
            { term: 'treatment', weight: 0.85 },
            { term: 'surgery', weight: 0.95 },
            { term: 'vaccine', weight: 0.9 },
            { term: 'checkup', weight: 0.9 },
            { term: 'test', weight: 0.5 },
            { term: 'xray', weight: 0.95 },
            { term: 'scan', weight: 0.75 }
        ],
        merchants: ['cvs', 'walgreens', 'apollopharmacy', 'netmeds', 'medlife', 'practo', 'apollo', 'fortis', 'max']
    }
};

/**
 * CategoryService - Intelligent Transaction Auto-Categorization Engine
 * Uses NLP heuristics, fuzzy matching, and user-specific learning
 */
class CategoryService {
    constructor() {
        this.initialized = false;
    }
    
    /**
     * Initialize the service - seed default patterns if needed
     */
    async initialize() {
        if (!this.initialized) {
            try {
                const patternCount = await Pattern.countDocuments();
                if (patternCount === 0) {
                    await Pattern.seedDefaultPatterns();
                }
                this.initialized = true;
            } catch (error) {
                console.error('CategoryService initialization error:', error);
            }
        }
    }
    
    /**
     * Calculate Levenshtein distance for fuzzy matching
     */
    levenshteinDistance(str1, str2) {
        const m = str1.length;
        const n = str2.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = 1 + Math.min(
                        dp[i - 1][j],     // deletion
                        dp[i][j - 1],     // insertion
                        dp[i - 1][j - 1]  // substitution
                    );
                }
            }
        }
        
        return dp[m][n];
    }
    
    /**
     * Calculate fuzzy match score (0-1)
     */
    fuzzyMatchScore(str1, str2) {
        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();
        
        // Exact match
        if (s1 === s2) return 1.0;
        
        // Contains match
        if (s1.includes(s2) || s2.includes(s1)) {
            const longer = s1.length > s2.length ? s1 : s2;
            const shorter = s1.length > s2.length ? s2 : s1;
            return 0.8 + (0.2 * (shorter.length / longer.length));
        }
        
        // Levenshtein-based similarity
        const distance = this.levenshteinDistance(s1, s2);
        const maxLength = Math.max(s1.length, s2.length);
        const similarity = 1 - (distance / maxLength);
        
        return Math.max(0, similarity);
    }
    
    /**
     * Tokenize and normalize description
     */
    tokenize(description) {
        return description
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 1)
            .map(word => word.trim());
    }
    
    /**
     * Extract potential merchant name from description
     */
    extractMerchantName(description) {
        const tokens = this.tokenize(description);
        
        // Common transaction prefixes to remove
        const prefixes = ['payment', 'purchase', 'pos', 'debit', 'credit', 'transfer', 'upi', 'neft', 'imps', 'to', 'from', 'at'];
        
        // Filter out common words
        const filtered = tokens.filter(t => !prefixes.includes(t) && t.length > 2);
        
        // First significant word is often the merchant
        return filtered.length > 0 ? filtered[0] : null;
    }
    
    /**
     * Calculate keyword-based category scores
     */
    calculateKeywordScores(description) {
        const tokens = this.tokenize(description);
        const scores = {};
        
        for (const [category, data] of Object.entries(CATEGORY_KEYWORDS)) {
            let totalScore = 0;
            let matchCount = 0;
            const matchedTerms = [];
            
            // Check keywords
            for (const { term, weight } of data.keywords) {
                for (const token of tokens) {
                    const fuzzyScore = this.fuzzyMatchScore(token, term);
                    
                    if (fuzzyScore > 0.7) {
                        const adjustedScore = fuzzyScore * weight;
                        totalScore += adjustedScore;
                        matchCount++;
                        matchedTerms.push({ term, token, score: adjustedScore });
                    }
                }
            }
            
            // Check merchants (higher weight for exact merchant matches)
            for (const merchant of data.merchants) {
                const descLower = description.toLowerCase();
                
                if (descLower.includes(merchant)) {
                    totalScore += 1.2; // Merchant matches are highly confident
                    matchCount++;
                    matchedTerms.push({ term: merchant, score: 1.2, isMerchant: true });
                } else {
                    // Fuzzy merchant matching
                    for (const token of tokens) {
                        const fuzzyScore = this.fuzzyMatchScore(token, merchant);
                        if (fuzzyScore > 0.8) {
                            totalScore += fuzzyScore * 1.1;
                            matchCount++;
                            matchedTerms.push({ term: merchant, token, score: fuzzyScore * 1.1, isMerchant: true });
                        }
                    }
                }
            }
            
            // Normalize score
            const normalizedScore = matchCount > 0 
                ? Math.min(1.0, totalScore / (matchCount * 0.8))
                : 0;
            
            if (normalizedScore > 0) {
                scores[category] = {
                    score: normalizedScore,
                    matchCount,
                    matchedTerms
                };
            }
        }
        
        return scores;
    }
    
    /**
     * Get user-specific pattern matches
     */
    async getUserPatternMatches(userId, description) {
        const userPatterns = await CategoryPattern.findPatternsForDescription(userId, description);
        const matches = {};
        
        for (const pattern of userPatterns) {
            const category = pattern.category;
            
            if (!matches[category]) {
                matches[category] = {
                    score: 0,
                    patterns: []
                };
            }
            
            // Weight by confidence and accuracy
            const patternScore = pattern.confidence * pattern.accuracy;
            matches[category].score = Math.max(matches[category].score, patternScore);
            matches[category].patterns.push({
                pattern: pattern.pattern,
                confidence: pattern.confidence,
                usageCount: pattern.usageCount
            });
        }
        
        return matches;
    }
    
    /**
     * Get global pattern matches
     */
    async getGlobalPatternMatches(description) {
        const globalPatterns = await Pattern.findMatchingPatterns(description);
        const matches = {};
        
        for (const pattern of globalPatterns) {
            const category = pattern.category;
            
            if (!matches[category]) {
                matches[category] = {
                    score: 0,
                    patterns: []
                };
            }
            
            const patternScore = pattern.baseConfidence * pattern.globalAccuracy;
            matches[category].score = Math.max(matches[category].score, patternScore);
            matches[category].patterns.push({
                pattern: pattern.pattern,
                confidence: pattern.baseConfidence,
                type: pattern.patternType
            });
        }
        
        return matches;
    }
    
    /**
     * Suggest category for a description with confidence scoring
     */
    async suggestCategory(userId, description) {
        await this.initialize();
        
        if (!description || description.trim().length < 2) {
            return {
                suggestions: [],
                primarySuggestion: null,
                shouldAutoApply: false
            };
        }
        
        // Get scores from different sources
        const keywordScores = this.calculateKeywordScores(description);
        const userPatterns = await this.getUserPatternMatches(userId, description);
        const globalPatterns = await this.getGlobalPatternMatches(description);
        
        // Combine scores with weights
        const combinedScores = {};
        const allCategories = new Set([
            ...Object.keys(keywordScores),
            ...Object.keys(userPatterns),
            ...Object.keys(globalPatterns)
        ]);
        
        for (const category of allCategories) {
            const keywordScore = keywordScores[category]?.score || 0;
            const userScore = userPatterns[category]?.score || 0;
            const globalScore = globalPatterns[category]?.score || 0;
            
            // User patterns have highest weight (they learn from corrections)
            // Global patterns next, then keyword heuristics
            const weightedScore = (
                (userScore * 0.5) +
                (globalScore * 0.3) +
                (keywordScore * 0.2)
            );
            
            // If user has strong pattern match, boost significantly
            if (userScore > 0.8) {
                combinedScores[category] = Math.min(1.0, weightedScore * 1.3);
            } else {
                combinedScores[category] = weightedScore;
            }
        }
        
        // Sort by score
        const sortedCategories = Object.entries(combinedScores)
            .sort(([, a], [, b]) => b - a)
            .filter(([, score]) => score >= SUGGESTION_THRESHOLD);
        
        // Build suggestions array
        const suggestions = sortedCategories.slice(0, 3).map(([category, score]) => {
            const reasons = [];
            
            if (userPatterns[category]?.patterns?.length > 0) {
                reasons.push(`Matches your pattern: "${userPatterns[category].patterns[0].pattern}"`);
            }
            if (globalPatterns[category]?.patterns?.length > 0) {
                reasons.push(`Known ${globalPatterns[category].patterns[0].type}: "${globalPatterns[category].patterns[0].pattern}"`);
            }
            if (keywordScores[category]?.matchedTerms?.length > 0) {
                const term = keywordScores[category].matchedTerms[0];
                reasons.push(`Contains keyword: "${term.term}"`);
            }
            
            return {
                category,
                confidence: parseFloat(score.toFixed(3)),
                reason: reasons[0] || 'Pattern match',
                details: reasons
            };
        });
        
        const primarySuggestion = suggestions.length > 0 ? suggestions[0] : null;
        const shouldAutoApply = primarySuggestion && primarySuggestion.confidence >= AUTO_APPLY_THRESHOLD;
        
        return {
            suggestions,
            primarySuggestion,
            shouldAutoApply,
            autoApplyThreshold: AUTO_APPLY_THRESHOLD
        };
    }
    
    /**
     * Learn from user correction
     */
    async trainFromCorrection(userId, description, suggestedCategory, actualCategory) {
        await this.initialize();
        
        // Learn the new pattern from the description
        await CategoryPattern.learnFromExpense(userId, description, actualCategory);
        
        // If there was a suggested category that was wrong, decrease its patterns' confidence
        if (suggestedCategory && suggestedCategory !== actualCategory) {
            const words = this.tokenize(description);
            
            for (const word of words) {
                const wrongPattern = await CategoryPattern.findOne({
                    user: userId,
                    pattern: word,
                    category: suggestedCategory
                });
                
                if (wrongPattern) {
                    await wrongPattern.updateUsage(false);
                }
            }
        }
        
        return {
            success: true,
            message: 'Pattern learned successfully',
            learnedCategory: actualCategory
        };
    }
    
    /**
     * Bulk categorize multiple expenses
     */
    async bulkCategorize(userId, expenseDescriptions) {
        await this.initialize();
        
        const results = [];
        
        for (const expense of expenseDescriptions) {
            const suggestion = await this.suggestCategory(userId, expense.description);
            
            results.push({
                id: expense.id,
                description: expense.description,
                ...suggestion
            });
        }
        
        return results;
    }
    
    /**
     * Auto-categorize all uncategorized expenses for a user
     */
    async autoCategorizeUncategorized(userId, workspaceId = null) {
        await this.initialize();
        
        // Build query for uncategorized or 'other' category expenses
        const query = workspaceId
            ? { workspace: workspaceId, category: 'other' }
            : { user: userId, workspace: null, category: 'other' };
        
        const expenses = await Expense.find(query);
        
        const results = {
            total: expenses.length,
            categorized: 0,
            suggested: 0,
            unchanged: 0,
            details: []
        };
        
        for (const expense of expenses) {
            const suggestion = await this.suggestCategory(userId, expense.description);
            
            const detail = {
                id: expense._id,
                description: expense.description,
                originalCategory: expense.category,
                suggestion: suggestion.primarySuggestion
            };
            
            if (suggestion.shouldAutoApply && suggestion.primarySuggestion) {
                // Auto-apply high confidence suggestions
                expense.category = suggestion.primarySuggestion.category;
                await expense.save();
                
                // Learn from this categorization
                await CategoryPattern.learnFromExpense(
                    userId,
                    expense.description,
                    suggestion.primarySuggestion.category
                );
                
                detail.action = 'auto_categorized';
                detail.newCategory = suggestion.primarySuggestion.category;
                detail.confidence = suggestion.primarySuggestion.confidence;
                results.categorized++;
            } else if (suggestion.primarySuggestion) {
                // Mark as suggested (confidence < 85%)
                detail.action = 'suggested';
                detail.suggestedCategory = suggestion.primarySuggestion.category;
                detail.confidence = suggestion.primarySuggestion.confidence;
                results.suggested++;
            } else {
                detail.action = 'unchanged';
                results.unchanged++;
            }
            
            results.details.push(detail);
        }
        
        return results;
    }
    
    /**
     * Get categorization statistics for a user
     */
    async getUserStats(userId) {
        const totalPatterns = await CategoryPattern.countDocuments({ 
            user: userId, 
            isActive: true 
        });
        
        const patternsByCategory = await CategoryPattern.aggregate([
            { $match: { user: userId, isActive: true } },
            { $group: { _id: '$category', count: { $sum: 1 }, avgConfidence: { $avg: '$confidence' } } }
        ]);
        
        const topPatterns = await CategoryPattern.find({ user: userId, isActive: true })
            .sort({ usageCount: -1 })
            .limit(10)
            .select('pattern category confidence usageCount');
        
        return {
            totalPatterns,
            patternsByCategory: patternsByCategory.reduce((acc, p) => {
                acc[p._id] = { count: p.count, avgConfidence: p.avgConfidence };
                return acc;
            }, {}),
            topPatterns,
            autoApplyThreshold: AUTO_APPLY_THRESHOLD
        };
    }
    
    /**
     * Apply a suggestion to an expense
     */
    async applySuggestion(userId, expenseId, category, isCorrection = false, originalSuggestion = null) {
        const expense = await Expense.findOne({
            _id: expenseId,
            $or: [
                { user: userId },
                { addedBy: userId }
            ]
        });
        
        if (!expense) {
            throw new Error('Expense not found');
        }
        
        const previousCategory = expense.category;
        expense.category = category;
        await expense.save();
        
        // Learn from this decision
        if (isCorrection && originalSuggestion && originalSuggestion !== category) {
            await this.trainFromCorrection(userId, expense.description, originalSuggestion, category);
        } else {
            await CategoryPattern.learnFromExpense(userId, expense.description, category);
        }
        
        return {
            success: true,
            expense: {
                id: expense._id,
                previousCategory,
                newCategory: category
            }
        };
    }
}

module.exports = new CategoryService();
