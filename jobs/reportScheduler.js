const cron = require('node-cron');
const ScheduledReport = require('../models/ScheduledReport');
const reportingEngine = require('../services/reportingEngine');
const emailService = require('../services/emailService');

/**
 * Report Scheduler Worker
 * Issue #659: Automates background report generation and multi-channel delivery
 */
class ReportScheduler {
    constructor() {
        this.name = 'ReportScheduler';
    }

    /**
     * Start the recurring scan for due reports
     */
    start() {
        console.log(`[${this.name}] Initializing report automation...`);

        // Run every hour at minute 0
        cron.schedule('0 * * * *', async () => {
            try {
                const now = new Date();
                const dueReports = await ScheduledReport.find({
                    status: 'active',
                    nextRun: { $lte: now }
                });

                console.log(`[${this.name}] Found ${dueReports.length} reports to process.`);

                for (const report of dueReports) {
                    await this._processReport(report);
                }
            } catch (error) {
                console.error(`[${this.name}] Critical error in scheduler:`, error);
            }
        });
    }

    async _processReport(report) {
        try {
            console.log(`[${this.name}] Generating scheduled report: ${report.name} for ${report.userId}`);

            // 1. Generate Content
            const result = await reportingEngine.generateReport(report.userId, {
                templateKey: report.template,
                format: report.format,
                workspaceId: report.filter.workspaceId
            });

            // 2. Deliver (Currently Email only)
            if (report.deliveryChannel === 'email') {
                await emailService.sendMail({
                    to: report.recipients.join(','),
                    subject: `Scheduled Report: ${report.name}`,
                    text: `Your ${report.frequency} report is attached.`,
                    attachments: [
                        {
                            filename: result.fileName,
                            content: result.data
                        }
                    ]
                });
            }

            // 3. Update Schedule
            report.lastRun = new Date();
            report.nextRun = report.calculateNextRun();
            await report.save();

            console.log(`[${this.name}] Successfully delivered report ${report._id}`);
        } catch (error) {
            console.error(`[${this.name}] Failed to process report ${report._id}:`, error);
            report.status = 'failed';
            await report.save();
        }
    }
}

module.exports = new ReportScheduler();
