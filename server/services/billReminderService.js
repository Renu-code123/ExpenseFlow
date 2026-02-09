const ReminderSchedule = require('../models/ReminderSchedule');
const emailService = require('./emailService');

class ReminderService {
    /**
     * Process pending reminders
     */
    static async processPendingReminders() {
        try {
            const pendingReminders = await ReminderSchedule.getPendingReminders();
            
            const results = {
                success: [],
                failed: []
            };
            
            for (const reminder of pendingReminders) {
                try {
                    await this.sendReminder(reminder);
                    await reminder.markAsSent();
                    
                    results.success.push({
                        reminder_id: reminder._id,
                        type: reminder.reminder_type,
                        user: reminder.user._id
                    });
                } catch (error) {
                    await reminder.markAsFailed(error.message);
                    
                    results.failed.push({
                        reminder_id: reminder._id,
                        type: reminder.reminder_type,
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
     * Send reminder via configured methods
     */
    static async sendReminder(reminder) {
        try {
            const deliveryStatus = [];
            
            for (const method of reminder.methods) {
                if (!method.enabled) continue;
                
                try {
                    switch (method.type) {
                        case 'email':
                            await this.sendEmailReminder(reminder);
                            deliveryStatus.push({
                                method: 'email',
                                status: 'sent',
                                sent_at: new Date()
                            });
                            break;
                            
                        case 'push':
                            await this.sendPushNotification(reminder);
                            deliveryStatus.push({
                                method: 'push',
                                status: 'sent',
                                sent_at: new Date()
                            });
                            break;
                            
                        case 'sms':
                            // SMS implementation would go here
                            deliveryStatus.push({
                                method: 'sms',
                                status: 'skipped',
                                sent_at: new Date()
                            });
                            break;
                            
                        case 'in_app':
                            await this.sendInAppNotification(reminder);
                            deliveryStatus.push({
                                method: 'in_app',
                                status: 'sent',
                                sent_at: new Date()
                            });
                            break;
                    }
                } catch (error) {
                    deliveryStatus.push({
                        method: method.type,
                        status: 'failed',
                        error: error.message,
                        sent_at: new Date()
                    });
                }
            }
            
            reminder.delivery_status = deliveryStatus;
            await reminder.save();
            
            return deliveryStatus;
        } catch (error) {
            throw new Error(`Failed to send reminder: ${error.message}`);
        }
    }
    
    /**
     * Send email reminder
     */
    static async sendEmailReminder(reminder) {
        try {
            let emailContent;
            
            switch (reminder.reminder_type) {
                case 'bill_due':
                    emailContent = this.generateBillDueEmail(reminder);
                    break;
                case 'bill_overdue':
                    emailContent = this.generateBillOverdueEmail(reminder);
                    break;
                default:
                    emailContent = this.generateGenericEmail(reminder);
            }
            
            await emailService.sendEmail({
                to: reminder.user.email,
                subject: emailContent.subject,
                html: emailContent.html
            });
        } catch (error) {
            throw new Error(`Failed to send email reminder: ${error.message}`);
        }
    }
    
    /**
     * Generate bill due email
     */
    static generateBillDueEmail(reminder) {
        const { bill_name, amount, currency, due_date, days_before, category, payee } = reminder.metadata;
        
        const dueDate = new Date(due_date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        let subject, urgency, color;
        
        if (days_before === 0) {
            subject = `⚠️ Bill Due Today: ${bill_name}`;
            urgency = 'due today';
            color = '#e74c3c';
        } else if (days_before === 1) {
            subject = `📅 Bill Due Tomorrow: ${bill_name}`;
            urgency = 'due tomorrow';
            color = '#f39c12';
        } else {
            subject = `🔔 Upcoming Bill: ${bill_name} (${days_before} days)`;
            urgency = `due in ${days_before} days`;
            color = '#3498db';
        }
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: ${color}; color: white; padding: 20px; border-radius: 5px 5px 0 0;">
                    <h2 style="margin: 0;">${reminder.title}</h2>
                </div>
                
                <div style="background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px;">
                    <p>Hello,</p>
                    
                    <p>This is a reminder that your bill <strong>${bill_name}</strong> is <strong>${urgency}</strong>.</p>
                    
                    <div style="background-color: white; padding: 15px; border-left: 4px solid ${color}; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Bill:</strong> ${bill_name}</p>
                        <p style="margin: 5px 0;"><strong>Amount:</strong> ${currency} ${amount}</p>
                        <p style="margin: 5px 0;"><strong>Payee:</strong> ${payee}</p>
                        <p style="margin: 5px 0;"><strong>Category:</strong> ${category}</p>
                        <p style="margin: 5px 0;"><strong>Due Date:</strong> ${dueDate}</p>
                    </div>
                    
                    <p>Please make sure to pay this bill on time to avoid any late fees.</p>
                    
                    <p>Best regards,<br>
                    ExpenseFlow Team</p>
                </div>
            </div>
        `;
        
        return { subject, html };
    }
    
    /**
     * Generate bill overdue email
     */
    static generateBillOverdueEmail(reminder) {
        const { bill_name, amount, currency, due_date, days_overdue, category, payee } = reminder.metadata;
        
        const dueDate = new Date(due_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const subject = `🚨 OVERDUE: ${bill_name} - ${days_overdue} days past due`;
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #e74c3c; color: white; padding: 20px; border-radius: 5px 5px 0 0;">
                    <h2 style="margin: 0;">⚠️ Overdue Bill Alert</h2>
                </div>
                
                <div style="background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px;">
                    <p>Hello,</p>
                    
                    <p style="color: #e74c3c; font-weight: bold;">Your bill payment is overdue!</p>
                    
                    <div style="background-color: #fff3cd; border-left: 4px solid #e74c3c; padding: 15px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Bill:</strong> ${bill_name}</p>
                        <p style="margin: 5px 0;"><strong>Amount:</strong> ${currency} ${amount}</p>
                        <p style="margin: 5px 0;"><strong>Payee:</strong> ${payee}</p>
                        <p style="margin: 5px 0;"><strong>Category:</strong> ${category}</p>
                        <p style="margin: 5px 0;"><strong>Was Due:</strong> ${dueDate}</p>
                        <p style="margin: 5px 0; color: #e74c3c;"><strong>Days Overdue:</strong> ${days_overdue}</p>
                    </div>
                    
                    <p><strong>Please pay this bill immediately to avoid late fees and potential service disruption.</strong></p>
                    
                    <p>Best regards,<br>
                    ExpenseFlow Team</p>
                </div>
            </div>
        `;
        
        return { subject, html };
    }
    
    /**
     * Generate generic email
     */
    static generateGenericEmail(reminder) {
        const subject = reminder.title;
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #3498db; color: white; padding: 20px; border-radius: 5px 5px 0 0;">
                    <h2 style="margin: 0;">${reminder.title}</h2>
                </div>
                
                <div style="background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px;">
                    <p>Hello,</p>
                    
                    <p>${reminder.message}</p>
                    
                    <p>Best regards,<br>
                    ExpenseFlow Team</p>
                </div>
            </div>
        `;
        
        return { subject, html };
    }
    
    /**
     * Send push notification
     */
    static async sendPushNotification(reminder) {
        try {
            // Push notification implementation would go here
            // This would typically integrate with Firebase Cloud Messaging or similar service
            
            if (global.io) {
                global.io.to(`user_${reminder.user._id}`).emit('reminder', {
                    id: reminder._id,
                    type: reminder.reminder_type,
                    title: reminder.title,
                    message: reminder.message,
                    priority: reminder.priority,
                    metadata: reminder.metadata
                });
            }
        } catch (error) {
            throw new Error(`Failed to send push notification: ${error.message}`);
        }
    }
    
    /**
     * Send in-app notification
     */
    static async sendInAppNotification(reminder) {
        try {
            if (global.io) {
                global.io.to(`user_${reminder.user._id}`).emit('notification', {
                    id: reminder._id,
                    type: reminder.reminder_type,
                    title: reminder.title,
                    message: reminder.message,
                    priority: reminder.priority,
                    date: reminder.scheduled_date,
                    metadata: reminder.metadata
                });
            }
        } catch (error) {
            throw new Error(`Failed to send in-app notification: ${error.message}`);
        }
    }
    
    /**
     * Get user reminder settings
     */
    static async getReminderSettings(userId) {
        // This would typically be stored in User preferences
        return {
            email: true,
            push: true,
            sms: false,
            in_app: true,
            default_reminder_days: [7, 3, 1]
        };
    }
    
    /**
     * Update reminder settings
     */
    static async updateReminderSettings(userId, settings) {
        // This would typically update User preferences
        return settings;
    }
}

module.exports = ReminderService;
