const Bill = require('../models/Bill');
const BillPayment = require('../models/BillPayment');
const CalendarEvent = require('../models/CalendarEvent');
const ReminderSchedule = require('../models/ReminderSchedule');

class BillService {
    /**
     * Create a new bill
     */
    static async createBill(userId, billData) {
        try {
            const bill = new Bill({
                user: userId,
                ...billData
            });
            
            await bill.save();
            
            // Create calendar event
            await CalendarEvent.createFromBill(bill);
            
            // Schedule reminders
            await ReminderSchedule.syncBillReminders(bill._id);
            
            return bill;
        } catch (error) {
            throw new Error(`Failed to create bill: ${error.message}`);
        }
    }
    
    /**
     * Update bill
     */
    static async updateBill(userId, billId, updateData) {
        try {
            const bill = await Bill.findOne({ _id: billId, user: userId });
            
            if (!bill) {
                throw new Error('Bill not found');
            }
            
            Object.assign(bill, updateData);
            await bill.save();
            
            // Update calendar events
            await CalendarEvent.syncBillEvents(userId);
            
            // Update reminders
            await ReminderSchedule.syncBillReminders(bill._id);
            
            return bill;
        } catch (error) {
            throw new Error(`Failed to update bill: ${error.message}`);
        }
    }
    
    /**
     * Delete bill
     */
    static async deleteBill(userId, billId) {
        try {
            const bill = await Bill.findOne({ _id: billId, user: userId });
            
            if (!bill) {
                throw new Error('Bill not found');
            }
            
            // Delete related calendar events
            await CalendarEvent.deleteMany({
                user: userId,
                related_id: billId,
                related_model: 'Bill'
            });
            
            // Delete related reminders
            await ReminderSchedule.deleteMany({
                user: userId,
                related_id: billId,
                related_model: 'Bill'
            });
            
            await bill.deleteOne();
            
            return { message: 'Bill deleted successfully' };
        } catch (error) {
            throw new Error(`Failed to delete bill: ${error.message}`);
        }
    }
    
    /**
     * Record payment for a bill
     */
    static async recordPayment(userId, billId, paymentData) {
        try {
            const bill = await Bill.findOne({ _id: billId, user: userId });
            
            if (!bill) {
                throw new Error('Bill not found');
            }
            
            const payment = await bill.recordPayment(paymentData);
            
            // Create payment calendar event
            await CalendarEvent.createFromPayment(payment, bill);
            
            // Update bill calendar events
            await CalendarEvent.syncBillEvents(userId);
            
            // Update reminders for next occurrence
            if (bill.is_recurring && bill.frequency !== 'once') {
                await ReminderSchedule.syncBillReminders(bill._id);
            }
            
            return { bill, payment };
        } catch (error) {
            throw new Error(`Failed to record payment: ${error.message}`);
        }
    }
    
    /**
     * Get upcoming bills
     */
    static async getUpcomingBills(userId, days = 30) {
        try {
            return await Bill.getUpcomingBills(userId, days);
        } catch (error) {
            throw new Error(`Failed to get upcoming bills: ${error.message}`);
        }
    }
    
    /**
     * Get overdue bills
     */
    static async getOverdueBills(userId) {
        try {
            return await Bill.getOverdueBills(userId);
        } catch (error) {
            throw new Error(`Failed to get overdue bills: ${error.message}`);
        }
    }
    
    /**
     * Get bills due today
     */
    static async getBillsDueToday(userId) {
        try {
            return await Bill.getDueToday(userId);
        } catch (error) {
            throw new Error(`Failed to get bills due today: ${error.message}`);
        }
    }
    
    /**
     * Get bills by category
     */
    static async getBillsByCategory(userId) {
        try {
            return await Bill.getBillsByCategory(userId);
        } catch (error) {
            throw new Error(`Failed to get bills by category: ${error.message}`);
        }
    }
    
