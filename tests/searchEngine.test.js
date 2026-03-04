const assert = require('assert');
const metadataProcessor = require('../utils/metadataProcessor');
const indexingEngine = require('../services/indexingEngine');

/**
 * Search Engine Infrastructure Tests
 * Issue #720: Verifies semantic extraction and indexing logic.
 */

describe('Semantic Search Infrastructure', () => {

    describe('MetadataProcessor (Semantic Engine)', () => {
        it('should extract business tags from description', () => {
            const tags = metadataProcessor.extractTags('Business dinner for the tax project');
            assert.ok(tags.includes('fiscal'));
            assert.ok(tags.includes('business'));
            assert.ok(tags.includes('dining'));
        });

        it('should infer business type from merchant name', () => {
            assert.strictEqual(metadataProcessor.inferBusinessType('Walmart Supercenter'), 'retail');
            assert.strictEqual(metadataProcessor.inferBusinessType('Uber Ride San Francisco'), 'transport');
            assert.strictEqual(metadataProcessor.inferBusinessType('Starbucks Coffee'), 'food_beverages');
            assert.strictEqual(metadataProcessor.inferBusinessType('AWS Cloud Services'), 'subscription');
        });

        it('should detect sentiment accurately', () => {
            assert.strictEqual(metadataProcessor.analyzeSentiment('Tax refund from State'), 'positive');
            assert.strictEqual(metadataProcessor.analyzeSentiment('Late fee penalty for card'), 'negative');
            assert.strictEqual(metadataProcessor.analyzeSentiment('Generic grocery purchase'), 'neutral');
        });

        it('should detect likely recurring transactions', () => {
            assert.strictEqual(metadataProcessor.isLikelyRecurring('Monthly Netflix Subscription', 'Netflix'), true);
            assert.strictEqual(metadataProcessor.isLikelyRecurring('One-time coffee', 'Local Cafe'), false);
        });
    });

    describe('Indexing Workflow (Mocked)', () => {
        const mockTx = {
            _id: '507f1f77bcf86cd799439011',
            user: '507f1f77bcf86cd799439012',
            description: 'Business lunch with client',
            merchant: 'Starbucks',
            amount: 25.50,
            originalCurrency: 'USD',
            category: '507f1f77bcf86cd799439013',
            date: new Date(),
            notes: 'Project discussion about taxes'
        };

        it('should prepare correct search data structure', () => {
            const enrichment = metadataProcessor.process(mockTx);

            assert.ok(enrichment.tags.includes('dining'));
            assert.ok(enrichment.tags.includes('fiscal'));
            assert.strictEqual(enrichment.businessType, 'food_beverages');
            assert.strictEqual(enrichment.sentiment, 'neutral');
        });
    });
});
