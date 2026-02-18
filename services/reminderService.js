const nodemailer = require('nodemailer');
const Invoice = require('../models/Invoice');
const InvoiceService = require('./invoiceService');
const PDFService = require('./pdfService');

class ReminderService {
    constructor() {
        // Initialize email transporter
        const transporter = nodemailer.createTransporter || nodemailer;
        this.transporter = typeof nodemailer.createTransporter === 'function' 
            ? nodemailer.createTransporter({
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: process.env.SMTP_PORT || 587,
                secure: false,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            })
            : {
                sendMail: async (options) => {
                    console.log('Email would be sent:', options);
                    return { response: 'Email service disabled' };
                }
            };
    }
    
    /**
     * Send payment reminder for overdue invoice
     */
    async sendPaymentReminder(invoiceId) {
        try {
            const invoice = await Invoice.findById(invoiceId)
                .populate('client')
                .populate('user');
            
            if (!invoice) {
                throw new Error('Invoice not found');
            }
            
            // Check if client wants reminders
            if (invoice.client.preferences && invoice.client.preferences.send_payment_reminders === false) {
                console.log(`Skipping reminder for invoice ${invoice.invoice_number} - client opted out`);
                return null;
            }
            
            const daysOverdue = invoice.days_overdue;
            
            // Determine email template based on days overdue
            let subject, body;
            
            if (daysOverdue <= 3) {
                subject = `Payment Reminder: Invoice ${invoice.invoice_number}`;
                body = this.generateEarlyReminderEmail(invoice, daysOverdue);
            } else if (daysOverdue <= 7) {
                subject = `Payment Overdue: Invoice ${invoice.invoice_number}`;
                body = this.generateMidReminderEmail(invoice, daysOverdue);
            } else {
                subject = `Urgent: Payment ${daysOverdue} Days Overdue - Invoice ${invoice.invoice_number}`;
                body = this.generateUrgentReminderEmail(invoice, daysOverdue);
            }
            
            // Send email
            const info = await this.transporter.sendMail({
                from: `"${invoice.user.name}" <${process.env.SMTP_USER}>`,
                to: invoice.client.email,
                subject: subject,
                html: body
            });
            
            // Mark reminder as sent
            await InvoiceService.markReminderSent(invoiceId, daysOverdue);
            
            console.log(`Reminder sent for invoice ${invoice.invoice_number}:`, info.messageId);
            
            return info;
        } catch (error) {
            console.error(`Failed to send reminder for invoice ${invoiceId}:`, error);
            throw error;
        }
    }
    
    /**
     * Generate early reminder email (1-3 days overdue)
     */
    generateEarlyReminderEmail(invoice, daysOverdue) {
        return `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Payment Reminder</h2>
                
                <p>Dear ${invoice.client.name},</p>
                
                <p>This is a friendly reminder that payment for invoice <strong>${invoice.invoice_number}</strong> 
                was due ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} ago on 
                <strong>${this.formatDate(invoice.due_date)}</strong>.</p>
                
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">Invoice Details</h3>
                    <p><strong>Invoice Number:</strong> ${invoice.invoice_number}</p>
                    <p><strong>Invoice Date:</strong> ${this.formatDate(invoice.invoice_date)}</p>
                    <p><strong>Due Date:</strong> ${this.formatDate(invoice.due_date)}</p>
                    <p><strong>Amount Due:</strong> ${this.formatCurrency(invoice.amount_due, invoice.currency)}</p>
                </div>
                
                <p>If you have already sent payment, please disregard this email. Otherwise, please submit payment at your earliest convenience.</p>
                
                ${invoice.payment_instructions ? `
                    <div style="margin: 20px 0;">
                        <h4>Payment Instructions:</h4>
                        <p>${invoice.payment_instructions}</p>
                    </div>
                ` : ''}
                
                <p>If you have any questions or concerns, please don't hesitate to contact us.</p>
                
                <p>Thank you for your business!</p>
                
                <p>Best regards,<br>
                ${invoice.user.name}</p>
            </div>
        `;
    }
    
