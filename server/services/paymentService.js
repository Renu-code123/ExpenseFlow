const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const Client = require('../models/Client');

class PaymentService {
    /**
     * Create a new payment record
     */
    static async createPayment(userId, paymentData) {
        try {
            // Verify invoice exists
            const invoice = await Invoice.findOne({ _id: paymentData.invoice, user: userId });
            if (!invoice) {
                throw new Error('Invoice not found');
            }
            
            if (invoice.status === 'cancelled') {
                throw new Error('Cannot record payment for cancelled invoice');
            }
            
            // Verify payment amount doesn't exceed amount due
            if (paymentData.amount > invoice.amount_due) {
                throw new Error('Payment amount exceeds amount due');
            }
            
            // Create payment
            const payment = new Payment({
                user: userId,
                client: invoice.client,
                ...paymentData
            });
            
            await payment.save();
            
            // Update invoice
            invoice.amount_paid += paymentData.amount;
            invoice.amount_due -= paymentData.amount;
            
            if (invoice.amount_paid >= invoice.total) {
                invoice.status = 'paid';
                invoice.paid_date = new Date();
            } else if (invoice.amount_paid > 0) {
                invoice.status = 'partially_paid';
            }
            
            await invoice.save();
            
            // Update client
            const client = await Client.findById(invoice.client);
            if (client) {
                await client.recordPayment(paymentData.amount);
            }
            
            return payment;
        } catch (error) {
            throw new Error(`Failed to create payment: ${error.message}`);
        }
    }
    
    /**
     * Get payment by ID
     */
    static async getPayment(userId, paymentId) {
        try {
            const payment = await Payment.findOne({ _id: paymentId, user: userId })
                .populate('client', 'name company_name email')
                .populate('invoice', 'invoice_number total amount_paid');
            
            if (!payment) {
                throw new Error('Payment not found');
            }
            
            return payment;
        } catch (error) {
            throw new Error(`Failed to get payment: ${error.message}`);
        }
    }
    
