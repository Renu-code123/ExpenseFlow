const assert = require('assert');
const consensusEngine = require('../services/consensusEngine');

/**
 * Consensus Logic Integrity Tests
 * Issue #769: Verifying causal ordering and concurrent conflict detection.
 */
describe('Distributed Consensus Engine (Unit)', () => {

    describe('Vector Clock Comparison', () => {
        it('should detect causal successor (greater)', () => {
            const current = { v1: 1, v2: 1 };
            const incoming = { v1: 1, v2: 2 };
            assert.strictEqual(consensusEngine.compareClocks(incoming, current), 'greater');
        });

        it('should detect stale updates (smaller)', () => {
            const current = { v1: 5, v2: 2 };
            const incoming = { v1: 4, v2: 2 };
            assert.strictEqual(consensusEngine.compareClocks(incoming, current), 'smaller');
        });

        it('should detect concurrent conflicts', () => {
            const current = { v1: 10, v2: 5 };
            const incoming = { v1: 9, v2: 6 }; // Diverged
            assert.strictEqual(consensusEngine.compareClocks(incoming, current), 'concurrent');
        });

        it('should identify identical states (equal)', () => {
            const current = { v1: 10 };
            const incoming = { v1: 10 };
            assert.strictEqual(consensusEngine.compareClocks(incoming, current), 'equal');
        });
    });

    describe('Reconcile Decisions', () => {
        it('should APPLY a greater clock update', async () => {
            const entity = { vectorClock: { s1: 1 } };
            const journal = { vectorClock: { s1: 2 }, payload: { amount: 100 } };

            const result = await consensusEngine.reconcile(entity, journal);
            assert.strictEqual(result.action, 'APPLY');
        });

        it('should CONFLICT on concurrent updates', async () => {
            const entity = { vectorClock: { s1: 1, s2: 1 } };
            const journal = { vectorClock: { s1: 2, s2: 0 }, payload: { amount: 200 } };

            const result = await consensusEngine.reconcile(entity, journal);
            assert.strictEqual(result.action, 'CONFLICT');
        });
    });
});
