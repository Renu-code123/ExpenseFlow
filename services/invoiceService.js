const Invoice = require('../models/Invoice');
const Client = require('../models/Client');
const TimeEntry = require('../models/TimeEntry');
const Expense = require('../models/Expense');
const emailService = require('./emailService');

class InvoiceService {
    /**
     * Create a new invoice
     */
    static async createInvoice(userId, invoiceData) {
        try {
            // Verify client exists
            const client = await Client.findOne({ _id: invoiceData.client, user: userId });
            if (!client) {
                throw new Error('Client not found');
            }
            
            // Generate invoice number if not provided
            if (!invoiceData.invoice_number) {
                invoiceData.invoice_number = await Invoice.generateInvoiceNumber(userId);
            }
            
            // Set due date based on client payment terms if not provided
            if (!invoiceData.due_date && invoiceData.invoice_date) {
                const dueDate = new Date(invoiceData.invoice_date);
                dueDate.setDate(dueDate.getDate() + (client.payment_terms || 30));
                invoiceData.due_date = dueDate;
            }
            
            // Set currency from client if not provided
            if (!invoiceData.currency) {
                invoiceData.currency = client.currency || 'USD';
            }
            
            // Create invoice
            const invoice = new Invoice({
                user: userId,
                ...invoiceData
            });
            
            await invoice.save();
            
            // Update client statistics
            await client.updateFinancials(invoice.total, 0);
            
            return invoice;
        } catch (error) {
            throw new Error(`Failed to create invoice: ${error.message}`);
        }
    }
    
    /**
     * Create invoice from time entries
     */
    static async createInvoiceFromTimeEntries(userId, clientId, timeEntryIds, invoiceData = {}) {
        try {
            const client = await Client.findOne({ _id: clientId, user: userId });
            if (!client) {
                throw new Error('Client not found');
            }
            
            const timeEntries = await TimeEntry.find({
                _id: { $in: timeEntryIds },
                user: userId,
                client: clientId,
                is_billed: false,
                is_billable: true
            });
            
            if (timeEntries.length === 0) {
                throw new Error('No unbilled time entries found');
            }
            
            // Group time entries by project/task
            const items = timeEntries.map(entry => ({
                description: entry.task_description,
                quantity: Math.round((entry.duration / 60) * 100) / 100, // hours
                unit_price: entry.hourly_rate,
                discount: 0,
                tax_rate: invoiceData.default_tax_rate || 0
            }));
            
            // Create invoice
            const invoice = await this.createInvoice(userId, {
                client: clientId,
                items: items,
                time_entries: timeEntryIds,
                project_name: invoiceData.project_name || timeEntries[0].project_name,
                ...invoiceData
            });
            
            // Mark time entries as billed
            await TimeEntry.updateMany(
                { _id: { $in: timeEntryIds } },
                {
                    is_billed: true,
                    invoice: invoice._id,
                    status: 'billed',
                    billed_at: new Date()
                }
            );
            
            return invoice;
        } catch (error) {
            throw new Error(`Failed to create invoice from time entries: ${error.message}`);
        }
    }
    
    /**
     * Create invoice from expenses
     */
    static async createInvoiceFromExpenses(userId, clientId, expenseIds, invoiceData = {}) {
        try {
            const client = await Client.findOne({ _id: clientId, user: userId });
            if (!client) {
                throw new Error('Client not found');
            }
            
            const expenses = await Expense.find({
                _id: { $in: expenseIds },
                user: userId
            });
            
            if (expenses.length === 0) {
                throw new Error('No expenses found');
            }
            
            // Convert expenses to invoice items
            const items = expenses.map(expense => ({
                description: expense.description,
                quantity: 1,
                unit_price: expense.amount,
                discount: 0,
                tax_rate: invoiceData.default_tax_rate || 0
            }));
            
            // Create invoice
            const invoice = await this.createInvoice(userId, {
                client: clientId,
                items: items,
                expenses: expenseIds,
                ...invoiceData
            });
            
            return invoice;
        } catch (error) {
            throw new Error(`Failed to create invoice from expenses: ${error.message}`);
        }
    }
    
    /**
     * Update an existing invoice
     */
    static async updateInvoice(userId, invoiceId, updateData) {
        try {
            const invoice = await Invoice.findOne({ _id: invoiceId, user: userId });
            if (!invoice) {
                throw new Error('Invoice not found');
            }
            
            if (invoice.status === 'paid') {
                throw new Error('Cannot update paid invoice');
            }
            
            // Update invoice
            Object.assign(invoice, updateData);
            await invoice.save();
            
            return invoice;
        } catch (error) {
            throw new Error(`Failed to update invoice: ${error.message}`);
        }
    }
    
