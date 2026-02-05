/**
 * Categorization Service
 * Wrapper that delegates to the advanced CategoryService for NLP-based categorization
 */
const categoryService = require('./categoryService');
const CategoryPattern = require('../models/CategoryPattern');

class CategorizationService {
    /**
     * Simple categorize (returns just category string)
     */
    categorize(description) {
        const categories = {
            'food': ['restaurant', 'grocery', 'cafe', 'food', 'pizza', 'burger', 'coffee', 'lunch', 'dinner'],
            'transport': ['uber', 'taxi', 'bus', 'metro', 'petrol', 'gas', 'fuel', 'parking', 'toll'],
            'shopping': ['amazon', 'store', 'mall', 'flipkart', 'shopping', 'clothes', 'shoes'],
            'entertainment': ['movie', 'netflix', 'spotify', 'game', 'cinema', 'gym', 'concert'],
            'utilities': ['electricity', 'water', 'internet', 'phone', 'rent', 'bill', 'insurance'],
            'healthcare': ['hospital', 'doctor', 'pharmacy', 'medicine', 'clinic', 'dental']
        };

        const desc = description.toLowerCase();
        for (const [category, keywords] of Object.entries(categories)) {
            if (keywords.some(keyword => desc.includes(keyword))) {
                return category;
            }
        }
        return 'other';
    }

    /**
     * Get category suggestions with confidence scores
     */
    async suggestCategory(userId, description) {
        return await categoryService.suggestCategory(userId, description);
    }

    /**
     * Train the system with user correction
     */
    async trainFromCorrection(userId, description, suggestedCategory, actualCategory) {
        return await categoryService.trainFromCorrection(userId, description, suggestedCategory, actualCategory);
    }

    /**
     * Bulk categorize multiple expenses
     */
    async bulkCategorize(userId, expenses) {
        return await categoryService.bulkCategorize(userId, expenses);
    }

    /**
     * Auto-categorize all uncategorized expenses
     */
    async autoCategorizeUncategorized(userId, workspaceId = null) {
        return await categoryService.autoCategorizeUncategorized(userId, workspaceId);
    }

    /**
     * Apply a suggestion to an expense
     */
    async applySuggestion(userId, expenseId, category, isCorrection = false, originalSuggestion = null) {
        return await categoryService.applySuggestion(userId, expenseId, category, isCorrection, originalSuggestion);
    }

    /**
     * Get user categorization statistics
     */
    async getUserStats(userId) {
        return await categoryService.getUserStats(userId);
    }
}

module.exports = new CategorizationService();