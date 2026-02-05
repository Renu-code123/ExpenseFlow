const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const User = require('../models/User');
const reportService = require('./reportService');
const FinancialReport = require('../models/FinancialReport');

class PDFService {
    /**
     * Generate PDF for an existing report
     */
    static async generatePDFForReport(reportId, userId) {
        const report = await FinancialReport.findOne({
            _id: reportId,
            user: userId,
            status: 'ready'
        });

        if (!report) {
            throw new Error('Report not found or not ready');
        }

        // Use the reportService's PDF generation
        return reportService.generatePDF(userId, {
            startDate: report.dateRange.startDate,
            endDate: report.dateRange.endDate,
            currency: report.currency,
            includeCharts: true
        });
    }

    /**
     * Generate invoice PDF
     */
    static async generateInvoicePDF(invoiceId, userId) {
        try {
            const invoice = await Invoice.findOne({ _id: invoiceId, user: userId })
                .populate('client')
                .populate('user')
                .populate('time_entries')
                .populate('expenses');

            if (!invoice) {
                throw new Error('Invoice not found');
            }

            // Ensure uploads/invoices directory exists
            const invoicesDir = path.join(__dirname, '..', 'uploads', 'invoices');
            if (!fs.existsSync(invoicesDir)) {
                fs.mkdirSync(invoicesDir, { recursive: true });
            }

            const filename = `invoice-${invoice.invoice_number}.pdf`;
            const filepath = path.join(invoicesDir, filename);

            // Create PDF document
            const doc = new PDFDocument({
                size: 'A4',
                margin: 50
            });

            // Pipe to file
            const stream = fs.createWriteStream(filepath);
            doc.pipe(stream);

            // Generate PDF content
            await this.generateInvoiceContent(doc, invoice);

            // Finalize PDF
            doc.end();

            // Wait for stream to finish
            await new Promise((resolve, reject) => {
                stream.on('finish', resolve);
                stream.on('error', reject);
            });

            // Update invoice with PDF URL
            invoice.pdf_url = filepath;
            invoice.pdf_generated_at = new Date();
            await invoice.save();

            return {
                pdfPath: filepath,
                filename: filename
            };
        } catch (error) {
            throw new Error(`Failed to generate invoice PDF: ${error.message}`);
        }
    }

    /**
     * Generate receipt PDF
     */
    static async generateReceiptPDF(paymentId, userId) {
        try {
            const payment = await Payment.findOne({ _id: paymentId, user: userId })
                .populate('client')
                .populate('user')
                .populate('invoice');

            if (!payment) {
                throw new Error('Payment not found');
            }

            // Ensure uploads/receipts directory exists
            const receiptsDir = path.join(__dirname, '..', 'uploads', 'receipts');
            if (!fs.existsSync(receiptsDir)) {
                fs.mkdirSync(receiptsDir, { recursive: true });
            }

            const filename = `receipt-${payment.receipt_number || payment._id}.pdf`;
            const filepath = path.join(receiptsDir, filename);

            // Create PDF document
            const doc = new PDFDocument({
                size: 'A4',
                margin: 50
            });

            // Pipe to file
            const stream = fs.createWriteStream(filepath);
            doc.pipe(stream);

            // Generate PDF content
            await this.generateReceiptContent(doc, payment);

            // Finalize PDF
            doc.end();

            // Wait for stream to finish
            await new Promise((resolve, reject) => {
                stream.on('finish', resolve);
                stream.on('error', reject);
            });

            // Update payment with receipt URL
            payment.receipt_url = filepath;
            payment.receipt_sent_at = new Date();
            await payment.save();

            return {
                pdfPath: filepath,
                filename: filename
            };
        } catch (error) {
            throw new Error(`Failed to generate receipt PDF: ${error.message}`);
        }
    }

