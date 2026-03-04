/**
 * Forensic State Replay Test Suite
 * Issue #680: Verifies state reconstruction and diff calculation
 */

const assert = require('assert');
const eventDiffEngine = require('../utils/eventDiffEngine');

describe('Immutable Event Sourcing & Forensics', () => {

    describe('Event Diff Engine', () => {
        it('should calculate deep deltas accurately', () => {
            const oldState = { amount: 100, category: 'Food', desc: 'Lunch' };
            const newState = { amount: 150, category: 'Food', desc: 'Dinner' };

            const delta = eventDiffEngine.calculateDelta(oldState, newState);

            assert.strictEqual(delta.amount.from, 100);
            assert.strictEqual(delta.amount.to, 150);
            assert.strictEqual(delta.desc.from, 'Lunch');
            assert.strictEqual(delta.desc.to, 'Dinner');
            assert.strictEqual(delta.category, undefined); // No change
        });

        it('should reconstruct state from sequential events', () => {
            const events = [
                { version: 1, payload: { amount: 100, category: 'Food' } },
                {
                    version: 2,
                    payload: {
                        _isDelta: true,
                        diff: { amount: { from: 100, to: 150 } }
                    }
                },
                {
                    version: 3,
                    payload: {
                        _isDelta: true,
                        diff: { category: { from: 'Food', to: 'Dining' } }
                    }
                }
            ];

            const reconstructed = eventDiffEngine.reconstruct({}, events);

            assert.strictEqual(reconstructed.amount, 150);
            assert.strictEqual(reconstructed.category, 'Dining');
        });
    });

    describe('Immutability Checks', () => {
        it('should detect checksum mismatches in corrupted chains', () => {
            const payload = { test: 1 };
            const prevId = 'some-event-id';

            const originalChecksum = eventDiffEngine.generateChecksum(payload, prevId);

            // Alter state
            const corruptedPayload = { test: 2 };
            const newChecksum = eventDiffEngine.generateChecksum(corruptedPayload, prevId);

            assert.notStrictEqual(originalChecksum, newChecksum);
        });
    });
});
