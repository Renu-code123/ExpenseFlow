const assert = require('assert');
const FuzzyMatch = require('../utils/fuzzyMatch');
const reconciliationAgent = require('../services/reconciliationAgent');
const mongoose = require('mongoose');

describe('Self-Healing Financial Reconciliation (#910)', () => {

    describe('FuzzyMatch (Merchant Normalization)', () => {
        it('should calculate high similarity for nearly identical names after normalization', () => {
            const s1 = FuzzyMatch.normalizeMerchant('Stripe * Services');
            const s2 = FuzzyMatch.normalizeMerchant('Stripe');
            const score = FuzzyMatch.calculateSimilarity(s1, s2);
            assert.ok(score > 0.9);
        });

        it('should normalize merchant strings correctly', () => {
            assert.strictEqual(FuzzyMatch.normalizeMerchant('Amazon.com * Prime'), 'amazon.com');
            assert.strictEqual(FuzzyMatch.normalizeMerchant('Uber Trip #1234'), 'uber trip');
        });
    });

    describe('ReconciliationAgent (Auto-Healing)', () => {
        it('should identify fuzzy match discrepancies', async () => {
            const bankTx = {
                _id: 'bk_1',
                timestamp: new Date(),
                payload: { amount: 50, merchant: 'Coffee Shop #123', isExternal: true }
            };

            // Mocking FinancialEvent.findOne and find for the test
            const FinancialEvent = require('../models/FinancialEvent');
            const originalFindOne = FinancialEvent.findOne;
            const originalFind = FinancialEvent.find;

            FinancialEvent.findOne = () => Promise.resolve(null); // No exact match
            FinancialEvent.find = () => Promise.resolve([
                { entityId: 'e_1', payload: { amount: 50, merchant: 'Coffee Shop' }, timestamp: new Date() }
            ]);

            const fix = await reconciliationAgent.analyzeDiscrepancy(bankTx, 'ws_1');

            assert.strictEqual(fix.type, 'ORPHAN_MATCH');
            assert.ok(fix.confidence > 0.8);
            assert.strictEqual(fix.ledgerTx.entityId, 'e_1');

            // Restore
            FinancialEvent.findOne = originalFindOne;
            FinancialEvent.find = originalFind;
        });

        it('should suggest compensating entry for orphans', async () => {
            const bankTx = {
                _id: 'bk_2',
                timestamp: new Date(),
                payload: { amount: 120, merchant: 'Unknown Merchant', isExternal: true }
            };

            const FinancialEvent = require('../models/FinancialEvent');
            const originalFindOne = FinancialEvent.findOne;
            const originalFind = FinancialEvent.find;

            FinancialEvent.findOne = () => Promise.resolve(null);
            FinancialEvent.find = () => Promise.resolve([]); // No similar amount found

            const fix = await reconciliationAgent.analyzeDiscrepancy(bankTx, 'ws_1');

            assert.strictEqual(fix.type, 'COMPENSATING_ENTRY');
            assert.strictEqual(fix.confidence, 0.95);

            FinancialEvent.findOne = originalFindOne;
            FinancialEvent.find = originalFind;
        });
    });
});
