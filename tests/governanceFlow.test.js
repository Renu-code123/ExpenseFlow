const assert = require('assert');
const mongoose = require('mongoose');
const complianceOrchestrator = require('../services/complianceOrchestrator');
const predicateEngine = require('../utils/predicateEngine');
const PolicyNode = require('../models/PolicyNode');
const Workspace = require('../models/Workspace');

describe('Parametric Policy Governance & Compliance Circuit Breaker (#780)', () => {

    it('Predicate Engine should evaluate complex AST conditions', () => {
        const condition = {
            op: 'AND',
            args: [
                {
                    op: 'GREATER_THAN',
                    field: 'payload.amount',
                    value: 1000
                },
                {
                    op: 'IN_ARRAY',
                    field: 'payload.category',
                    array: ['Entertainment', 'Luxury']
                }
            ]
        };

        const badContext = {
            payload: { amount: 1500, category: 'Luxury' }
        };
        const goodContext = {
            payload: { amount: 500, category: 'Travel' }
        };

        assert.strictEqual(predicateEngine.evaluate(condition, badContext), true);
        assert.strictEqual(predicateEngine.evaluate(condition, goodContext), false);
    });

    it('Predicate Engine should detect statistical anomalies', () => {
        const condition = {
            op: 'ANOMALY_ZSCORE',
            field: 'payload.amount',
            historyField: 'context.history',
            threshold: 2.0
        };

        // Standard sequence: 100, 110, 95, 105, 100. Mean ~ 102, StdDev is small ~5.4
        // A value of 500 is wildly anomalous (Z-Score > 73)
        const context = {
            payload: { amount: 500 },
            context: { history: [100, 110, 95, 105, 100] }
        };

        const isTripped = predicateEngine.evaluate(condition, context);
        assert.strictEqual(isTripped, true);

        const normalContext = {
            payload: { amount: 105 },
            context: { history: [100, 110, 95, 105, 100] }
        };
        assert.strictEqual(predicateEngine.evaluate(condition, normalContext), false);
    });

    it('Compliance Orchestrator should evaluate and trip a circuit breaker', async () => {
        // Mock the diffGraph and policyRepository to inject controlled test data
        // without hitting the DB.

        const diffGraph = require('../utils/diffGraph');
        const policyRepo = require('../repositories/policyRepository');

        const originalDiffGraph = diffGraph.getInvalidationPaths;
        const originalPolicyRepo = policyRepo.getInheritedPolicies;

        const mockWorkspaceId = new mongoose.Types.ObjectId();

        diffGraph.getInvalidationPaths = async () => [mockWorkspaceId.toString()];

        policyRepo.getInheritedPolicies = async () => [
            {
                _id: 'policy_1',
                name: 'Anti-Luxury Spend Cap',
                targetResource: 'TRANSACTION',
                action: 'DENY',
                conditions: {
                    op: 'GREATER_THAN',
                    field: 'payload.amount',
                    value: 5000
                }
            }
        ];

        try {
            const badPayload = { amount: 6000 };
            const goodPayload = { amount: 1000 };

            const badEval = await complianceOrchestrator.evaluate(mockWorkspaceId.toString(), 'TRANSACTION', badPayload);
            assert.strictEqual(badEval.allowed, false);
            assert.strictEqual(badEval.action, 'DENY');

            const goodEval = await complianceOrchestrator.evaluate(mockWorkspaceId.toString(), 'TRANSACTION', goodPayload);
            assert.strictEqual(goodEval.allowed, true);

        } finally {
            // Restore mocks
            diffGraph.getInvalidationPaths = originalDiffGraph;
            policyRepo.getInheritedPolicies = originalPolicyRepo;
        }
    });
});
