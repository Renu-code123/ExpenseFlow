const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const jobGuard = require('../middleware/jobGuard');
const jobOrchestrator = require('../services/jobOrchestrator');
const JobState = require('../models/JobState');
const ResponseFactory = require('../utils/ResponseFactory');

/**
 * Background Job Management API
 * Issue #719: Management dashboard endpoints for monitoring and controlling resilient tasks.
 */

/**
 * @route   GET /api/jobs/status
 * @desc    Get status of all background jobs
 */
router.get('/status', auth, jobGuard, async (req, res) => {
    try {
        const jobs = await JobState.find().sort({ jobName: 1 });
        return ResponseFactory.success(res, jobs);
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * @route   POST /api/jobs/:jobName/trigger
 * @desc    Manually trigger a job execution
 */
router.post('/:jobName/trigger', auth, jobGuard, async (req, res) => {
    try {
        const { jobName } = req.params;

        // Non-blocking trigger
        jobOrchestrator.runJob(jobName);

        return ResponseFactory.success(res, null, 202, `Execution of ${jobName} initiated.`);
    } catch (err) {
        return res.status(404).json({ success: false, error: err.message });
    }
});

/**
 * @route   PATCH /api/jobs/:jobName/toggle
 * @desc    Pause or resume a job
 */
router.patch('/:jobName/toggle', auth, jobGuard, async (req, res) => {
    try {
        const { jobName } = req.params;
        const { enabled } = req.body;

        if (enabled) {
            await jobOrchestrator.resume(jobName);
        } else {
            await jobOrchestrator.pause(jobName);
        }

        return ResponseFactory.success(res, { enabled }, 200, `Job ${jobName} updated successfully.`);
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
