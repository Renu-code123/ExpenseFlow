const assert = require('assert');
const queryScoper = require('../utils/queryScoper');

/**
 * Tenant Isolation & Data Leakage Tests
 * Issue #729: Verifies that queries are strictly scoped to the active tenant.
 */

describe('Multi-Tenant Isolation Layer', () => {

    describe('QueryScoper (Unit Logic)', () => {
        it('should inject workspaceId into empty filter', () => {
            const filter = {};
            const workspaceId = 'ws_123';
            const scoped = queryScoper.apply(filter, workspaceId);

            assert.strictEqual(scoped.workspace, 'ws_123');
        });

        it('should prevent workspaceId override (Tenant Violation)', () => {
            const filter = { workspace: 'ws_foreign' };
            const workspaceId = 'ws_mine';

            assert.throws(() => {
                queryScoper.apply(filter, workspaceId);
            }, /Tenant Violation/);
        });

        it('should allow matching workspaceId without error', () => {
            const filter = { workspace: 'ws_mine' };
            const workspaceId = 'ws_mine';
            const scoped = queryScoper.apply(filter, workspaceId);

            assert.strictEqual(scoped.workspace, 'ws_mine');
        });
    });

    describe('LeakageGuard Logic (Simulation)', () => {
        // Mock middleware logic
        const simulateLeakageGuard = (data, tenantId) => {
            const dataToScan = data.data || data;
            if (Array.isArray(dataToScan)) {
                return dataToScan.filter(item => !item.workspace || item.workspace.toString() === tenantId);
            }
            if (dataToScan.workspace && dataToScan.workspace.toString() !== tenantId) {
                return null; // Blocked
            }
            return data;
        };

        it('should filter out leaked items in array responses', () => {
            const responseData = [
                { id: 1, workspace: 'ws_A', amount: 100 },
                { id: 2, workspace: 'ws_B', amount: 200 }, // LEAK
                { id: 3, workspace: 'ws_A', amount: 300 }
            ];

            const sanitized = simulateLeakageGuard(responseData, 'ws_A');

            assert.strictEqual(sanitized.length, 2);
            assert.strictEqual(sanitized.find(i => i.id === 2), undefined);
        });

        it('should block mismatched single object responses', () => {
            const singleObject = { id: 1, workspace: 'ws_B' };
            const result = simulateLeakageGuard(singleObject, 'ws_A');

            assert.strictEqual(result, null);
        });
    });
});