    /**
     * Generate mid-level reminder email (4-7 days overdue)
     */
    generateMidReminderEmail(invoice, daysOverdue) {
        return `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #ff9900;">Payment Overdue Notice</h2>
                
                <p>Dear ${invoice.client.name},</p>
                
                <p>We wanted to bring to your attention that payment for invoice <strong>${invoice.invoice_number}</strong> 
                is now <strong style="color: #ff9900;">${daysOverdue} days overdue</strong>.</p>
                
                <div style="background-color: #fff3cd; border-left: 4px solid #ff9900; padding: 20px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #ff9900;">Outstanding Invoice</h3>
                    <p><strong>Invoice Number:</strong> ${invoice.invoice_number}</p>
                    <p><strong>Original Due Date:</strong> ${this.formatDate(invoice.due_date)}</p>
                    <p><strong>Days Overdue:</strong> ${daysOverdue}</p>
                    <p><strong>Amount Due:</strong> <span style="font-size: 1.2em; color: #ff9900;">${this.formatCurrency(invoice.amount_due, invoice.currency)}</span></p>
                </div>
                
                <p>Please arrange payment as soon as possible to avoid any late fees or service interruptions.</p>
                
                ${invoice.late_fee > 0 ? `
                    <p style="color: #ff0000;"><strong>Note:</strong> A late fee of ${this.formatCurrency(invoice.late_fee, invoice.currency)} has been applied to this invoice.</p>
                ` : ''}
                
                ${invoice.payment_instructions ? `
                    <div style="margin: 20px 0;">
                        <h4>Payment Instructions:</h4>
                        <p>${invoice.payment_instructions}</p>
                    </div>
                ` : ''}
                
                <p>If you have any questions or need to discuss payment arrangements, please contact us immediately.</p>
                
                <p>We appreciate your prompt attention to this matter.</p>
                
                <p>Best regards,<br>
                ${invoice.user.name}</p>
            </div>
        `;
    }
    
    /**
     * Generate urgent reminder email (8+ days overdue)
     */
    generateUrgentReminderEmail(invoice, daysOverdue) {
        return `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #ff0000;">URGENT: Payment Seriously Overdue</h2>
                
                <p>Dear ${invoice.client.name},</p>
                
                <p><strong style="color: #ff0000;">This is an urgent notice</strong> that payment for invoice 
                <strong>${invoice.invoice_number}</strong> is now <strong style="color: #ff0000; font-size: 1.2em;">${daysOverdue} days overdue</strong>.</p>
                
                <div style="background-color: #f8d7da; border: 2px solid #ff0000; padding: 20px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #ff0000;">Seriously Overdue Invoice</h3>
                    <p><strong>Invoice Number:</strong> ${invoice.invoice_number}</p>
                    <p><strong>Original Due Date:</strong> ${this.formatDate(invoice.due_date)}</p>
                    <p><strong>Days Overdue:</strong> <span style="font-size: 1.2em;">${daysOverdue}</span></p>
                    <p><strong>Amount Due:</strong> <span style="font-size: 1.5em; color: #ff0000;">${this.formatCurrency(invoice.amount_due, invoice.currency)}</span></p>
                </div>
                
                <p><strong>Immediate payment is required.</strong> Failure to settle this invoice may result in:</p>
                <ul>
                    <li>Additional late fees</li>
                    <li>Suspension of services</li>
                    <li>Collection proceedings</li>
                </ul>
                
                ${invoice.late_fee > 0 ? `
                    <p style="color: #ff0000;"><strong>Late Fee Applied:</strong> ${this.formatCurrency(invoice.late_fee, invoice.currency)}</p>
                ` : ''}
                
                ${invoice.payment_instructions ? `
                    <div style="background-color: #e9ecef; padding: 15px; margin: 20px 0; border-radius: 5px;">
                        <h4 style="margin-top: 0;">Payment Instructions:</h4>
                        <p>${invoice.payment_instructions}</p>
                    </div>
                ` : ''}
                
                <p><strong>If you are experiencing financial difficulties, please contact us immediately to discuss payment arrangements.</strong></p>
                
                <p>We expect to hear from you within 48 hours.</p>
                
                <p>Sincerely,<br>
                ${invoice.user.name}</p>
            </div>
        `;
    }
    
