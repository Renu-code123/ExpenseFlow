const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const CalendarService = require('../services/calendarService');
const CalendarEvent = require('../models/CalendarEvent');

/**
 * @route   GET /api/calendar
 * @desc    Get calendar events for date range
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
    try {
        const { start_date, end_date, type, status } = req.query;
        
        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                error: 'start_date and end_date are required'
            });
        }
        
        const filters = {};
        if (type) filters.type = type;
        if (status) filters.status = status;
        
        const events = await CalendarService.getEventsForDateRange(
            req.user.userId,
            new Date(start_date),
            new Date(end_date),
            filters
        );
        
        res.json({
            success: true,
            count: events.length,
            data: events
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/calendar/month/:year/:month
 * @desc    Get calendar events for a specific month
 * @access  Private
 */
router.get('/month/:year/:month', auth, async (req, res) => {
    try {
        const { year, month } = req.params;
        
        const monthData = await CalendarService.getMonthEvents(
            req.user.userId,
            parseInt(year),
            parseInt(month)
        );
        
        res.json({
            success: true,
            data: monthData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/calendar/today
 * @desc    Get today's events
 * @access  Private
 */
router.get('/today', auth, async (req, res) => {
    try {
        const events = await CalendarService.getTodayEvents(req.user.userId);
        
        res.json({
            success: true,
            count: events.length,
            data: events
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/calendar/upcoming
 * @desc    Get upcoming events
 * @access  Private
 */
router.get('/upcoming', auth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        
        const events = await CalendarService.getUpcomingEvents(req.user.userId, days);
        
        res.json({
            success: true,
            count: events.length,
            days,
            data: events
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/calendar/summary
 * @desc    Get calendar summary
 * @access  Private
 */
router.get('/summary', auth, async (req, res) => {
    try {
        const summary = await CalendarService.getCalendarSummary(req.user.userId);
        
        res.json({
            success: true,
            data: summary
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/calendar/events
 * @desc    Create custom calendar event
 * @access  Private
 */
router.post('/events', auth, async (req, res) => {
    try {
        const event = await CalendarService.createCustomEvent(req.user.userId, req.body);
        
        res.status(201).json({
            success: true,
            data: event,
            message: 'Event created successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/calendar/events/:id
 * @desc    Get single event
 * @access  Private
 */
router.get('/events/:id', auth, async (req, res) => {
    try {
        const event = await CalendarEvent.findOne({
            _id: req.params.id,
            user: req.user.userId
        });
        
        if (!event) {
            return res.status(404).json({
                success: false,
                error: 'Event not found'
            });
        }
        
        res.json({
            success: true,
            data: event
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   PUT /api/calendar/events/:id
 * @desc    Update event
 * @access  Private
 */
router.put('/events/:id', auth, async (req, res) => {
    try {
        const event = await CalendarService.updateEvent(
            req.user.userId,
            req.params.id,
            req.body
        );
        
        res.json({
            success: true,
            data: event,
            message: 'Event updated successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   DELETE /api/calendar/events/:id
 * @desc    Delete event
 * @access  Private
 */
router.delete('/events/:id', auth, async (req, res) => {
    try {
        await CalendarService.deleteEvent(req.user.userId, req.params.id);
        
        res.json({
            success: true,
            message: 'Event deleted successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/calendar/sync
 * @desc    Sync bill events with calendar
 * @access  Private
 */
router.post('/sync', auth, async (req, res) => {
    try {
        const result = await CalendarService.syncBillEvents(req.user.userId);
        
        res.json({
            success: true,
            data: result,
            message: 'Calendar synced successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
