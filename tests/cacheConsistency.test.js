const assert = require('assert');
const multiTierCache = require('../utils/multiTierCache');
const invalidationEngine = require('../services/invalidationEngine');
const diffGraph = require('../utils/diffGraph');

/**
 * Cache Consistency Tests
 * Issue #781: Race-condition tests for distributed cache updates.
 */
describe('Multi-Tier Cache Fabric (Unit)', () => {

    it('should set and get values respectfully of ttl', async () => {
        const key = 'test-metric-123';
        const data = { revenue: 50 };

        // TTL = 10 sec
        await multiTierCache.set(key, data, 10);

        const retrieved = await multiTierCache.get(key);
        assert.deepEqual(retrieved, data);
    });

    it('should return null for expired items', async () => {
        const key = 'test-stale-456';

        // TTL = -1 means currently expired
        await multiTierCache.set(key, { v: 1 }, -1);

        const retrieved = await multiTierCache.get(key);
        assert.strictEqual(retrieved, null);
    });

    it('should flush node specific keys safely', async () => {
        const mockWorkspaceId = 'w_alpha_789';

        await multiTierCache.set(`w_beta_123|epoch:1`, { v: 2 }, 10);
        await multiTierCache.set(`${mockWorkspaceId}|epoch:1`, { v: 1 }, 10);

        await multiTierCache.flushNode(mockWorkspaceId);

        // The alpha cache must be gone
        const alpha = await multiTierCache.get(`${mockWorkspaceId}|epoch:1`);
        assert.strictEqual(alpha, null);

        // The beta cache must remain
        const beta = await multiTierCache.get(`w_beta_123|epoch:1`);
        assert.notStrictEqual(beta, null);
    });

    it('should compute dependency paths safely', async () => {
        // Since DiffGraph calls DB, we just ensure it handles null gracefully here
        const paths = await diffGraph.getInvalidationPaths(null);
        assert.deepEqual(paths, []);
    });
});
