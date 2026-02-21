const fs = require('fs');
const path = require('path');
const logger = require('../utils/structuredLogger');
const jobOrchestrator = require('../services/jobOrchestrator');

/**
 * Log Rotator Job
 * Issue #713 & #719: Refactored for Resilient Orchestration.
 */
class LogRotator {
    constructor() {
        this.logDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * Now hooks into the resilient orchestrator
     */
    start() {
        jobOrchestrator.register(
            'LOG_ROTATION',
            '0 0 * * *', // Nightly at midnight
            this.rotate.bind(this),
            { retryLimit: 2, baseDelay: 5000 }
        );
    }

    async rotate() {
        logger.info('[LogRotator] Sequence started...');

        const files = fs.readdirSync(this.logDir);
        const timestamp = new Date().toISOString().replace(/:/g, '-');

        for (const file of files) {
            if (file.endsWith('.log') && !file.includes('_archive_')) {
                const oldPath = path.join(this.logDir, file);
                const newPath = path.join(this.logDir, `${file.replace('.log', '')}_archive_${timestamp}.log`);

                try {
                    fs.renameSync(oldPath, newPath);
                } catch (err) {
                    // It's possible the file is locked by the logger itself
                    logger.warn(`Could not rotate busy log file: ${file}`);
                }
            }
        }

        this.cleanupArchives();
        return Promise.resolve();
    }

    cleanupArchives() {
        const files = fs.readdirSync(this.logDir);
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

        for (const file of files) {
            if (file.includes('_archive_')) {
                const filePath = path.join(this.logDir, file);
                const stats = fs.statSync(filePath);

                if (stats.mtimeMs < sevenDaysAgo) {
                    fs.unlinkSync(filePath);
                }
            }
        }
    }
}

module.exports = new LogRotator();