    /**
     * Get all payments for a user with optional filters
     */
    static async getPayments(userId, filters = {}, page = 1, limit = 50) {
        try {
            const skip = (page - 1) * limit;
            
            const payments = await Payment.getUserPayments(userId, filters)
                .skip(skip)
                .limit(limit);
            
            const total = await Payment.countDocuments({
                user: userId,
                ...this.buildQueryFilters(filters)
            });
            
            return {
                payments,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            throw new Error(`Failed to get payments: ${error.message}`);
        }
    }
    
    /**
     * Build query filters
     */
    static buildQueryFilters(filters) {
        const query = {};
        
        if (filters.client) {
            query.client = filters.client;
        }
        
        if (filters.invoice) {
            query.invoice = filters.invoice;
        }
        
        if (filters.status) {
            query.status = filters.status;
        }
        
        if (filters.payment_method) {
            query.payment_method = filters.payment_method;
        }
        
        if (filters.start_date && filters.end_date) {
            query.payment_date = {
                $gte: new Date(filters.start_date),
                $lte: new Date(filters.end_date)
            };
        }
        
        return query;
    }
    
    /**
     * Update payment
     */
    static async updatePayment(userId, paymentId, updateData) {
        try {
            const payment = await Payment.findOne({ _id: paymentId, user: userId });
            if (!payment) {
                throw new Error('Payment not found');
            }
            
            if (payment.status === 'refunded') {
                throw new Error('Cannot update refunded payment');
            }
            
            // Don't allow changing amount for completed payments
            if (payment.status === 'completed' && updateData.amount && updateData.amount !== payment.amount) {
                throw new Error('Cannot change amount of completed payment');
            }
            
            Object.assign(payment, updateData);
            await payment.save();
            
            return payment;
        } catch (error) {
            throw new Error(`Failed to update payment: ${error.message}`);
        }
    }
    
    /**
     * Process refund
     */
    static async processRefund(userId, paymentId, refundAmount, reason) {
        try {
            const payment = await Payment.findOne({ _id: paymentId, user: userId });
            if (!payment) {
                throw new Error('Payment not found');
            }
            
            await payment.processRefund(refundAmount, reason);
            
            return payment;
        } catch (error) {
            throw new Error(`Failed to process refund: ${error.message}`);
        }
    }
    
    /**
     * Mark payment as reconciled
     */
    static async reconcilePayment(userId, paymentId) {
        try {
            const payment = await Payment.findOne({ _id: paymentId, user: userId });
            if (!payment) {
                throw new Error('Payment not found');
            }
            
            await payment.markAsReconciled();
            
            return payment;
        } catch (error) {
            throw new Error(`Failed to reconcile payment: ${error.message}`);
        }
    }
    
    /**
     * Reconcile multiple payments
     */
    static async reconcilePayments(userId, paymentIds) {
        try {
            const payments = await Payment.find({
                _id: { $in: paymentIds },
                user: userId,
                status: 'completed',
                reconciled: false
            });
            
            const reconciled = [];
            for (const payment of payments) {
                await payment.markAsReconciled();
                reconciled.push(payment);
            }
            
            return {
                count: reconciled.length,
                payments: reconciled
            };
        } catch (error) {
            throw new Error(`Failed to reconcile payments: ${error.message}`);
        }
    }
    
    /**
     * Get unreconciled payments
     */
    static async getUnreconciledPayments(userId) {
        try {
            const payments = await Payment.getUnreconciledPayments(userId);
            return payments;
        } catch (error) {
            throw new Error(`Failed to get unreconciled payments: ${error.message}`);
        }
    }
    
    /**
     * Get payment statistics
     */
    static async getPaymentStatistics(userId, startDate = null, endDate = null) {
        try {
            const start = startDate ? new Date(startDate) : null;
            const end = endDate ? new Date(endDate) : null;
            
            const stats = await Payment.getPaymentStats(userId, start, end);
            
            // Get unreconciled count
            const unreconciledCount = await Payment.countDocuments({
                user: userId,
                status: 'completed',
                reconciled: false
            });
            
            return {
                ...stats,
                unreconciled_count: unreconciledCount
            };
        } catch (error) {
            throw new Error(`Failed to get payment statistics: ${error.message}`);
        }
    }
    
    /**
     * Get monthly revenue
     */
    static async getMonthlyRevenue(userId, year = new Date().getFullYear()) {
        try {
            const revenue = await Payment.getMonthlyRevenue(userId, year);
            return revenue;
        } catch (error) {
            throw new Error(`Failed to get monthly revenue: ${error.message}`);
        }
    }
    
    /**
     * Get payment history for a client
     */
    static async getClientPaymentHistory(userId, clientId, page = 1, limit = 50) {
        try {
            const skip = (page - 1) * limit;
            
            const payments = await Payment.find({
                user: userId,
                client: clientId,
                status: 'completed'
            })
                .populate('invoice', 'invoice_number total')
                .sort({ payment_date: -1 })
                .skip(skip)
                .limit(limit);
            
            const total = await Payment.countDocuments({
                user: userId,
                client: clientId,
                status: 'completed'
            });
            
            // Calculate summary
            const summary = await Payment.aggregate([
                {
                    $match: {
                        user: userId,
                        client: clientId,
                        status: 'completed'
                    }
                },
                {
                    $group: {
                        _id: null,
                        total_paid: { $sum: '$amount' },
                        payment_count: { $sum: 1 },
                        avg_payment: { $avg: '$amount' }
                    }
                }
            ]);
            
            return {
                payments,
                summary: summary[0] || { total_paid: 0, payment_count: 0, avg_payment: 0 },
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            throw new Error(`Failed to get client payment history: ${error.message}`);
        }
    }
    
    /**
     * Get payment forecast based on outstanding invoices
     */
    static async getPaymentForecast(userId) {
        try {
            const outstandingInvoices = await Invoice.find({
                user: userId,
                status: { $in: ['sent', 'viewed', 'partially_paid', 'overdue'] }
            }).populate('client', 'name average_payment_time');
            
            const forecast = {
                next_7_days: 0,
                next_30_days: 0,
                next_90_days: 0,
                total_outstanding: 0,
                by_client: {}
            };
            
            const now = new Date();
            
            for (const invoice of outstandingInvoices) {
                const amountDue = invoice.amount_due;
                forecast.total_outstanding += amountDue;
                
                // Estimate payment date based on client's average payment time
                const avgPaymentDays = invoice.client?.average_payment_time || 30;
                const estimatedPaymentDate = new Date(invoice.invoice_date);
                estimatedPaymentDate.setDate(estimatedPaymentDate.getDate() + avgPaymentDays);
                
                const daysUntilPayment = Math.ceil((estimatedPaymentDate - now) / (1000 * 60 * 60 * 24));
                
                if (daysUntilPayment <= 7) {
                    forecast.next_7_days += amountDue;
                }
                if (daysUntilPayment <= 30) {
                    forecast.next_30_days += amountDue;
                }
                if (daysUntilPayment <= 90) {
                    forecast.next_90_days += amountDue;
                }
                
                // Group by client
                const clientId = invoice.client._id.toString();
                if (!forecast.by_client[clientId]) {
                    forecast.by_client[clientId] = {
                        name: invoice.client.name,
                        outstanding: 0,
                        invoice_count: 0
                    };
                }
                forecast.by_client[clientId].outstanding += amountDue;
                forecast.by_client[clientId].invoice_count += 1;
            }
            
            // Round amounts
            forecast.next_7_days = Math.round(forecast.next_7_days * 100) / 100;
            forecast.next_30_days = Math.round(forecast.next_30_days * 100) / 100;
            forecast.next_90_days = Math.round(forecast.next_90_days * 100) / 100;
            forecast.total_outstanding = Math.round(forecast.total_outstanding * 100) / 100;
            
            return forecast;
        } catch (error) {
            throw new Error(`Failed to get payment forecast: ${error.message}`);
        }
    }
}

module.exports = PaymentService;
