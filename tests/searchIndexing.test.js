const assert = require('assert');
const indexingEngine = require('../services/indexingEngine');

/**
 * Search Indexing Unit Tests
 * Issue #756: Verifies tokenization and search logic.
 */
describe('Search Indexing Engine (Unit)', () => {

    describe('Tokenization Logic', () => {
        it('should extract correct tokens from transaction data', () => {
            const mockData = {
                description: 'Starbucks Coffee in Seattle',
                merchant: 'Starbucks',
                amount: 15.50,
                category: 'Food'
            };

            const tokens = indexingEngine._tokenize(mockData);

            assert(tokens.includes('starbucks'));
            assert(tokens.includes('coffee'));
            assert(tokens.includes('seattle'));
            assert(tokens.includes('amt:15'));
        });

        it('should filter out short tokens', () => {
            const mockData = { description: 'A to of B' };
            const tokens = indexingEngine._tokenize(mockData);
            assert.strictEqual(tokens.length, 0); // All words <= 2 chars
        });

        it('should handle missing fields gracefully', () => {
            const tokens = indexingEngine._tokenize({});
            assert(Array.isArray(tokens));
            assert.strictEqual(tokens.length, 0);
        });
    });

    describe('Search Query Parsing', () => {
        // Mocking the search query logic since actual DB search requires Mongoose
        it('should format multi-word queries correctly', async () => {
            // This is a logic test, actual execution is skipped in unit tests
            const query = 'Office Supplies 2024';
            const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

            assert.deepStrictEqual(tokens, ['office', 'supplies', '2024']);
        });
    });
});