    /**
     * Get bill statistics
     */
    static async getBillStatistics(userId) {
        try {
            const [
                totalBills,
                activeBills,
                overdueBills,
                paidBills,
                monthlyTotal,
                byCategory
            ] = await Promise.all([
                Bill.countDocuments({ user: userId }),
                Bill.countDocuments({ user: userId, status: 'active' }),
                Bill.countDocuments({ user: userId, status: 'overdue' }),
                Bill.countDocuments({ user: userId, status: 'paid' }),
                Bill.getMonthlyTotal(userId),
                Bill.getBillsByCategory(userId)
            ]);
            
            return {
                total_bills: totalBills,
                active_bills: activeBills,
                overdue_bills: overdueBills,
                paid_bills: paidBills,
                monthly_total: monthlyTotal,
                by_category: byCategory
            };
        } catch (error) {
            throw new Error(`Failed to get bill statistics: ${error.message}`);
        }
    }
    
    /**
     * Skip bill payment
     */
    static async skipBill(userId, billId) {
        try {
            const bill = await Bill.findOne({ _id: billId, user: userId });
            
            if (!bill) {
                throw new Error('Bill not found');
            }
            
            await bill.skip();
            
            // Update calendar and reminders
            await CalendarEvent.syncBillEvents(userId);
            await ReminderSchedule.syncBillReminders(bill._id);
            
            return bill;
        } catch (error) {
            throw new Error(`Failed to skip bill: ${error.message}`);
        }
    }
    
    /**
     * Pause bill
     */
    static async pauseBill(userId, billId) {
        try {
            const bill = await Bill.findOne({ _id: billId, user: userId });
            
            if (!bill) {
                throw new Error('Bill not found');
            }
            
            await bill.pause();
            
            // Cancel pending reminders
            await ReminderSchedule.updateMany(
                {
                    user: userId,
                    related_id: billId,
                    related_model: 'Bill',
                    status: 'pending'
                },
                {
                    status: 'cancelled'
                }
            );
            
            return bill;
        } catch (error) {
            throw new Error(`Failed to pause bill: ${error.message}`);
        }
    }
    
    /**
     * Resume bill
     */
    static async resumeBill(userId, billId) {
        try {
            const bill = await Bill.findOne({ _id: billId, user: userId });
            
            if (!bill) {
                throw new Error('Bill not found');
            }
            
            await bill.resume();
            
            // Recreate reminders
            await ReminderSchedule.syncBillReminders(bill._id);
            
            return bill;
        } catch (error) {
            throw new Error(`Failed to resume bill: ${error.message}`);
        }
    }
    
    /**
     * Process auto-pay bills
     */
    static async processAutoPay() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            const autoPayBills = await Bill.find({
                'auto_pay.enabled': true,
                status: 'active',
                next_due_date: {
                    $gte: today,
                    $lt: tomorrow
                }
            });
            
            const results = {
                success: [],
                failed: []
            };
            
            for (const bill of autoPayBills) {
                try {
                    await bill.recordPayment({
                        amount: bill.amount,
                        payment_method: 'auto_pay',
                        notes: 'Automatic payment'
                    });
                    
                    results.success.push({
                        bill_id: bill._id,
                        bill_name: bill.name,
                        amount: bill.amount
                    });
                } catch (error) {
                    results.failed.push({
                        bill_id: bill._id,
                        bill_name: bill.name,
                        error: error.message
                    });
                }
            }
            
            return results;
        } catch (error) {
            throw new Error(`Failed to process auto-pay: ${error.message}`);
        }
    }
    
    /**
     * Send bill reminders
     */
    static async sendBillReminders() {
        try {
            const billsNeedingReminders = await Bill.getBillsNeedingReminders();
            
            const results = {
                success: [],
                failed: []
            };
            
            for (const { bill, days_until_due } of billsNeedingReminders) {
                try {
                    // Check if reminder already exists for this day
                    const existingReminder = await ReminderSchedule.findOne({
                        related_id: bill._id,
                        related_model: 'Bill',
                        'metadata.days_before': days_until_due,
                        status: { $in: ['sent', 'pending'] }
                    });
                    
                    if (!existingReminder) {
                        await ReminderSchedule.createBillReminder(bill, days_until_due);
                        results.success.push({
                            bill_id: bill._id,
                            bill_name: bill.name,
                            days_until_due
                        });
                    }
                } catch (error) {
                    results.failed.push({
                        bill_id: bill._id,
                        bill_name: bill.name,
                        error: error.message
                    });
                }
            }
            
            return results;
        } catch (error) {
            throw new Error(`Failed to send bill reminders: ${error.message}`);
        }
    }
}

module.exports = BillService;