    /**
     * Send invoice via email
     */
    async sendInvoiceEmail(invoiceId) {
        try {
            const invoice = await Invoice.findById(invoiceId)
                .populate('client')
                .populate('user');
            
            if (!invoice) {
                throw new Error('Invoice not found');
            }
            
            // Generate PDF if not already generated
            if (!invoice.pdf_url) {
                await PDFService.generateInvoicePDF(invoiceId, invoice.user._id);
                await invoice.reload();
            }
            
            const subject = `New Invoice ${invoice.invoice_number} from ${invoice.user.name}`;
            const body = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">New Invoice</h2>
                    
                    <p>Dear ${invoice.client.name},</p>
                    
                    <p>Please find attached invoice <strong>${invoice.invoice_number}</strong> for your review.</p>
                    
                    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">Invoice Summary</h3>
                        <p><strong>Invoice Number:</strong> ${invoice.invoice_number}</p>
                        <p><strong>Invoice Date:</strong> ${this.formatDate(invoice.invoice_date)}</p>
                        <p><strong>Due Date:</strong> ${this.formatDate(invoice.due_date)}</p>
                        <p><strong>Total Amount:</strong> ${this.formatCurrency(invoice.total, invoice.currency)}</p>
                    </div>
                    
                    ${invoice.payment_instructions ? `
                        <div style="margin: 20px 0;">
                            <h4>Payment Instructions:</h4>
                            <p>${invoice.payment_instructions}</p>
                        </div>
                    ` : ''}
                    
                    <p>Payment is due by ${this.formatDate(invoice.due_date)}.</p>
                    
                    <p>Thank you for your business!</p>
                    
                    <p>Best regards,<br>
                    ${invoice.user.name}</p>
                </div>
            `;
            
            const info = await this.transporter.sendMail({
                from: `"${invoice.user.name}" <${process.env.SMTP_USER}>`,
                to: invoice.client.email,
                subject: subject,
                html: body,
                attachments: invoice.pdf_url ? [{
                    filename: `invoice-${invoice.invoice_number}.pdf`,
                    path: invoice.pdf_url
                }] : []
            });
            
            // Mark as sent
            await invoice.markAsSent();
            
            console.log(`Invoice ${invoice.invoice_number} sent:`, info.messageId);
            
            return info;
        } catch (error) {
            console.error(`Failed to send invoice ${invoiceId}:`, error);
            throw error;
        }
    }
    
    /**
     * Process all pending reminders
     */
    async processAllReminders() {
        try {
            const invoices = await InvoiceService.getInvoicesNeedingReminders();
            
            const results = {
                success: [],
                failed: []
            };
            
            for (const { invoice, days_overdue } of invoices) {
                try {
                    await this.sendPaymentReminder(invoice._id);
                    results.success.push({
                        invoice_number: invoice.invoice_number,
                        days_overdue: days_overdue
                    });
                } catch (error) {
                    results.failed.push({
                        invoice_number: invoice.invoice_number,
                        error: error.message
                    });
                }
            }
            
            return results;
        } catch (error) {
            throw new Error(`Failed to process reminders: ${error.message}`);
        }
    }
    
    /**
     * Helper: Format date
     */
    formatDate(date) {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    
    /**
     * Helper: Format currency
     */
    formatCurrency(amount, currency = 'USD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    }
}

module.exports = new ReminderService();
