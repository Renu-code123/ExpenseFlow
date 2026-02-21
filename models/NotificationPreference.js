const mongoose = require('mongoose');

/**
 * NotificationPreference Model
 * Issue #721: Stores user granular preferences for each notification slug and channel.
 */
const notificationPreferenceSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    preferences: [{
        slug: {
            type: String, // References NotificationTemplate.slug
            required: true
        },
        channels: {
            email: { type: Boolean, default: true },
            push: { type: Boolean, default: true },
            sms: { type: Boolean, default: false },
            inApp: { type: Boolean, default: true }
        },
        frequency: {
            type: String,
            enum: ['immediate', 'daily_digest', 'weekly_summary', 'off'],
            default: 'immediate'
        }
    }],
    globalUnsubscribe: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Ensure unique preferences per user/slug
notificationPreferenceSchema.index({ user: 1, 'preferences.slug': 1 }, { unique: true });

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);
