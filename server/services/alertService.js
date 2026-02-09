
// alertService.js
// Alerting utility for critical errors (e.g., email, Slack, etc.)
// Uses nodemailer to send email alerts to admins.

const nodemailer = require('nodemailer');

// Configure your SMTP transport here
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'admin@example.com',
    pass: process.env.SMTP_PASS || 'yourpassword'
  }
});


// Support multiple admin emails (comma-separated)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || 'admin@example.com')
  .split(',')
  .map(email => email.trim())
  .filter(email => email);

const fs = require('fs');
const path = require('path');
const LOG_FILE = process.env.ALERT_LOG_FILE || path.join(__dirname, '../logs/critical-errors.log');

function logErrorToFile(subject, message) {
  const logEntry = `[${new Date().toISOString()}] ${subject}: ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE, logEntry, { encoding: 'utf8' });
  } catch (err) {
    console.error('[ALERT] Failed to write to log file:', err);
  }
}

module.exports = {
  notifyAdmin: async function (subject, message) {
    // Log error to file for audit
    logErrorToFile(subject, message);
    try {
      await transporter.sendMail({
        from: `ExpenseFlow Alerts <${transporter.options.auth.user}>`,
        to: ADMIN_EMAILS,
        subject: subject,
        text: message
      });
      console.log(`[ALERT] Email sent to admins: ${ADMIN_EMAILS.join(', ')} | Subject: ${subject}`);
    } catch (err) {
      console.error('[ALERT] Failed to send email:', err);
    }
  }
};
