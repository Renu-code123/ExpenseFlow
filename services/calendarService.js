const CalendarEvent = require('../models/CalendarEvent');
const Bill = require('../models/Bill');

class CalendarService {
    /**
     * Get events for date range
     */
    static async getEventsForDateRange(userId, startDate, endDate, filters = {}) {
        try {
            return await CalendarEvent.getEventsForDateRange(userId, startDate, endDate, filters);
        } catch (error) {
            throw new Error(`Failed to get events: ${error.message}`);
        }
    }
    
    /**
     * Get month events
     */
    static async getMonthEvents(userId, year, month) {
        try {
            const events = await CalendarEvent.getMonthEvents(userId, year, month);
            
            // Group events by date
            const eventsByDate = {};
            
            events.forEach(event => {
                const dateKey = event.date.toISOString().split('T')[0];
                if (!eventsByDate[dateKey]) {
                    eventsByDate[dateKey] = [];
                }
                eventsByDate[dateKey].push(event);
            });
            
            return {
                year,
                month,
                events,
                events_by_date: eventsByDate,
                total_events: events.length
            };
        } catch (error) {
            throw new Error(`Failed to get month events: ${error.message}`);
        }
    }
    
    /**
     * Get today's events
     */
    static async getTodayEvents(userId) {
        try {
            return await CalendarEvent.getTodayEvents(userId);
        } catch (error) {
            throw new Error(`Failed to get today's events: ${error.message}`);
        }
    }
    
    /**
     * Get upcoming events
     */
    static async getUpcomingEvents(userId, days = 7) {
        try {
            return await CalendarEvent.getUpcomingEvents(userId, days);
        } catch (error) {
            throw new Error(`Failed to get upcoming events: ${error.message}`);
        }
    }
    
    /**
     * Create custom event
     */
    static async createCustomEvent(userId, eventData) {
        try {
            const event = new CalendarEvent({
                user: userId,
                type: 'custom',
                ...eventData
            });
            
            await event.save();
            
            return event;
        } catch (error) {
            throw new Error(`Failed to create event: ${error.message}`);
        }
    }
    
    /**
     * Update event
     */
    static async updateEvent(userId, eventId, updateData) {
        try {
            const event = await CalendarEvent.findOne({ _id: eventId, user: userId });
            
            if (!event) {
                throw new Error('Event not found');
            }
            
            Object.assign(event, updateData);
            await event.save();
            
            return event;
        } catch (error) {
            throw new Error(`Failed to update event: ${error.message}`);
        }
    }
    
    /**
     * Delete event
     */
    static async deleteEvent(userId, eventId) {
        try {
            const event = await CalendarEvent.findOne({ _id: eventId, user: userId });
            
            if (!event) {
                throw new Error('Event not found');
            }
            
            await event.deleteOne();
            
            return { message: 'Event deleted successfully' };
        } catch (error) {
            throw new Error(`Failed to delete event: ${error.message}`);
        }
    }
    
    /**
     * Sync all bill events
     */
    static async syncBillEvents(userId) {
        try {
            await CalendarEvent.syncBillEvents(userId);
            
            const events = await CalendarEvent.find({
                user: userId,
                type: { $in: ['bill_due', 'bill_overdue'] }
            });
            
            return {
                synced: events.length,
                events
            };
        } catch (error) {
            throw new Error(`Failed to sync bill events: ${error.message}`);
        }
    }
    
    /**
     * Get calendar summary
     */
    static async getCalendarSummary(userId) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const thirtyDaysFromNow = new Date(today);
            thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
            
            const [
                todayEvents,
                upcomingEvents,
                overdueCount,
                scheduledCount
            ] = await Promise.all([
                CalendarEvent.countDocuments({
                    user: userId,
                    date: {
                        $gte: today,
                        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                    },
                    status: 'scheduled'
                }),
                CalendarEvent.countDocuments({
                    user: userId,
                    date: {
                        $gte: today,
                        $lte: thirtyDaysFromNow
                    },
                    status: 'scheduled'
                }),
                CalendarEvent.countDocuments({
                    user: userId,
                    type: 'bill_overdue',
                    status: 'scheduled'
                }),
                CalendarEvent.countDocuments({
                    user: userId,
                    status: 'scheduled'
                })
            ]);
            
            // Get events by type
            const eventsByType = await CalendarEvent.aggregate([
                {
                    $match: {
                        user: userId,
                        date: { $gte: today },
                        status: 'scheduled'
                    }
                },
                {
                    $group: {
                        _id: '$type',
                        count: { $sum: 1 }
                    }
                }
            ]);
            
            return {
                today_events: todayEvents,
                upcoming_events: upcomingEvents,
                overdue_count: overdueCount,
                scheduled_count: scheduledCount,
                by_type: eventsByType.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {})
            };
        } catch (error) {
            throw new Error(`Failed to get calendar summary: ${error.message}`);
        }
    }
}

module.exports = CalendarService;
