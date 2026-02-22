const assert = require('assert');
const diffEngine = require('../utils/diffEngine');

/**
 * Forensic Audit Traceability Tests
 * Issue #731: Verifies state diffing and reconstruction logic.
 */

describe('Forensic Audit Engine', () => {

    describe('DiffEngine (Logic)', () => {
        it('should detect simple field changes', () => {
            const before = { amount: 100, category: 'food' };
            const after = { amount: 150, category: 'food' };

            const diff = diffEngine.compare(before, after);

            assert.strictEqual(diff.amount.old, 100);
            assert.strictEqual(diff.amount.new, 150);
            assert.strictEqual(diff.category, undefined); // No change
        });

        it('should handle nested objects and arrays', () => {
            const before = { metadata: { tags: ['work'] } };
            const after = { metadata: { tags: ['work', 'travel'] } };

            const diff = diffEngine.compare(before, after);

            assert.ok(diff.metadata);
            assert.deepStrictEqual(diff.metadata.old.tags, ['work']);
            assert.deepStrictEqual(diff.metadata.new.tags, ['work', 'travel']);
        });

        it('should return null if no changes exist', () => {
            const obj = { a: 1, b: 2 };
            const diff = diffEngine.compare(obj, obj);
            assert.strictEqual(diff, null);
        });
    });

    describe('State Reconstruction (Time Travel)', () => {
        it('should reconstruct objects from a series of diffs', () => {
            const base = { name: 'Initial', value: 10 };
            const diffs = [
                { name: { old: 'Initial', new: 'Step 1' } },
                { value: { old: 10, new: 20 }, notes: { old: null, new: 'Added notes' } },
                { name: { old: 'Step 1', new: 'Final Name' } }
            ];

            const reconstructed = diffEngine.reconstruct(base, diffs);

            assert.strictEqual(reconstructed.name, 'Final Name');
            assert.strictEqual(reconstructed.value, 20);
            assert.strictEqual(reconstructed.notes, 'Added notes');
        });
    });
});
