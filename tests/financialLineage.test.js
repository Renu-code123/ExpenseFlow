const assert = require('assert');
const VectorGraphMath = require('../utils/vectorGraphMath');
const eligibilityTraversalEngine = require('../services/eligibilityTraversalEngine');
const mongoose = require('mongoose');

describe('Semantic Financial Lineage & Vector-Graph Eligibility (#866)', () => {

    describe('VectorGraphMath (Eligibility Scoring)', () => {
        it('should return score 1.0 for valid DNA-Category matches', () => {
            assert.strictEqual(VectorGraphMath.calculateEligibilityScore('STATE_GRANT', 'R&D'), 1.0);
            assert.strictEqual(VectorGraphMath.calculateEligibilityScore('VENTURE_CAPITAL', 'SALARY'), 1.0);
            assert.strictEqual(VectorGraphMath.calculateEligibilityScore('REVENUE', 'ANYTHING'), 1.0);
        });

        it('should return score 0.0 for invalid DNA-Category matches', () => {
            assert.strictEqual(VectorGraphMath.calculateEligibilityScore('STATE_GRANT', 'PARTIES'), 0.0);
            assert.strictEqual(VectorGraphMath.calculateEligibilityScore('LOAN', 'DIVIDENDS'), 0.0);
        });

        it('should support partial matches via tags', () => {
            assert.strictEqual(VectorGraphMath.calculateEligibilityScore('STATE_GRANT', 'MISC', ['R&D']), 0.8);
        });
    });

    describe('EligibilityTraversalEngine (Graph Traversal)', () => {
        it('should correctly select multiple fragments to fulfill a request', async () => {
            const nodeId = new mongoose.Types.ObjectId();

            // Mocking MoneyLineage.find for unit test
            const originalFind = require('../models/MoneyLineage').find;
            require('../models/MoneyLineage').find = () => ({
                sort: () => Promise.resolve([
                    { _id: 'f1', sourceDna: 'STATE_GRANT', amount: 30, provenanceHash: 'h1' },
                    { _id: 'f2', sourceDna: 'STATE_GRANT', amount: 50, provenanceHash: 'h2' }
                ])
            });

            const result = await eligibilityTraversalEngine.findEligibleFunds(nodeId, 45, 'R&D');

            assert.strictEqual(result.eligible, true);
            assert.strictEqual(result.selectedFragments.length, 2);
            assert.strictEqual(result.selectedFragments[0].amountContributed, 30);
            assert.strictEqual(result.selectedFragments[1].amountContributed, 15);

            // Restore
            require('../models/MoneyLineage').find = originalFind;
        });

        it('should fail if insufficient eligible funds exist', async () => {
            const nodeId = new mongoose.Types.ObjectId();

            const originalFind = require('../models/MoneyLineage').find;
            require('../models/MoneyLineage').find = () => ({
                sort: () => Promise.resolve([
                    { _id: 'f1', sourceDna: 'LOAN', amount: 100, provenanceHash: 'h1' }
                ])
            });

            const result = await eligibilityTraversalEngine.findEligibleFunds(nodeId, 50, 'MARKETING');

            assert.strictEqual(result.eligible, false);
            assert.strictEqual(result.shortfall, 50);

            require('../models/MoneyLineage').find = originalFind;
        });
    });
});