    /**
     * Delete an invoice (only drafts)
     */
    static async deleteInvoice(userId, invoiceId) {
        try {
            const invoice = await Invoice.findOne({ _id: invoiceId, user: userId });
            if (!invoice) {
                throw new Error('Invoice not found');
            }
            
            if (invoice.status !== 'draft') {
                throw new Error('Can only delete draft invoices');
            }
            
            // Unlink time entries if any
            if (invoice.time_entries && invoice.time_entries.length > 0) {
                await TimeEntry.updateMany(
                    { _id: { $in: invoice.time_entries } },
                    {
                        is_billed: false,
                        invoice: null,
                        status: 'completed'
                    }
                );
            }
            
            await invoice.deleteOne();
            
            return { message: 'Invoice deleted successfully' };
        } catch (error) {
            throw new Error(`Failed to delete invoice: ${error.message}`);
        }
    }
    
    /**
     * Record a payment for an invoice
     */
    static async recordPayment(userId, invoiceId, paymentData) {
        try {
            const invoice = await Invoice.findOne({ _id: invoiceId, user: userId });
            if (!invoice) {
                throw new Error('Invoice not found');
            }
            
            if (invoice.status === 'cancelled') {
                throw new Error('Cannot record payment for cancelled invoice');
            }
            
            const payment = await invoice.recordPayment(
                paymentData.amount,
                paymentData.payment_method,
                paymentData.transaction_id,
                paymentData.notes
            );
            
            // Update client financials
            const client = await Client.findById(invoice.client);
            if (client) {
                await client.recordPayment(paymentData.amount);
            }
            
            return { invoice, payment };
        } catch (error) {
            throw new Error(`Failed to record payment: ${error.message}`);
        }
    }
    
    /**
     * Apply late fees to overdue invoices
     */
    static async applyLateFees(userId) {
        try {
            const overdueInvoices = await Invoice.getOverdueInvoices(userId);
            
            const updated = [];
            for (const invoice of overdueInvoices) {
                const result = await invoice.applyLateFee();
                if (result.late_fee > 0) {
                    updated.push(result);
                }
            }
            
            return {
                count: updated.length,
                invoices: updated
            };
        } catch (error) {
            throw new Error(`Failed to apply late fees: ${error.message}`);
        }
    }
    
    /**
     * Generate recurring invoices
     */
    static async generateRecurringInvoices() {
        try {
            const recurringInvoices = await Invoice.getRecurringInvoicesToGenerate();
            
            const newInvoices = [];
            
            for (const parentInvoice of recurringInvoices) {
                try {
                    // Check if we should continue generating
                    if (parentInvoice.recurring_config.occurrences_remaining !== undefined) {
                        if (parentInvoice.recurring_config.occurrences_remaining <= 0) {
                            continue;
                        }
                    }
                    
                    if (parentInvoice.recurring_config.end_date) {
                        if (new Date() > parentInvoice.recurring_config.end_date) {
                            continue;
                        }
                    }
                    
                    // Generate new invoice number
                    const newInvoiceNumber = await Invoice.generateInvoiceNumber(parentInvoice.user);
                    
                    // Create new invoice
                    const newInvoice = new Invoice({
                        user: parentInvoice.user,
                        client: parentInvoice.client,
                        invoice_number: newInvoiceNumber,
                        invoice_date: new Date(),
                        due_date: this.calculateNextDueDate(parentInvoice.recurring_config.frequency),
                        items: parentInvoice.items,
                        currency: parentInvoice.currency,
                        subtotal: parentInvoice.subtotal,
                        tax_amount: parentInvoice.tax_amount,
                        tax_rate: parentInvoice.tax_rate,
                        total: parentInvoice.total,
                        amount_due: parentInvoice.total,
                        status: parentInvoice.recurring_config.auto_send ? 'sent' : 'draft',
                        is_recurring: false,
                        project_name: parentInvoice.project_name,
                        terms: parentInvoice.terms,
                        notes: parentInvoice.notes,
                        payment_methods_accepted: parentInvoice.payment_methods_accepted,
                        payment_instructions: parentInvoice.payment_instructions
                    });
                    
                    await newInvoice.save();
                    newInvoices.push(newInvoice);
                    
                    // Update parent invoice's next invoice date
                    parentInvoice.recurring_config.next_invoice_date = this.calculateNextInvoiceDate(
                        parentInvoice.recurring_config.next_invoice_date,
                        parentInvoice.recurring_config.frequency
                    );
                    
                    if (parentInvoice.recurring_config.occurrences_remaining !== undefined) {
                        parentInvoice.recurring_config.occurrences_remaining -= 1;
                    }
                    
                    await parentInvoice.save();
                    
                    // Update client financials
                    const client = await Client.findById(parentInvoice.client);
                    if (client) {
                        await client.updateFinancials(newInvoice.total, 0);
                    }
                    
                    // Auto-send if configured
                    if (parentInvoice.recurring_config.auto_send) {
                        await newInvoice.markAsSent();

                        // Send email notification to client
                        try {
                            const populatedInvoice = await Invoice.findById(newInvoice._id).populate('client user');
                            await emailService.sendInvoiceSentNotification(populatedInvoice, populatedInvoice.user);
                            console.log(`Email notification sent for invoice ${newInvoice.invoice_number}`);
                        } catch (emailError) {
                            console.error(`Failed to send email notification for invoice ${newInvoice.invoice_number}:`, emailError);
                        }
                    }
                } catch (error) {
                    console.error(`Error generating recurring invoice ${parentInvoice.invoice_number}:`, error);
                }
            }
            
            return {
                count: newInvoices.length,
                invoices: newInvoices
            };
        } catch (error) {
            throw new Error(`Failed to generate recurring invoices: ${error.message}`);
        }
    }
    
