/**
 * Autonomous Remediation & Validation Test Suite
 * Issue #704: Verifies data fixing logic and purity scoring.
 */

const assert = require('assert');
const remediationRules = require('../utils/remediationRules');

describe('Autonomous Remediation Pipeline', () => {

    describe('Remediation Rules', () => {
        it('should fix currency casing correctly', () => {
            const res = remediationRules.sanitizeCurrency('inr');
            assert.strictEqual(res.value, 'INR');
            assert.strictEqual(res.remediated, true);
        });

        it('should clip future dates to now', () => {
            const farFuture = new Date('2050-01-01').toISOString();
            const res = remediationRules.boundDate(farFuture);

            const now = new Date();
            // Should be roughly today's date
            assert.ok(res.remediated);
            assert.strictEqual(res.value.getFullYear(), now.getFullYear());
        });

        it('should normalize messy merchant names', () => {
            const messy = '  Starbucks   Coffee  ';
            const res = remediationRules.normalizeMerchant(messy);
            assert.strictEqual(res.value, 'Starbucks Coffee');
            assert.strictEqual(res.remediated, true);
        });

        it('should correct negative transaction amounts', () => {
            const negative = -150.50;
            const res = remediationRules.sanitizeAmount(negative);
            assert.strictEqual(res.value, 150.50);
            assert.strictEqual(res.remediated, true);
            assert.strictEqual(res.action, 'absolute_value_correction');
        });
    });

    describe('Validation Engine logic (Standalone)', () => {
        const validationEngine = require('../services/validationEngine');

        it('should calculate proper purity score drops', async () => {
            // Mocking a log save since we don't have DB in full unit test
            validationEngine._saveLog = async () => { };

            const messyData = {
                amount: -100, // Remediation ( -5 )
                description: 'Test',
                originalCurrency: 'usd', // Remediation ( -5 )
                merchant: '  Target  ', // Remediation ( -5 )
                date: new Date().toISOString()
            };

            // Initial score 100 - 15 = 85
            const result = await validationEngine.validateAndRemediate(messyData, 'fake_user');

            assert.ok(result.valid);
            assert.strictEqual(result.purityScore, 85);
            assert.strictEqual(result.data.amount, 100);
            assert.strictEqual(result.data.originalCurrency, 'USD');
        });
    });
});
