/**
 * Distributed Vector-Clock & Consensus Test Suite
 * Issue #705: Verifies partial ordering math and conflict detection.
 */

const assert = require('assert');
const vectorClockMath = require('../utils/vectorClockMath');

describe('Distributed Sync & Vector Clocks', () => {

    describe('Vector Clock Math', () => {
        it('should correctly identify strictly newer clocks', () => {
            const clockA = { "device1": 2, "device2": 1 };
            const clockB = { "device1": 1, "device2": 1 };

            assert.strictEqual(vectorClockMath.compare(clockA, clockB), 1);
        });

        it('should correctly identify strictly older clocks', () => {
            const clockA = { "device1": 1, "device2": 1 };
            const clockB = { "device1": 1, "device2": 2 };

            assert.strictEqual(vectorClockMath.compare(clockA, clockB), -1);
        });

        it('should detect concurrent clocks (conflicts)', () => {
            const clockA = { "device1": 2, "device2": 1 };
            const clockB = { "device1": 1, "device2": 2 };

            // A has newer device1, B has newer device2 -> Conflict
            assert.strictEqual(vectorClockMath.compare(clockA, clockB), null);
            assert.ok(vectorClockMath.isConcurrent(clockA, clockB));
        });

        it('should identify identical clocks', () => {
            const clockA = { "device1": 5 };
            const clockB = { "device1": 5 };

            assert.strictEqual(vectorClockMath.compare(clockA, clockB), 0);
        });

        it('should merge clocks correctly', () => {
            const clockA = { "device1": 2, "device2": 5 };
            const clockB = { "device1": 4, "device3": 1 };
            const expected = { "device1": 4, "device2": 5, "device3": 1 };

            const merged = vectorClockMath.merge(clockA, clockB);
            assert.deepStrictEqual(merged, expected);
        });
    });

    describe('Semantic Merge Logic (Service Sim)', () => {
        const ConsensusService = require('../services/consensusService');

        it('should reject stale updates silently', async () => {
            const currentEntity = {
                vectorClock: { toObject: () => ({ "d1": 10 }) }
            };
            const incomingData = { vectorClock: { "d1": 5 } };

            const result = await ConsensusService.reconcile(currentEntity, incomingData, 'd2', 'user1');
            assert.strictEqual(result.action, 'ignore');
        });
    });
});
