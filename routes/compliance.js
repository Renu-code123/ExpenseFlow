// Compliance Reporting API Routes
const express = require('express');
const router = express.Router();
const reportGenerator = require('../compliance/reportGenerator');
const scheduler = require('../compliance/scheduler');
const submissionService = require('../compliance/submissionService');
const rateLimiter = require('../adaptive/rate-limiter');
const dlpMiddleware = require('../dlp/dlp-middleware');

function rateLimitMiddleware(req, res, next) {
  const userId = req.body.userId || req.ip;
  const endpoint = req.path;
  // Assume status is success for initial request, can be extended for error handling
  rateLimiter.recordRequest(userId, endpoint, 'success');
  if (!rateLimiter.isAllowed(userId)) {
    return res.status(429).json({ success: false, error: 'Rate limit exceeded', limit: rateLimiter.getUserLimit(userId), riskScore: rateLimiter.getUserRiskScore(userId) });
  }
  next();
}

// Apply rate limiting to all compliance routes
router.use(rateLimitMiddleware);

// Apply DLP middleware to all compliance routes
router.use(dlpMiddleware);

// Generate GDPR report
router.post('/gdpr', async (req, res) => {
  const { userId, startDate, endDate } = req.body;
  const report = await reportGenerator.generateGDPRReport(userId, startDate, endDate);
  res.json({ success: true, report });
});

// Generate PCI DSS report
router.post('/pci-dss', async (req, res) => {
  const { startDate, endDate } = req.body;
  const report = await reportGenerator.generatePCIDSSReport(startDate, endDate);
  res.json({ success: true, report });
});

// Generate SOX report
router.post('/sox', async (req, res) => {
  const { startDate, endDate } = req.body;
  const report = await reportGenerator.generateSOXReport(startDate, endDate);
  res.json({ success: true, report });
});

// Schedule report generation and submission
router.post('/schedule', async (req, res) => {
  const { type, userId, startDate, endDate, submissionMethod, destination } = req.body;
  let result;
  if (type === 'GDPR') {
    result = await scheduler.scheduleGDPRReport(userId, startDate, endDate, submissionMethod, destination);
  } else if (type === 'PCI DSS') {
    result = await scheduler.schedulePCIDSSReport(startDate, endDate, submissionMethod, destination);
  } else if (type === 'SOX') {
    result = await scheduler.scheduleSOXReport(startDate, endDate, submissionMethod, destination);
  }
  res.json({ success: true, result });
});

// Export report to file
router.post('/export', async (req, res) => {
  const { reportId, filePath } = req.body;
  const result = await submissionService.exportReportToFile(reportId, filePath);
  res.json({ success: true, result });
});

module.exports = router;
