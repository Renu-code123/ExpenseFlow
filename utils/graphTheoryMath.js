/**
 * Graph Theory Math Utilities
 * Issue #907: Pathfinding algorithms for finding weak points in policy gates.
 */
class GraphTheoryMath {
    /**
     * Finds the highest probability bypass path in an attack graph.
     * Uses a variation of Dijkstra's algorithm for multiplicative probabilities.
     */
    static findHighestRiskPath(nodes, edges, startNodeId, endNodeId) {
        const probabilities = {};
        const predecessors = {};
        const queue = new Set();

        nodes.forEach(node => {
            probabilities[node.id] = 0;
            queue.add(node.id);
        });

        probabilities[startNodeId] = 1;

        while (queue.size > 0) {
            let u = null;
            queue.forEach(nodeId => {
                if (u === null || probabilities[nodeId] > probabilities[u]) {
                    u = nodeId;
                }
            });

            if (u === endNodeId || probabilities[u] === 0) break;
            queue.delete(u);

            const neighbors = edges.filter(e => e.from === u);
            neighbors.forEach(edge => {
                const alt = probabilities[u] * edge.exploitProbability;
                if (alt > probabilities[edge.to]) {
                    probabilities[edge.to] = alt;
                    predecessors[edge.to] = u;
                }
            });
        }

        const path = [];
        let curr = endNodeId;
        while (curr) {
            path.unshift(curr);
            curr = predecessors[curr];
        }

        return {
            path,
            probability: probabilities[endNodeId]
        };
    }

    /**
     * Calculates the "Robustness Score" of a node based on incoming edge weights.
     */
    static calculateRobustness(nodeId, edges) {
        const incomingEdges = edges.filter(e => e.to === nodeId);
        if (incomingEdges.length === 0) return 1.0;

        // Cumulative risk = 1 - (1 - p1)(1 - p2)...
        const totalExploitProb = 1 - incomingEdges.reduce((acc, edge) => acc * (1 - edge.exploitProbability), 1);
        return 1 - totalExploitProb;
    }
}

module.exports = GraphTheoryMath;
