/**
 * Batch Processor Service
 * Part of Issue #630: Historical Currency Revaluation Engine Overhaul
 * Handles massive retroactive revaluation tasks in controlled batches
 */

const revaluationService = require('./revaluationService');
const User = require('../models/User');

class BatchProcessor {
    constructor() {
        this.activeJobs = new Map();
    }

    /**
     * Start a global revaluation job for a user
     * @param {String} userId 
     * @param {Object} options 
     */
    async startRevaluationJob(userId, options = {}) {
        const jobId = `job_${userId}_${Date.now()}`;

        const jobStatus = {
            jobId,
            userId,
            status: 'running',
            progress: 0,
            startTime: new Date(),
            processedCount: 0,
            totalImpact: 0,
            errors: []
        };

        this.activeJobs.set(jobId, jobStatus);

        // Run in background
        this._runRevaluationTask(jobId, userId, options).catch(err => {
            console.error(`[BatchProcessor] Job ${jobId} failed:`, err);
            const status = this.activeJobs.get(jobId);
            if (status) {
                status.status = 'failed';
                status.errors.push(err.message);
            }
        });

        return jobStatus;
    }

    /**
     * Internal task runner
     */
    async _runRevaluationTask(jobId, userId, options) {
        const status = this.activeJobs.get(jobId);

        try {
            // Step 1: Revalue Transactions
            const txResults = await revaluationService.revalueTransactions(userId, {
                ...options,
                reason: `System-wide historical overhaul: ${options.reason || 'standard cleanup'}`
            });

            status.processedCount = txResults.updated;
            status.totalImpact = txResults.impact;
            status.progress = 50; // Halfway done after transactions

            // Step 2: Rebuild Net Worth Snapshots
            if (options.rebuildSnapshots !== false) {
                const snapshotResults = await revaluationService.rebuildSnapshots(
                    userId,
                    options.baseCurrency || 'USD',
                    options.lookbackDays || 365
                );

                status.snapshotsUpdated = snapshotResults.snapshotsUpdated;
            }

            status.status = 'completed';
            status.progress = 100;
            status.endTime = new Date();

        } catch (error) {
            status.status = 'failed';
            status.errors.push(error.message);
            throw error;
        }
    }

    /**
     * Get status of an active or completed job
     */
    getJobStatus(jobId) {
        return this.activeJobs.get(jobId) || { status: 'not_found' };
    }

    /**
     * List all jobs for a specific user
     */
    getUserJobs(userId) {
        return Array.from(this.activeJobs.values())
            .filter(job => job.userId === userId);
    }

    /**
     * Run revaluation for ALL users (Admin task)
     * USE WITH CAUTION
     */
    async runGlobalOverhaul(options = {}) {
        const users = await User.find({ isActive: true });
        const results = [];

        for (const user of users) {
            const job = await this.startRevaluationJob(user._id, options);
            results.push(job);
        }

        return {
            totalUsers: users.length,
            jobsStarted: results.length,
            batchId: `batch_${Date.now()}`
        };
    }

    /**
     * System cleanup - Remove old job statuses
     */
    cleanupJobs(maxAgeHours = 24) {
        const now = Date.now();
        const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

        for (const [jobId, status] of this.activeJobs.entries()) {
            if (status.status !== 'running' && (now - status.startTime.getTime()) > maxAgeMs) {
                this.activeJobs.delete(jobId);
            }
        }
    }
}

module.exports = new BatchProcessor();
