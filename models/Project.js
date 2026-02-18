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
        required: true,
        trim: true
    },
    description: String,
    code: {
        type: String,
        unique: true,
        sparse: true
    },
    client: {
        name: String,
        email: String,
        company: String
    },
    status: {
        type: String,
        enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'],
        default: 'planning',
        index: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    timeline: {
        startDate: { type: Date, required: true },
        endDate: Date,
        completedDate: Date
    },
    budget: {
        total: { type: Number, required: true, default: 0 },
        currency: { type: String, default: 'INR' },
        allocatedLabor: { type: Number, default: 0 },
        allocatedExpenses: { type: Number, default: 0 }
    },
    billing: {
        type: { type: String, enum: ['fixed_price', 'time_and_materials', 'non_billable'], default: 'fixed_price' },
        rate: { type: Number, default: 0 }, // Hourly rate if T&M
        value: { type: Number, default: 0 } // Contract value
    },
    tags: [String],
    metadata: {
        type: Map,
        of: String
    }
}, {
    timestamps: true
});

// Indexes for performance
projectSchema.index({ name: 'text', description: 'text' });
projectSchema.index({ 'timeline.startDate': 1 });
projectSchema.index({ status: 1, userId: 1 });

module.exports = mongoose.model('Project', projectSchema);
