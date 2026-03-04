const MoneyLineage = require('../models/MoneyLineage');
const VectorGraphMath = require('../utils/vectorGraphMath');
const logger = require('../utils/structuredLogger');

/**
 * Eligibility Traversal Engine Service
 * Issue #866: Graph-traversal logic for fund-to-expense mapping.
 * Proves that enough "Eligible" funds exist for a transaction.
 */
class EligibilityTraversalEngine {
    /**
     * Traverses the money fragments in a treasury node to find eligible funds.
     */
    async findEligibleFunds(treasuryNodeId, amount, expenseCategory, tags = []) {
        logger.info(`[EligibilityEngine] Searching for ${amount} eligible for ${expenseCategory} in Node: ${treasuryNodeId}`);

        const fragments = await MoneyLineage.find({ treasuryNodeId }).sort({ createdAt: 1 });

        let remainingToFind = amount;
        const selectedFragments = [];

        for (const fragment of fragments) {
            const score = VectorGraphMath.calculateEligibilityScore(fragment.sourceDna, expenseCategory, tags);

            if (score > 0.9) { // High confidence match
                const contribution = Math.min(fragment.amount, remainingToFind);
                selectedFragments.push({
                    fragmentId: fragment._id,
                    sourceDna: fragment.sourceDna,
                    amountContributed: contribution,
                    provenanceHash: fragment.provenanceHash
                });

                remainingToFind -= contribution;
            }

            if (remainingToFind <= 0) break;
        }

        if (remainingToFind > 0) {
            return {
                eligible: false,
                shortfall: remainingToFind,
                message: `Insufficient eligible funds for category: ${expenseCategory}`
            };
        }

        return {
            eligible: true,
            selectedFragments,
            totalFound: amount
        };
    }

    /**
     * Attests a transaction by consuming the eligible fragments.
     */
    async attestAndConsume(treasuryNodeId, amount, expenseCategory, tags = []) {
        const result = await this.findEligibleFunds(treasuryNodeId, amount, expenseCategory, tags);

        if (!result.eligible) {
            throw new Error(result.message);
        }

        // Deduct from fragments (Atomicity should be handled with transactions in real system)
        for (const selection of result.selectedFragments) {
            await MoneyLineage.updateOne(
                { _id: selection.fragmentId },
                { $inc: { amount: -selection.amountContributed } }
            );
        }

        return result;
    }
}

module.exports = new EligibilityTraversalEngine();