    /**
     * Calculate next invoice date based on frequency
     */
    static calculateNextInvoiceDate(currentDate, frequency) {
        const nextDate = new Date(currentDate);
        
        switch (frequency) {
            case 'weekly':
                nextDate.setDate(nextDate.getDate() + 7);
                break;
            case 'biweekly':
                nextDate.setDate(nextDate.getDate() + 14);
                break;
            case 'monthly':
                nextDate.setMonth(nextDate.getMonth() + 1);
                break;
            case 'quarterly':
                nextDate.setMonth(nextDate.getMonth() + 3);
                break;
            case 'yearly':
                nextDate.setFullYear(nextDate.getFullYear() + 1);
                break;
        }
        
        return nextDate;
    }
    
    /**
     * Calculate next due date based on frequency
     */
    static calculateNextDueDate(frequency, paymentTerms = 30) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + paymentTerms);
        return dueDate;
    }
    
    /**
     * Get invoice statistics for a user
     */
    static async getInvoiceStatistics(userId, startDate = null, endDate = null) {
        try {
            const stats = await Invoice.getUserStats(userId, startDate, endDate);
            
            // Get additional metrics
            const overdueInvoices = await Invoice.countDocuments({
                user: userId,
                status: { $in: ['sent', 'viewed', 'partially_paid', 'overdue'] },
                due_date: { $lt: new Date() }
            });
            
            const upcomingInvoices = await Invoice.countDocuments({
                user: userId,
                status: { $in: ['sent', 'viewed', 'partially_paid'] },
                due_date: {
                    $gte: new Date(),
                    $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                }
            });
            
            return {
                ...stats,
                overdue_count: overdueInvoices,
                upcoming_count: upcomingInvoices
            };
        } catch (error) {
            throw new Error(`Failed to get invoice statistics: ${error.message}`);
        }
    }
    
    /**
     * Get invoices needing reminders
     */
    static async getInvoicesNeedingReminders() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const overdueInvoices = await Invoice.find({
                status: { $in: ['sent', 'viewed', 'partially_paid', 'overdue'] },
                due_date: { $lt: today }
            }).populate('client user');
            
            const invoicesNeedingReminder = [];
            
            for (const invoice of overdueInvoices) {
                const daysOverdue = invoice.days_overdue;
                
                // Check if we should send reminder (3, 7, 14, 30 days)
                const reminderDays = [3, 7, 14, 30];
                let shouldSend = false;
                let reminderType = 'overdue';
                
                for (const days of reminderDays) {
                    if (daysOverdue === days) {
                        // Check if reminder already sent for this milestone
                        const alreadySent = invoice.reminders_sent.some(
                            r => r.days_overdue === days
                        );
                        
                        if (!alreadySent) {
                            shouldSend = true;
                            break;
                        }
                    }
                }
                
                if (shouldSend) {
                    invoicesNeedingReminder.push({
                        invoice,
                        days_overdue: daysOverdue
                    });
                }
            }
            
            return invoicesNeedingReminder;
        } catch (error) {
            throw new Error(`Failed to get invoices needing reminders: ${error.message}`);
        }
    }
    
    /**
     * Mark reminder as sent
     */
    static async markReminderSent(invoiceId, daysOverdue) {
        try {
            const invoice = await Invoice.findById(invoiceId);
            if (!invoice) {
                throw new Error('Invoice not found');
            }
            
            invoice.reminders_sent.push({
                date: new Date(),
                type: 'overdue',
                days_overdue: daysOverdue
            });
            
            await invoice.save();
            
            return invoice;
        } catch (error) {
            throw new Error(`Failed to mark reminder as sent: ${error.message}`);
        }
    }
}

module.exports = InvoiceService;
