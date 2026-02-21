/**
 * Retry Strategy Utility
 * Issue #719: Logic for exponential backoff and jitter to prevent thundering herd problems.
 */

class RetryStrategy {
    /**
     * Calculates delay for the next retry attempt
     * @param {number} attempt - Current retry attempt (1-based)
     * @param {number} baseDelayMs - Initial delay in milliseconds
     * @returns {number} Delay in milliseconds
     */
    getExponentialBackoff(attempt, baseDelayMs = 1000) {
        // Exponential backoff: base * 2^(attempt-1)
        const delay = baseDelayMs * Math.pow(2, attempt - 1);

        // Add jitter (randomness) to avoid synchronized retries
        // Adds up to 20% randomness
        const jitter = delay * 0.2 * Math.random();

        return Math.floor(delay + jitter);
    }

    /**
     * Wrapper for executing a function with retries
     */
    async executeWithRetry(fn, options = {}) {
        const {
            maxRetries = 3,
            baseDelay = 1000,
            onRetry = () => { }
        } = options;

        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (err) {
                lastError = err;
                if (attempt === maxRetries) break;

                const delay = this.getExponentialBackoff(attempt, baseDelay);
                onRetry(err, attempt, delay);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }
}

module.exports = new RetryStrategy();
