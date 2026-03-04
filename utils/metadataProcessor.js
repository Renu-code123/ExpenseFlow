/**
 * Metadata Processor Utility
 * Issue #720: Intelligence layer to extract semantic meaning from raw transaction strings.
 */

class MetadataProcessor {
    constructor() {
        // Simple classifier sets for 1k line logic expansion
        this.businessTypeKeywords = {
            retail: ['walmart', 'amazon', 'target', 'costco', 'supermarket', 'mall'],
            food_beverages: ['starbucks', 'mcdonalds', 'restaurant', 'cafe', 'bar', 'grill', 'pizza'],
            transport: ['uber', 'lyft', 'gas', 'shell', 'parking', 'metro', 'train', 'flight'],
            subscription: ['netflix', 'spotify', 'aws', 'adobe', 'sass', 'cloud', 'digitalocean'],
            healthcare: ['pharmacy', 'hospital', 'doctor', 'clinic', 'dentist', 'drugstore']
        };

        this.sentimentMap = {
            positive: ['bonus', 'refund', 'gift', 'award', 'cashback'],
            negative: ['fine', 'penalty', 'late', 'interest', 'overdraft', 'theft'],
            neutral: [] // Default
        };
    }

    /**
     * Extracts tags and business types from description and notes
     */
    extractTags(text = '') {
        const words = text.toLowerCase().split(/\s+/);
        const tags = new Set();

        // 1. Keyword based tagging
        if (words.includes('tax')) tags.add('fiscal');
        if (words.includes('work') || words.includes('office')) tags.add('business');
        if (words.includes('trip') || words.includes('travel')) tags.add('vacation');
        if (words.includes('dinner') || words.includes('lunch')) tags.add('dining');

        // 2. Amount based tagging logic (would be passed in)
        return Array.from(tags);
    }

    /**
     * Determines the business category using keyword matching
     */
    inferBusinessType(merchant = '') {
        const m = merchant.toLowerCase();

        for (const [type, keywords] of Object.entries(this.businessTypeKeywords)) {
            if (keywords.some(k => m.includes(k))) {
                return type;
            }
        }

        return 'other';
    }

    /**
     * Simple sentiment analysis based on transaction description
     */
    analyzeSentiment(description = '') {
        const d = description.toLowerCase();

        if (this.sentimentMap.positive.some(k => d.includes(k))) return 'positive';
        if (this.sentimentMap.negative.some(k => d.includes(k))) return 'negative';

        return 'neutral';
    }

    /**
     * Comprehensive enrichment
     */
    process(transaction) {
        const merchant = transaction.merchant || '';
        const description = transaction.description || '';

        return {
            tags: this.extractTags(description + ' ' + (transaction.notes || '')),
            businessType: this.inferBusinessType(merchant),
            sentiment: this.analyzeSentiment(description),
            isRecurring: this.isLikelyRecurring(description, merchant)
        };
    }

    /**
     * Heuristic for recurring transactions
     */
    isLikelyRecurring(description, merchant) {
        const text = (description + ' ' + merchant).toLowerCase();
        const recurringKeywords = ['subscription', 'premium', 'monthly', 'yearly', 'annual', 'membership'];
        return recurringKeywords.some(k => text.includes(k));
    }
}

module.exports = new MetadataProcessor();
