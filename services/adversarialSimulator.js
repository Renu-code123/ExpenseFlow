const AttackGraph = require('../models/AttackGraph');
const PolicyNode = require('../models/PolicyNode');
const GraphTheoryMath = require('../utils/graphTheoryMath');
const logger = require('../utils/structuredLogger');

/**
 * AdversarialSimulator
 * Issue #907: Brain for generating "Detection-Evasive" synthetic transactions.
 * Proactively identifies vulnerabilities in the complianceGuard.
 */
class AdversarialSimulator {
    /**
     * Generate synthetic fraudulent transactions designed to bypass specific policy nodes.
     */
    async generateAdversarialBatch(workspaceId, strategy = 'SALAMI_SLICING') {
        logger.info(`[AdversarialSimulator] Generating attack batch for workspace: ${workspaceId} with strategy: ${strategy}`);

        const attackGraph = await this.getOrUpdateAttackGraph(workspaceId);
        const transactions = [];

        switch (strategy) {
            case 'SALAMI_SLICING':
                // Small amounts just below thresholds
                transactions.push(...this.simulateSalamiSlicing(workspaceId, attackGraph));
                break;
            case 'VALUE_SPLITTING':
                // Split one large expense into many small ones
                transactions.push(...this.simulateValueSplitting(workspaceId, attackGraph));
                break;
            case 'MIMICRY_ATTACK':
                // Mix fake expenses with high-trust historical patterns
                transactions.push(...this.simulateMimicry(workspaceId, attackGraph));
                break;
        }

        return transactions;
    }

    /**
     * Salami Slicing: Generate many small transactions just under common thresholds.
     */
    simulateSalamiSlicing(workspaceId, graph) {
        const thresholdNode = graph.nodes.find(n => n.metadata?.threshold);
        const limit = (thresholdNode?.metadata?.threshold || 100) - 0.01;

        return Array(10).fill(0).map(() => ({
            workspaceId,
            amount: limit,
            category: 'Miscellaneous',
            description: 'Synthetic Salami Slice',
            isSynthetic: true,
            attackVector: 'SALAMI_SLICING'
        }));
    }

    /**
     * Mimicry: Generate transactions that look like legitimate recurring spend.
     */
    simulateMimicry(workspaceId, graph) {
        // Logic to mimic known good merchants
        return [{
            workspaceId,
            amount: 45.00,
            merchant: 'AWS', // Common high-trust merchant
            category: 'Software',
            isSynthetic: true,
            attackVector: 'MIMICRY'
        }];
    }

    /**
     * Map the threat surface and find weak points.
     */
    async getOrUpdateAttackGraph(workspaceId) {
        let graph = await AttackGraph.findOne({ workspaceId });

        if (!graph) {
            const policyNodes = await PolicyNode.find({ workspaceId });
            const nodes = policyNodes.map(pn => ({
                id: pn._id.toString(),
                type: 'POLICY_GATE',
                vulnerabilityLevel: pn.robustnessScore ? (1 - pn.robustnessScore) : 0.5,
                metadata: { threshold: pn.config?.maxAmount }
            }));

            // Mock edges for now - connecting policy gates in sequence
            const edges = [];
            for (let i = 0; i < nodes.length - 1; i++) {
                edges.push({
                    from: nodes[i].id,
                    to: nodes[i + 1].id,
                    exploitProbability: 0.3,
                    bypassMethod: 'SEQUENTIAL_BYPASS'
                });
            }

            graph = await AttackGraph.create({
                workspaceId,
                nodes,
                edges,
                status: 'ACTIVE'
            });
        }

        return graph;
    }
}

module.exports = new AdversarialSimulator();
