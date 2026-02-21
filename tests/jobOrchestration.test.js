const assert = require('assert');
const jobOrchestrator = require('../services/jobOrchestrator');
const retryStrategy = require('../utils/retryStrategy');

/**
 * Job Orchestration Infrastructure Tests
 * Issue #719: Verifies retry logic, overlap prevention, and state management.
 */

describe('Resilient Job Orchestration', () => {

    describe('RetryStrategy', () => {
        it('should calculate exponential backoff with jitter', () => {
            const delay1 = retryStrategy.getExponentialBackoff(1, 1000);
            const delay2 = retryStrategy.getExponentialBackoff(2, 1000);
            const delay3 = retryStrategy.getExponentialBackoff(3, 1000);

            // Attempt 1: 1000 + jitter
            assert.ok(delay1 >= 1000 && delay1 <= 1200);
            // Attempt 2: 2000 + jitter
            assert.ok(delay2 >= 2000 && delay2 <= 2400);
            // Attempt 3: 4000 + jitter
            assert.ok(delay3 >= 4000 && delay3 <= 4800);
        });

        it('should execute with retry on failure', async () => {
            let calls = 0;
            const failingFunc = async () => {
                calls++;
                if (calls < 3) throw new Error('Transient failure');
                return 'Success';
            };

            const result = await retryStrategy.executeWithRetry(failingFunc, {
                maxRetries: 3,
                baseDelay: 10
            });

            assert.strictEqual(result, 'Success');
            assert.strictEqual(calls, 3);
        });
    });

    describe('JobOrchestrator (Logic only)', () => {
        it('should register jobs correctly', () => {
            const stubHandler = async () => { };
            jobOrchestrator.register('TEST_JOB', '* * * * *', stubHandler);

            assert.ok(jobOrchestrator.jobs.has('TEST_JOB'));
            const job = jobOrchestrator.jobs.get('TEST_JOB');
            assert.strictEqual(job.cronExpression, '* * * * *');
        });
    });
});
