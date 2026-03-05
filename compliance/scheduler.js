// Compliance Report Scheduler
// Schedules automated report generation and submission
const reportGenerator = require('./reportGenerator');
const submissionService = require('./submissionService');

module.exports = {
  async scheduleGDPRReport(userId, startDate, endDate, submissionMethod, destination) {
    const report = await reportGenerator.generateGDPRReport(userId, startDate, endDate);
    return submissionService[`submitReportVia${submissionMethod}`](report._id, destination);
  },
  async schedulePCIDSSReport(startDate, endDate, submissionMethod, destination) {
    const report = await reportGenerator.generatePCIDSSReport(startDate, endDate);
    return submissionService[`submitReportVia${submissionMethod}`](report._id, destination);
  },
  async scheduleSOXReport(startDate, endDate, submissionMethod, destination) {
    const report = await reportGenerator.generateSOXReport(startDate, endDate);
    return submissionService[`submitReportVia${submissionMethod}`](report._id, destination);
  }
};
