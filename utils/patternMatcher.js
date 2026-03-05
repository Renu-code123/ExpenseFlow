/**
 * Logic for regex and fuzzy matching of merchant names and descriptions.
 */

class PatternMatcher {
    /**
     * Check if a pattern matches a given text.
     * @param {string} text - The input text (e.g., merchant name).
     * @param {string} pattern - The pattern to match.
     * @param {boolean} isRegex - Whether the pattern is a regular expression.
     * @returns {boolean}
     */
    static isMatch(text, pattern, isRegex = false) {
        if (!text || !pattern) return false;

        if (isRegex) {
            try {
                const regex = new RegExp(pattern, 'i');
                return regex.test(text);
            } catch (e) {
                console.error('Invalid regex pattern:', pattern);
                return false;
            }
        }

        // Default: case-insensitive keyword match
        return text.toLowerCase().includes(pattern.toLowerCase());
    }

    /**
     * Fuzzy match between two strings using Levenshtein distance.
     * @param {string} s1 
     * @param {string} s2 
     * @param {number} threshold - 0 to 1, where 1 is exact match.
     * @returns {number} - Confidence score.
     */
    static fuzzyMatch(s1, s2) {
        if (!s1 || !s2) return 0;

        s1 = s1.toLowerCase().trim();
        s2 = s2.toLowerCase().trim();

        if (s1 === s2) return 1;

        const len1 = s1.length;
        const len2 = s2.length;
        const maxLen = Math.max(len1, len2);

        if (maxLen === 0) return 1;

        const distance = this.levenshteinDistance(s1, s2);
        return 1 - (distance / maxLen);
    }

    static levenshteinDistance(a, b) {
        const matrix = [];

        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }
}

module.exports = PatternMatcher;
