const assert = require('assert');
const CausalMath = require('../utils/causalMath');
const conflictMergeEngine = require('../services/conflictMergeEngine');

describe('Hybrid Multi-Master Ledger Sync & Causal Conflict Resolver (#868)', () => {

    describe('CausalMath (Vector Clocks)', () => {
        it('should correctly identify Happened-Before relationship', () => {
            const v1 = { 'node1': 1, 'node2': 0 };
            const v2 = { 'node1': 2, 'node2': 0 };
            assert.strictEqual(CausalMath.compareVectorClocks(v1, v2), 'HAPPENED_BEFORE');
        });

        it('should correctly identify Happened-After relationship', () => {
            const v1 = { 'node1': 2, 'node2': 1 };
            const v2 = { 'node1': 1, 'node2': 1 };
            assert.strictEqual(CausalMath.compareVectorClocks(v1, v2), 'HAPPENED_AFTER');
        });

        it('should correctly identify Concurrent updates', () => {
            const v1 = { 'node1': 1, 'node2': 2 };
            const v2 = { 'node1': 2, 'node2': 1 };
            assert.strictEqual(CausalMath.compareVectorClocks(v1, v2), 'CONCURRENT');
        });

        it('should identify Equal clocks', () => {
            const v1 = { 'node1': 5, 'node2': 5 };
            const v2 = { 'node1': 5, 'node2': 5 };
            assert.strictEqual(CausalMath.compareVectorClocks(v1, v2), 'EQUAL');
        });

        it('should merge clocks correctly', () => {
            const v1 = { 'node1': 1, 'node2': 5 };
            const v2 = { 'node1': 3, 'node2': 2 };
            const merged = CausalMath.mergeVectorClocks(v1, v2);
            assert.deepStrictEqual(merged, { 'node1': 3, 'node2': 5 });
        });
    });

    describe('ConflictMergeEngine', () => {
        it('should resolve concurrent updates deterministically (LWW)', async () => {
            const eventA = {
                entityId: 'e1',
                timestamp: new Date('2026-03-01T10:00:00Z'),
                signature: 'sigA',
                vectorClock: { 'n1': 1, 'n2': 0 }
            };
            const eventB = {
                entityId: 'e1',
                timestamp: new Date('2026-03-01T11:00:00Z'),
                signature: 'sigB',
                vectorClock: { 'n1': 0, 'n2': 1 }
            };

            const winner = await conflictMergeEngine.mergeHeads(eventA, eventB);
            assert.strictEqual(winner.signature, 'sigB');
        });

        it('should break ties using signature if timestamps are equal', async () => {
            const eventA = {
                entityId: 'e1',
                timestamp: new Date('2026-03-01T10:00:00Z'),
                signature: 'sigA',
                vectorClock: { 'n1': 1, 'n2': 0 }
            };
            const eventB = {
                entityId: 'e1',
                timestamp: new Date('2026-03-01T10:00:00Z'),
                signature: 'sigB',
                vectorClock: { 'n1': 0, 'n2': 1 }
            };

            const winner = await conflictMergeEngine.mergeHeads(eventA, eventB);
            // 'sigB' > 'sigA'
            assert.strictEqual(winner.signature, 'sigB');
        });
    });
});
