const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    client: {
        name: String,
        email: String,
        address: String
    },
    status: {
        type: String,
        enum: ['active', 'on_hold', 'completed', 'cancelled'],
        default: 'active'
    },
    budget: {
        total: { type: Number, required: true },
        currency: { type: String, default: 'INR' },
        allocatedExpenses: { type: Number, default: 0 }
    },
    timeline: {
        start: Date,
        end: Date
    },
    markupPercentage: {
        type: Number,
        default: 15 // Default 15% markup on expenses
    },
    billingFrequency: {
        type: String,
        enum: ['milestone', 'monthly', 'on_completion'],
        default: 'monthly'
    },
    tags: [String],
    notes: String
}, {
    timestamps: true
});

module.exports = mongoose.model('Project', projectSchema);
