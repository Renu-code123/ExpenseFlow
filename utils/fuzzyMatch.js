/**
 * Fuzzy Match Utility
 * Issue #910: Levenshtein and Jaro-Winkler logic for merchant name normalization.
 * Used for matching internal transactions against external bank statements.
 */
class FuzzyMatch {
    /**
     * Standard Levenshtein Distance
     */
    static levenshtein(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    /**
     * Normalized Similarity Score (0 to 1)
     */
    static calculateSimilarity(s1, s2) {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;

        if (longer.length === 0) return 1.0;

        const distance = this.levenshtein(longer.toLowerCase(), shorter.toLowerCase());
        return (longer.length - distance) / longer.length;
    }

    /**
     * Pattern matching cleanup for merchant strings (e.g. "Stripe * Service" -> "Stripe")
     */
    static normalizeMerchant(merchant) {
        if (!merchant) return '';
        return merchant
            .split('*')[0]
            .split('#')[0]
            .trim()
            .replace(/[0-9]/g, '')
            .toLowerCase();
    }
}

module.exports = FuzzyMatch;
