const cron = require('node-cron');
const JobState = require('../models/JobState');
const retryStrategy = require('../utils/retryStrategy');
const logger = require('../utils/structuredLogger');

/**
 * Job Orchestrator Service
 * Issue #719: Manages resilient execution of background tasks with state persistence.
 */
class JobOrchestrator {
    constructor() {
        this.jobs = new Map(); // Store job definitions
        this.schedules = new Map(); // Store active cron schedules
    }

    /**
     * Register a new background job
     * @param {string} name - Unique job identifier
     * @param {string} cronExpression - When to run the job
     * @param {Function} handler - The async task to perform
     * @param {Object} options - Configuration for retries etc.
     */
    register(name, cronExpression, handler, options = {}) {
        this.jobs.set(name, {
            handler,
            cronExpression,
            options: {
                retryLimit: options.retryLimit || 3,
                baseDelay: options.baseDelay || 2000,
                ...options
            }
        });

        logger.info(`[JobOrchestrator] Registered job: ${name}`, { schedule: cronExpression });
    }

    /**
     * Start the orchestrator and initialize schedules
     */
    async start() {
        for (const [name, definition] of this.jobs) {
            // 1. Initialize State in DB if missing
            await this._initJobState(name, definition.cronExpression, definition.options);

            // 2. Schedule the job
            const task = cron.schedule(definition.cronExpression, () => {
                this.runJob(name);
            });

            this.schedules.set(name, task);
        }
        logger.info('[JobOrchestrator] All background tasks scheduled');
    }

    /**
     * Executes a job manually or via schedule
     */
    async runJob(name) {
        const job = this.jobs.get(name);
        if (!job) throw new Error(`Job ${name} not registered`);

        const state = await JobState.findOne({ jobName: name });
        if (!state || !state.config.enabled) {
            logger.debug(`[JobOrchestrator] Skipping ${name}: job disabled or missing state`);
            return;
        }

        if (state.status === 'running') {
            logger.warn(`[JobOrchestrator] Overlap detected for ${name}. Skipping execution.`);
            return;
        }

        const start = Date.now();
        await this._updateState(name, { status: 'running', lastRunAt: new Date(), executionCount: state.executionCount + 1 });

        try {
            await retryStrategy.executeWithRetry(
                () => job.handler(),
                {
                    maxRetries: job.options.retryLimit,
                    baseDelay: job.options.baseDelay,
                    onRetry: (err, attempt) => {
                        logger.warn(`[JobOrchestrator] Retry attempt ${attempt} for ${name}`, { error: err.message });
                    }
                }
            );

            const duration = Date.now() - start;
            const newAvg = state.averageDurationMs === 0 ? duration : (state.averageDurationMs + duration) / 2;

            await this._updateState(name, {
                status: 'completed',
                lastCompletedAt: new Date(),
                averageDurationMs: Math.round(newAvg),
                $push: { history: { $each: [{ status: 'success', durationMs: duration }], $slice: -10 } }
            });

            logger.info(`[JobOrchestrator] Completed ${name}`, { durationMs: duration });

        } catch (err) {
            const duration = Date.now() - start;
            logger.error(`[JobOrchestrator] Critical failure in ${name}`, { error: err.message });

            await this._updateState(name, {
                status: 'failed',
                failureCount: state.failureCount + 1,
                lastError: { message: err.message, stack: err.stack, timestamp: new Date() },
                $push: { history: { $each: [{ status: 'failed', durationMs: duration, errorMessage: err.message }], $slice: -10 } }
            });
        } finally {
            // Reset to idle for next run regardless of success/fail
            await JobState.updateOne({ jobName: name }, { status: 'idle' });
        }
    }

    /**
     * Pause a job execution
     */
    async pause(name) {
        await JobState.updateOne({ jobName: name }, { 'config.enabled': false });
        logger.info(`[JobOrchestrator] Paused job: ${name}`);
    }

    /**
     * Resume a job execution
     */
    async resume(name) {
        await JobState.updateOne({ jobName: name }, { 'config.enabled': true });
        logger.info(`[JobOrchestrator] Resumed job: ${name}`);
    }

    async _initJobState(jobName, interval, options) {
        await JobState.findOneAndUpdate(
            { jobName },
            {
                $setOnInsert: {
                    status: 'idle',
                    'config.interval': interval,
                    'config.retryLimit': options.retryLimit
                }
            },
            { upsert: true }
        );
    }

    async _updateState(jobName, updates) {
        return JobState.updateOne({ jobName }, updates);
    }
}

module.exports = new JobOrchestrator();
