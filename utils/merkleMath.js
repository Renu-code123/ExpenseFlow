const crypto = require('crypto');

/**
 * Merkle Math Utility
 * Issue #782: Building and verifying cryptographic proofs.
 */
class MerkleMath {
    /**
     * Create a Merkle root from an array of hashes
     */
    static buildRoot(hashes) {
        if (!hashes || hashes.length === 0) return null;

        let level = hashes;
        while (level.length > 1) {
            const nextLevel = [];
            for (let i = 0; i < level.length; i += 2) {
                const left = level[i];
                const right = (i + 1 < level.length) ? level[i + 1] : left; // Duplicate last if odd

                const combined = crypto.createHash('sha256')
                    .update(left + right)
                    .digest('hex');
                nextLevel.push(combined);
            }
            level = nextLevel;
        }

        return level[0];
    }

    /**
     * Generate a proof for a specific leaf index
     */
    static generateProof(hashes, index) {
        let proof = [];
        let level = hashes;
        let currentIndex = index;

        while (level.length > 1) {
            const isRightNode = currentIndex % 2 === 1;
            const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

            if (siblingIndex < level.length) {
                proof.push({
                    position: isRightNode ? 'left' : 'right',
                    hash: level[siblingIndex]
                });
            } else {
                // If odd and last, sibling is itself
                proof.push({
                    position: 'right',
                    hash: level[currentIndex]
                });
            }

            // Move to next level
            const nextLevel = [];
            for (let i = 0; i < level.length; i += 2) {
                const left = level[i];
                const right = (i + 1 < level.length) ? level[i + 1] : left;
                nextLevel.push(crypto.createHash('sha256').update(left + right).digest('hex'));
            }
            level = nextLevel;
            currentIndex = Math.floor(currentIndex / 2);
        }

        return proof;
    }

    /**
     * Verify a Merkle proof
     */
    static verifyProof(leaf, proof, root) {
        let currentHash = leaf;
        for (const element of proof) {
            const { position, hash } = element;
            const combined = position === 'left'
                ? hash + currentHash
                : currentHash + hash;

            currentHash = crypto.createHash('sha256')
                .update(combined)
                .digest('hex');
        }
        return currentHash === root;
    }
}

module.exports = MerkleMath;
