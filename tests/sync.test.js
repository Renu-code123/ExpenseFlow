/**
 * Differential Sync & Conflict Resolution Test Suite
 * Issue #660: Verifies merge strategies and differential tracking
 */

const assert = require('assert');
const conflictResolver = require('../utils/conflictResolver');

describe('Differential Sync & Conflict Resolution', () => {

    describe('Conflict Resolver (Merge Strategies)', () => {
        it('should resolve via LWW when client timestamp is newer', () => {
            const server = {
                amount: 100,
                updatedAt: new Date('2026-01-01T10:00:00Z'),
                version: 5,
                toObject: () => server
            };
            const incoming = {
                amount: 200,
                updatedAt: new Date('2026-01-01T11:00:00Z'),
                version: 4 // Client is behind in version but has newer timestamp
            };

            const result = conflictResolver.resolve(server, incoming, 'LWW');
            assert.strictEqual(result.data.amount, 200);
            assert.strictEqual(result.conflicted, true);
        });

        it('should perform field-level merging in MERGE strategy', () => {
            const server = {
                amount: 100,
                category: 'food',
                version: 5,
                toObject: () => server
            };
            const incoming = {
                description: 'Pizza',
                category: 'entertainment', // Different category
                version: 5
            };

            const result = conflictResolver.resolve(server, incoming, 'MERGE');
            assert.strictEqual(result.data.amount, 100); // Kept from server
            assert.strictEqual(result.data.category, 'entertainment'); // Taken from incoming
            assert.strictEqual(result.data.description, 'Pizza'); // Taken from incoming
        });
    });

    describe('Vector Clocks', () => {
        it('should return 1 when first clock is definitely ahead', () => {
            const v1 = { deviceA: 5, deviceB: 2 };
            const v2 = { deviceA: 4, deviceB: 2 };
            assert.strictEqual(conflictResolver.compareVectorClocks(v1, v2), 1);
        });

        it('should return 0 for concurrent clocks', () => {
            const v1 = { deviceA: 5, deviceB: 1 };
            const v2 = { deviceA: 4, deviceB: 2 };
            assert.strictEqual(conflictResolver.compareVectorClocks(v1, v2), 0);
        });
    });
});
