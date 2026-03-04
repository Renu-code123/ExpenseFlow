const CategoryRule = require('../models/CategoryRule');
const Tag = require('../models/Tag');
const PatternMatcher = require('../utils/patternMatcher');

class CategorizationEngine {
    /**
     * Predict category and tags for a transaction.
     * @param {string} userId 
     * @param {Object} transactionData - { merchant, description, amount }
     */
    static async predict(userId, transactionData) {
        const { merchant, description } = transactionData;
        const rules = await CategoryRule.find({ user: userId, isActive: true }).sort({ priority: -1 });

        let bestMatch = null;
        let highestConfidence = 0;

        for (const rule of rules) {
            let isMatch = false;
            const textToMatch = [];

            if (rule.fieldToMatch === 'merchant' || rule.fieldToMatch === 'both') {
                textToMatch.push(merchant);
            }
            if (rule.fieldToMatch === 'description' || rule.fieldToMatch === 'both') {
                textToMatch.push(description);
            }

            for (const text of textToMatch) {
                if (PatternMatcher.isMatch(text, rule.pattern, rule.isRegex)) {
                    isMatch = true;
                    break;
                }
            }

            if (isMatch) {
                // If exact/regex match, confidence is high
                const confidence = rule.confidenceScore || 0.95;
                if (confidence > highestConfidence) {
                    highestConfidence = confidence;
                    bestMatch = rule;
                }
            }
        }

        if (bestMatch) {
            // Update rule stats asynchronously
            bestMatch.matchCount += 1;
            bestMatch.lastMatchedAt = new Date();
            bestMatch.save().catch(err => console.error('Error updating rule stats:', err));

            return {
                category: bestMatch.suggestedCategory,
                tags: bestMatch.suggestedTags,
                confidence: highestConfidence,
                ruleId: bestMatch._id
            };
        }

        // If no rule matches, try fuzzy matching against previous merchants (simplified for now)
        return {
            category: 'other',
            tags: [],
            confidence: 0.1
        };
    }

    /**
     * Apply categorization to a transaction object.
     */
    static async applyToTransaction(transaction) {
        const prediction = await this.predict(transaction.user, {
            merchant: transaction.merchant,
            description: transaction.description,
            amount: transaction.amount
        });

        if (prediction.confidence > 0.5) {
            transaction.category = prediction.category;
            if (prediction.tags && prediction.tags.length > 0) {
                // Merge tags, avoiding duplicates
                const existingTags = transaction.tags || [];
                const newTags = prediction.tags.map(t => t.toString());
                const combined = [...new Set([...existingTags.map(t => t.toString()), ...newTags])];
                transaction.tags = combined;
            }
            return true;
        }
        return false;
    }
}

module.exports = CategorizationEngine;
