const CategoryRule = require('../models/CategoryRule');
const Expense = require('../models/Expense');

class MerchantLearningService {
    /**
     * Record a user's manual categorization of a merchant.
     * If they change the category, we might want to create or update a rule.
     */
    static async learnFromCorrection(userId, merchantName, correctedCategory) {
        if (!merchantName || !correctedCategory) return;

        // Find if a rule already exists for this exact merchant
        let rule = await CategoryRule.findOne({
            user: userId,
            pattern: merchantName,
            isRegex: false,
            fieldToMatch: 'merchant'
        });

        if (rule) {
            if (rule.suggestedCategory !== correctedCategory) {
                // User changed it, update rule
                rule.suggestedCategory = correctedCategory;
                rule.confidenceScore = Math.min(1.0, rule.confidenceScore + 0.1);
                await rule.save();
            }
        } else {
            // Check if there are many transactions with this merchant and this new category
            const recentExpenses = await Expense.countDocuments({
                user: userId,
                merchant: { $regex: new RegExp(`^${merchantName}$`, 'i') },
                category: correctedCategory
            });

            if (recentExpenses >= 2) {
                // Create a new "learned" rule
                rule = new CategoryRule({
                    user: userId,
                    pattern: merchantName,
                    isRegex: false,
                    fieldToMatch: 'merchant',
                    suggestedCategory: correctedCategory,
                    confidenceScore: 0.8,
                    priority: 5, // Medium priority for learned rules
                    description: `Automatically learned from user corrections for "${merchantName}"`
                });
                await rule.save();
            }
        }

        return rule;
    }

    /**
     * Suggest rules based on common merchant patterns.
     */
    static async identifyPotentialRules(userId) {
        // Aggregate transactions by merchant and category
        const aggregation = await Expense.aggregate([
            { $match: { user: userId } },
            {
                $group: {
                    _id: { merchant: '$merchant', category: '$category' },
                    count: { $sum: 1 }
                }
            },
            { $match: { count: { $gte: 3 } } },
            { $sort: { count: -1 } }
        ]);

        const suggestions = [];
        for (const item of aggregation) {
            const { merchant, category } = item._id;

            // Check if rule exists
            const existing = await CategoryRule.findOne({
                user: userId,
                pattern: merchant,
                isRegex: false
            });

            if (!existing) {
                suggestions.push({
                    merchant,
                    category,
                    count: item.count,
                    confidence: 0.7 + (Math.min(item.count, 10) / 100)
                });
            }
        }

        return suggestions;
    }
}

module.exports = MerchantLearningService;