    /**
     * Generate invoice PDF content
     */
    static async generateInvoiceContent(doc, invoice) {
        const { user, client, invoice_number, invoice_date, due_date, items, subtotal, tax_amount, discount_amount, late_fee, total, currency, notes, payment_instructions } = invoice;

        // Header
        doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
        doc.moveDown(2);

        // Company and client info
        doc.fontSize(12).font('Helvetica-Bold');

        // Left side - From
        doc.text('FROM:', 50, doc.y);
        doc.font('Helvetica');
        doc.text(user.name || 'Your Company', 50, doc.y + 15);
        if (user.email) doc.text(user.email, 50, doc.y + 15);

        // Right side - To
        const rightX = 300;
        doc.font('Helvetica-Bold').text('TO:', rightX, doc.y - 30);
        doc.font('Helvetica');
        doc.text(client.name, rightX, doc.y - 15);
        if (client.company_name) doc.text(client.company_name, rightX, doc.y);
        if (client.email) doc.text(client.email, rightX, doc.y + 15);
        if (client.phone) doc.text(client.phone, rightX, doc.y + 30);

        doc.moveDown(4);

        // Invoice details
        doc.font('Helvetica-Bold');
        doc.text(`Invoice Number: ${invoice_number}`, 50);
        doc.text(`Invoice Date: ${this.formatDate(invoice_date)}`, 50, doc.y + 15);
        doc.text(`Due Date: ${this.formatDate(due_date)}`, 50, doc.y + 30);

        doc.moveDown(3);

        // Items table
        const tableTop = doc.y;
        const itemX = 50;
        const qtyX = 300;
        const priceX = 350;
        const amountX = 450;

        // Table headers
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Description', itemX, tableTop);
        doc.text('Qty', qtyX, tableTop);
        doc.text('Price', priceX, tableTop);
        doc.text('Amount', amountX, tableTop);

        // Table line
        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        // Items
        let y = tableTop + 25;
        doc.font('Helvetica');

        items.forEach(item => {
            doc.text(item.description, itemX, y, { width: 240 });
            doc.text(item.quantity.toString(), qtyX, y);
            doc.text(this.formatCurrency(item.unit_price, currency), priceX, y);
            doc.text(this.formatCurrency(item.amount, currency), amountX, y);
            y += 20;
        });

        doc.moveDown(2);

        // Totals
        const totalsX = 350;
        doc.font('Helvetica-Bold');
        doc.text('Subtotal:', totalsX, doc.y);
        doc.text(this.formatCurrency(subtotal, currency), amountX, doc.y);

        if (tax_amount > 0) {
            doc.text('Tax:', totalsX, doc.y + 15);
            doc.text(this.formatCurrency(tax_amount, currency), amountX, doc.y + 15);
        }

        if (discount_amount > 0) {
            doc.text('Discount:', totalsX, doc.y + 30);
            doc.text(`-${this.formatCurrency(discount_amount, currency)}`, amountX, doc.y + 30);
        }

        if (late_fee > 0) {
            doc.text('Late Fee:', totalsX, doc.y + 45);
            doc.text(this.formatCurrency(late_fee, currency), amountX, doc.y + 45);
        }

        // Total line
        doc.moveTo(totalsX, doc.y + 60).lineTo(550, doc.y + 60).stroke();
        doc.fontSize(14).text('TOTAL:', totalsX, doc.y + 70);
        doc.text(this.formatCurrency(total, currency), amountX, doc.y + 70);

        doc.moveDown(3);

        // Notes and payment instructions
        if (notes) {
            doc.fontSize(10).font('Helvetica-Bold').text('Notes:', 50);
            doc.font('Helvetica').text(notes, 50, doc.y + 15, { width: 500 });
            doc.moveDown(2);
        }

        if (payment_instructions) {
            doc.font('Helvetica-Bold').text('Payment Instructions:', 50);
            doc.font('Helvetica').text(payment_instructions, 50, doc.y + 15, { width: 500 });
        }
    }

    /**
     * Generate receipt PDF content
     */
    static async generateReceiptContent(doc, payment) {
        const { user, client, invoice, amount, currency, payment_method, transaction_id, payment_date, notes } = payment;

        // Header
        doc.fontSize(24).font('Helvetica-Bold').text('PAYMENT RECEIPT', { align: 'center' });
        doc.moveDown(2);

        // Receipt details
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text(`Receipt Number: ${payment.receipt_number || payment._id}`, 50);
        doc.text(`Payment Date: ${this.formatDate(payment_date)}`, 50, doc.y + 15);
        if (transaction_id) {
            doc.text(`Transaction ID: ${transaction_id}`, 50, doc.y + 30);
        }

        doc.moveDown(2);

        // Company and client info
        doc.font('Helvetica-Bold');

        // Left side - From
        doc.text('FROM:', 50, doc.y);
        doc.font('Helvetica');
        doc.text(user.name || 'Your Company', 50, doc.y + 15);

        // Right side - To
        const rightX = 300;
        doc.font('Helvetica-Bold').text('TO:', rightX, doc.y - 30);
        doc.font('Helvetica');
        doc.text(client.name, rightX, doc.y - 15);
        if (client.company_name) doc.text(client.company_name, rightX, doc.y);

        doc.moveDown(3);

        // Payment details
        doc.font('Helvetica-Bold').text('Payment Details:', 50);
        doc.moveDown(0.5);

        doc.font('Helvetica');
        doc.text(`Amount Paid: ${this.formatCurrency(amount, currency)}`, 70);
        doc.text(`Payment Method: ${this.formatPaymentMethod(payment_method)}`, 70, doc.y + 15);
        if (invoice) {
            doc.text(`Invoice Number: ${invoice.invoice_number}`, 70, doc.y + 30);
        }

        doc.moveDown(2);

        // Thank you message
        doc.font('Helvetica-Bold').text('Thank you for your payment!', { align: 'center' });

        if (notes) {
            doc.moveDown(2);
            doc.font('Helvetica').text(`Notes: ${notes}`, 50, { width: 500 });
        }
    }

    /**
     * Format date
     */
    static formatDate(date) {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    /**
     * Format currency
     */
    static formatCurrency(amount, currency = 'USD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    }

    /**
     * Format payment method
     */
    static formatPaymentMethod(method) {
        const methods = {
            'bank_transfer': 'Bank Transfer',
            'paypal': 'PayPal',
            'stripe': 'Stripe',
            'cash': 'Cash',
            'check': 'Check',
            'credit_card': 'Credit Card',
            'debit_card': 'Debit Card',
            'other': 'Other'
        };
        return methods[method] || method;
    }
}

module.exports = PDFService;
