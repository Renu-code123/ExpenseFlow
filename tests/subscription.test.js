/**
 * Predictive Subscription Engine Test Suite
 * Issue #647: Verifies lifecycle transitions and forecasting
 */

const assert = require('assert');
const predictiveMath = require('../utils/predictiveMath');

describe('Predictive Subscription Engine', () => {

    describe('Predictive Math (Forecasting)', () => {
        it('should forecast correct total for single monthly sub', () => {
            const subs = [{
                name: 'Netflix',
                amount: 10,
                nextPaymentDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
                billingCycle: 'monthly'
            }];

            const forecast = predictiveMath.forecastImpact(subs, 30);
            assert.strictEqual(forecast.totalProjectedCost, 10);
            assert.strictEqual(forecast.timeline.length, 1);
        });

        it('should forecast multiple payments for weekly sub', () => {
            const subs = [{
                name: 'Gems',
                amount: 5,
                nextPaymentDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
                billingCycle: 'weekly'
            }];

            const forecast = predictiveMath.forecastImpact(subs, 20);
            // Day 1, Day 8, Day 15 = 3 payments
            assert.strictEqual(forecast.totalProjectedCost, 15);
            assert.strictEqual(forecast.timeline.length, 3);
        });

        it('should calculate renewal probability based on weights', () => {
            const goodSub = { usageFrequency: 'high', valueRating: 5, paymentCount: 10 };
            const badSub = { usageFrequency: 'none', valueRating: 1, isInTrial: true };

            const goodScore = predictiveMath.calculateRenewalProbability(goodSub);
            const badScore = predictiveMath.calculateRenewalProbability(badSub);

            assert(goodScore > 80);
            assert(badScore < 40);
        });
    });

    describe('Lifecycle State Machine (Conceptual)', () => {
        it('should correctly determine risk level', () => {
            const highRisk = predictiveMath._calculateRiskLevel(4000, 30); // ~133/day
            assert.strictEqual(highRisk, 'high');
        });
    });
});
