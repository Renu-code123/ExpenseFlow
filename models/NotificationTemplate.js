const mongoose = require('mongoose');

/**
 * NotificationTemplate Model
 * Issue #721: Stores content for multiple channels (Email, Push, SMS, In-App).
 */
const notificationTemplateSchema = new mongoose.Schema({
    slug: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    description: String,
    channels: {
        email: {
            subject: String,
            body: String, // HTML/Handlebars
            enabled: { type: Boolean, default: true }
        },
        push: {
            title: String,
            body: String,
            enabled: { type: Boolean, default: false }
        },
        sms: {
            body: String,
            enabled: { type: Boolean, default: false }
        },
        inApp: {
            title: String,
            body: String,
            enabled: { type: Boolean, default: true }
        }
    },
    category: {
        type: String,
        enum: ['transaction', 'security', 'marketing', 'system', 'social'],
        default: 'system'
    },
    variableDefinitions: [{
        name: String,
        description: String,
        required: { type: Boolean, default: true }
    }],
    version: {
        type: Number,
        default: 1
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('NotificationTemplate', notificationTemplateSchema);
