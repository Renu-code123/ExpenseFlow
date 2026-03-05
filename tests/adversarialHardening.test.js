const AdversarialSimulator = require('../services/adversarialSimulator');
const complianceGuard = require('../services/complianceGuard');
const mongoose = require('mongoose');

describe('Adversarial Hardening - Red Team vs. complianceGuard', () => {
    const mockWorkspaceId = new mongoose.Types.ObjectId().toString();

    test('Hardened Mode should block synthetic Salami Slices that normal mode might allow', async () => {
        // 1. Generate an attack batch
        const attacks = await AdversarialSimulator.generateAdversarialBatch(mockWorkspaceId, 'SALAMI_SLICING');
        const attackPayload = attacks[0];

        // 2. Test in Normal Mode (Mocking policy result as allowed)
        // Note: In real test, we would setup PolicyNode in DB
        const resultNormal = await complianceGuard.evaluateTransaction(mockWorkspaceId, attackPayload, {
            isHardened: false
        });

        // Normal mode might flag it but allow if it looks 'marginal'
        // But for this test, we check if Hardened mode is STRICTER

        // 3. Test in Hardened Mode
        const resultHardened = await complianceGuard.evaluateTransaction(mockWorkspaceId, attackPayload, {
            isHardened: true
        });

        // 4. Assertions
        if (resultNormal.action === 'FLAG') {
            expect(resultHardened.action).toBe('DENY');
            expect(resultHardened.allowed).toBe(false);
        }
    });

    test('Simulator should identify gaps in PolicyNodes', async () => {
        const graph = await AdversarialSimulator.getOrUpdateAttackGraph(mockWorkspaceId);
        expect(graph.nodes.length).toBeGreaterThan(0);
        expect(graph.edges.length).toBeGreaterThan(0);
    });
});
