const express = require('express');
const Joi = require('joi');
const fs = require('fs').promises;
const path = require('path');
const emailService = require('../services/emailService');
const router = express.Router();

const MESSAGES_FILE = path.join(__dirname, '../data/contact_messages.json');

const contactSchema = Joi.object({
    name: Joi.string().trim().max(50).required(),
    email: Joi.string().email().required(),
    subject: Joi.string().trim().max(100).allow('', null),
    message: Joi.string().trim().max(1000).required(),
    userId: Joi.string().allow('', null)
});

// Ensure data directory exists
async function ensureDirectory() {
    const dir = path.dirname(MESSAGES_FILE);
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
}

// @route   POST /api/contact
// @desc    Submit a contact form message (Saved to JSON)
// @access  Public
router.post('/', async (req, res) => {
    try {
        const { error, value } = contactSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { name, email, subject, message, userId } = value;

        const newMessage = {
            id: Date.now().toString(),
            name,
            email,
            subject: subject || 'No Subject',
            message,
            user: userId || null,
            status: 'new',
            createdAt: new Date().toISOString()
        };

        await ensureDirectory();

        let messages = [];
        try {
            const data = await fs.readFile(MESSAGES_FILE, 'utf8');
            messages = JSON.parse(data);
        } catch (err) {
            // File doesn't exist or is empty
            messages = [];
        }

        messages.push(newMessage);
        await fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2));

        // Send email notification to support
        try {
            await emailService.sendContactNotification({
                name,
                email,
                subject: subject || 'No Subject',
                message
            });
        } catch (emailError) {
            console.error('Contact notification email failed:', emailError);
        }

        res.status(201).json({
            success: true,
            message: 'Your message has been sent successfully. We will get back to you soon.'
        });
    } catch (error) {
        console.error('Contact form submission error:', error);
        res.status(500).json({ error: 'Server error. Please try again later.' });
    }
});

module.exports = router;
