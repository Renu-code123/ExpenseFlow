const RecurringExpense = require('../models/RecurringExpense');
const Expense = require('../models/Expense');
const User = require('../models/User');
const emailService = require('./emailService');
const budgetService = require('./budgetService');

class RecurringService {
    /**
     * Process all due recurring expenses and create actual expense entries
     * This is called by the cron job
     */
    async processRecurringExpenses() {
        console.log('[RecurringService] Processing due recurring expenses...');

        const today = new Date();
        today.setHours(23, 59, 59, 999);

        try {
            // Find all recurring expenses that are due
            const dueExpenses = await RecurringExpense.find({
                isActive: true,
                isPaused: false,
                autoCreate: true,
                nextDueDate: { $lte: today }
            }).populate('user');

            let processedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;

            for (const recurring of dueExpenses) {
                try {
                    // Check if should skip this occurrence
                    if (recurring.skipNextOccurrence) {
                        await this.skipOccurrence(recurring._id);
                        skippedCount++;
                        continue;
                    }

                    // Check if end date has passed
                    if (recurring.endDate && new Date(recurring.endDate) < today) {
                        recurring.isActive = false;
                        await recurring.save();
                        continue;
                    }

                    // Create the actual expense
                    await this.createExpenseFromRecurring(recurring);
                    processedCount++;

                } catch (error) {
                    console.error(`[RecurringService] Error processing recurring ${recurring._id}:`, error);
                    errorCount++;
                }
            }

            console.log(`[RecurringService] Processed: ${processedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
            return { processedCount, skippedCount, errorCount };

        } catch (error) {
            console.error('[RecurringService] Error in processRecurringExpenses:', error);
            throw error;
        }
    }

    /**
     * Create an expense entry from a recurring expense
     */
    async createExpenseFromRecurring(recurring) {
        const expense = new Expense({
            user: recurring.user._id || recurring.user,
            description: `${recurring.description} (Recurring)`,
            amount: recurring.amount,
            category: recurring.category === 'subscription' || recurring.category === 'rent' || recurring.category === 'insurance'
                ? 'other'
                : recurring.category,
            type: recurring.type,
            date: recurring.nextDueDate
        });

        await expense.save();

        // Update recurring expense statistics
        recurring.lastProcessedDate = recurring.nextDueDate;
        recurring.nextDueDate = recurring.calculateNextDueDate();
        recurring.totalOccurrences += 1;
        recurring.totalAmountSpent += recurring.amount;
        recurring.reminderSent = false; // Reset reminder flag for next cycle
        recurring.skipNextOccurrence = false;

        await recurring.save();

        // Check budget alerts if it's an expense
        if (recurring.type === 'expense') {
            try {
                const userId = recurring.user._id || recurring.user;
                await budgetService.checkBudgetAlerts(userId);
            } catch (error) {
                console.error('[RecurringService] Error checking budget alerts:', error);
            }
        }

        return expense;
    }

    /**
     * Send reminders for upcoming recurring expenses
     */
    async sendUpcomingReminders() {
        console.log('[RecurringService] Sending upcoming reminders...');

        try {
            const recurring = await RecurringExpense.find({
                isActive: true,
                isPaused: false,
                reminderSent: false,
                reminderDays: { $gt: 0 }
            }).populate('user');

            let sentCount = 0;

            for (const item of recurring) {
                if (item.shouldSendReminder()) {
                    try {
                        await emailService.sendSubscriptionReminder(item.user, item);
                        item.reminderSent = true;
                        await item.save();
                        sentCount++;
                    } catch (error) {
                        console.error(`[RecurringService] Error sending reminder for ${item._id}:`, error);
                    }
                }
            }

            console.log(`[RecurringService] Sent ${sentCount} reminders`);
            return sentCount;

        } catch (error) {
            console.error('[RecurringService] Error in sendUpcomingReminders:', error);
            throw error;
        }
    }

    /**
     * Create a new recurring expense
     */
    async create(userId, data) {
        const nextDueDate = data.nextDueDate || data.startDate || new Date();

        const recurring = new RecurringExpense({
            ...data,
            user: userId,
            nextDueDate: new Date(nextDueDate)
        });

        await recurring.save();
        return recurring;
    }

    /**
     * Get all recurring expenses for a user
     */
    async getAllForUser(userId, includeInactive = false) {
        const query = { user: userId };
        if (!includeInactive) {
            query.isActive = true;
        }

        return await RecurringExpense.find(query).sort({ nextDueDate: 1 });
    }

    /**
     * Get upcoming recurring expenses for next N days
     */
    async getUpcoming(userId, days = 30) {
        return await RecurringExpense.getUpcoming(userId, days);
    }

    /**
     * Get monthly subscription total
     */
    async getMonthlyTotal(userId) {
        return await RecurringExpense.getMonthlyTotal(userId);
    }

    /**
     * Get recurring expense statistics
     */
    async getStatistics(userId) {
        const recurring = await RecurringExpense.find({
            user: userId,
            isActive: true
        });

        const activeCount = recurring.filter(r => !r.isPaused).length;
        const pausedCount = recurring.filter(r => r.isPaused).length;
        const monthlyTotal = recurring
            .filter(r => !r.isPaused && r.type === 'expense')
            .reduce((sum, r) => sum + r.getMonthlyEstimate(), 0);
        const monthlyIncome = recurring
            .filter(r => !r.isPaused && r.type === 'income')
            .reduce((sum, r) => sum + r.getMonthlyEstimate(), 0);

        // Category breakdown
        const categoryBreakdown = {};
        recurring.filter(r => !r.isPaused && r.type === 'expense').forEach(r => {
            const category = r.category;
            if (!categoryBreakdown[category]) {
                categoryBreakdown[category] = { count: 0, monthlyAmount: 0 };
            }
            categoryBreakdown[category].count++;
            categoryBreakdown[category].monthlyAmount += r.getMonthlyEstimate();
        });

        // Upcoming in next 7 days
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
        const upcomingThisWeek = recurring.filter(r => {
            return !r.isPaused && new Date(r.nextDueDate) <= sevenDaysFromNow;
        }).length;

        return {
            activeCount,
            pausedCount,
            totalCount: recurring.length,
            monthlyExpenseTotal: Math.round(monthlyTotal * 100) / 100,
            monthlyIncomeTotal: Math.round(monthlyIncome * 100) / 100,
            netMonthly: Math.round((monthlyIncome - monthlyTotal) * 100) / 100,
            upcomingThisWeek,
            categoryBreakdown
        };
    }

    /**
     * Update a recurring expense
     */
    async update(recurringId, userId, data) {
        const recurring = await RecurringExpense.findOne({
            _id: recurringId,
            user: userId
        });

        if (!recurring) {
            throw new Error('Recurring expense not found');
        }

        // Update fields
        const allowedFields = [
            'description', 'amount', 'category', 'type', 'frequency',
            'customInterval', 'endDate', 'nextDueDate', 'autoCreate',
            'reminderDays', 'notes', 'tags', 'isActive', 'isPaused'
        ];

        allowedFields.forEach(field => {
            if (data[field] !== undefined) {
                recurring[field] = data[field];
            }
        });

        // Reset reminder if date changed
        if (data.nextDueDate) {
            recurring.reminderSent = false;
        }

        await recurring.save();
        return recurring;
    }

    /**
     * Delete (deactivate) a recurring expense
     */
    async delete(recurringId, userId) {
        const recurring = await RecurringExpense.findOne({
            _id: recurringId,
            user: userId
        });

        if (!recurring) {
            throw new Error('Recurring expense not found');
        }

        recurring.isActive = false;
        await recurring.save();
        return recurring;
    }

    /**
     * Permanently delete a recurring expense
     */
    async permanentDelete(recurringId, userId) {
        const result = await RecurringExpense.findOneAndDelete({
            _id: recurringId,
            user: userId
        });

        if (!result) {
            throw new Error('Recurring expense not found');
        }

        return result;
    }

    /**
     * Pause a recurring expense
     */
    async pause(recurringId, userId) {
        return await this.update(recurringId, userId, { isPaused: true });
    }

    /**
     * Resume a recurring expense
     */
    async resume(recurringId, userId) {
        const recurring = await RecurringExpense.findOne({
            _id: recurringId,
            user: userId
        });

        if (!recurring) {
            throw new Error('Recurring expense not found');
        }

        recurring.isPaused = false;

        // If next due date has passed, calculate new one
        const today = new Date();
        if (new Date(recurring.nextDueDate) < today) {
            recurring.nextDueDate = recurring.calculateNextDueDate();
        }

        await recurring.save();
        return recurring;
    }

    /**
     * Skip the next occurrence
     */
    async skipOccurrence(recurringId, userId = null) {
        const query = { _id: recurringId };
        if (userId) query.user = userId;

        const recurring = await RecurringExpense.findOne(query);

        if (!recurring) {
            throw new Error('Recurring expense not found');
        }

        // Move to next due date without creating expense
        recurring.nextDueDate = recurring.calculateNextDueDate();
        recurring.skipNextOccurrence = false;
        recurring.reminderSent = false;

        await recurring.save();
        return recurring;
    }

    /**
     * Mark next occurrence to be skipped
     */
    async markSkipNext(recurringId, userId) {
        const recurring = await RecurringExpense.findOne({
            _id: recurringId,
            user: userId
        });

        if (!recurring) {
            throw new Error('Recurring expense not found');
        }

        recurring.skipNextOccurrence = true;
        await recurring.save();
        return recurring;
    }

    /**
     * Manually trigger expense creation for a recurring expense
     */
    async triggerNow(recurringId, userId) {
        const recurring = await RecurringExpense.findOne({
            _id: recurringId,
            user: userId,
            isActive: true
        }).populate('user');

        if (!recurring) {
            throw new Error('Recurring expense not found or inactive');
        }

        return await this.createExpenseFromRecurring(recurring);
    }

    /**
     * Get projection data for forecasting engine
     * Returns simplified objects with dayOfMonth and amount
     */
    async getProjectionData(userId) {
        const recurring = await RecurringExpense.find({
            user: userId,
            isActive: true,
            isPaused: false
        });

        return recurring.map(r => {
            // Simplified logic: assume mostly monthly for now standard projection
            // If it's weekly, we might ignore or approximate.
            //Ideally we should handle frequencies better but for MVP standardized to monthly day
            const nextDate = new Date(r.nextDueDate);
            return {
                amount: r.amount,
                type: r.type,
                frequency: r.frequency,
                dayOfMonth: nextDate.getDate(),
                description: r.description
            };
        });
    }
}

module.exports = new RecurringService();
