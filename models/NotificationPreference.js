const mongoose = require('mongoose');

/**
 * Notification Preference Model
 * Issue #646: Granular user control over delivery channels
 */
const notificationPreferenceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },
    channels: {
        email: { type: Boolean, default: true },
        in_app: { type: Boolean, default: true },
        push: { type: Boolean, default: false },
        webhook: { type: Boolean, default: false }
    },
    webhookUrl: {
        type: String,
        trim: true
    },
    categories: {
        budget: {
            email: { type: Boolean, default: true },
            in_app: { type: Boolean, default: true }
        },
        subscriptions: {
            email: { type: Boolean, default: true },
            in_app: { type: Boolean, default: true }
        },
        security: {
            email: { type: Boolean, default: true },
            in_app: { type: Boolean, default: true },
            critical: { type: Boolean, default: true } // Cannot disable critical security alerts
        }
    },
    quietHours: {
        enabled: { type: Boolean, default: false },
        start: String, // "22:00"
        end: String,   // "07:00"
        timezone: { type: String, default: 'UTC' }
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);
