const assert = require('assert');
const mongoose = require('mongoose');
const homomorphicMath = require('../utils/homomorphicMath');
const zkPrivacyOrchestrator = require('../services/zkPrivacyOrchestrator');
const PrivacyBridge = require('../models/PrivacyBridge');

describe('Zero-Knowledge Privacy Bridge & Cross-Tenant Analytics (#844)', () => {

    it('Homomorphic Math should inject noise for differential privacy', () => {
        const val = 1000;
        const noisyVal1 = homomorphicMath.injectNoise(val, 0.1);
        const noisyVal2 = homomorphicMath.injectNoise(val, 0.1);

        assert.notStrictEqual(val, noisyVal1, 'Value should be different from original due to noise');
        assert.notStrictEqual(noisyVal1, noisyVal2, 'Two noisy injections should produce different results');
    });

    it('Homomorphic Math should maintain additive properties (simulated)', () => {
        const values = [100, 200, 300];
        const sum = homomorphicMath.additiveSum(values);
        assert.strictEqual(sum, 600);
    });

    it('ZKPrivacyOrchestrator should prevent anonymization if budget exceeded', async () => {
        // Mock PrivacyBridge findOne
        const originalFindOne = PrivacyBridge.findOne;
        PrivacyBridge.findOne = async () => ({
            workspaceId: 'mockId',
            allowBenchmarking: true,
            privacyBudgetUsed: 9.9,
            privacyBudgetLimit: 10.0,
            save: async () => { }
        });

        try {
            const metrics = [100, 200];
            const result = await zkPrivacyOrchestrator.anonymizeAndSum('mockId', metrics, { epsilon: 0.5 });

            assert.strictEqual(result, null, 'Result should be null when privacy budget is exceeded');
        } finally {
            PrivacyBridge.findOne = originalFindOne;
        }
    });

    it('Anonymization Guard should strip PII from data payload', (done) => {
        const anonymizationGuard = require('../middleware/anonymizationGuard');

        const req = {
            path: '/industry-benchmark/contribute',
            body: {
                amount: 500,
                merchantName: 'Starbucks',
                notes: 'Morning coffee',
                category: 'Food'
            }
        };
        const res = {};
        const next = () => {
            assert.strictEqual(req.sanitizedBenchmarkingData.merchantName, undefined);
            assert.strictEqual(req.sanitizedBenchmarkingData.notes, undefined);
            assert.strictEqual(req.sanitizedBenchmarkingData.amount, 500);
            done();
        };

        anonymizationGuard(req, res, next);
    });

    it('Analytics should compute averages from anonymized aggregates', async () => {
        const aggregates = [
            { anonymizedSum: 1050, count: 2 }, // Avg 525
            { anonymizedSum: 1950, count: 3 }  // Avg 650
        ];

        // (1050 + 1950) / 5 = 3000 / 5 = 600
        const avg = await zkPrivacyOrchestrator.calculateIndustryAverage(aggregates);
        assert.strictEqual(avg, 600);
    });
});
