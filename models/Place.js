const mongoose = require('mongoose');

/**
 * Place Model
 * Caches geocoded locations to reduce API calls and improve consistency
 * Issue #635
 */
const placeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    formattedAddress: {
        type: String,
        required: true,
        trim: true
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true
        }
    },
    placeId: {
        type: String, // External provider ID (e.g. Google Place ID)
        sparse: true,
        index: true
    },
    category: String,
    metadata: mongoose.Schema.Types.Mixed,
    usageCount: {
        type: Number,
        default: 1
    },
    lastUsedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

placeSchema.index({ location: '2dsphere' });
placeSchema.index({ name: 'text', formattedAddress: 'text' });

module.exports = mongoose.model('Place', placeSchema);
