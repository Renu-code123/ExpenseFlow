const mongoose = require('mongoose');

const timeEntrySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true,
        index: true
    },
    invoice: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice',
        index: true
    },
    
    // Project Information
    project_name: String,
    task_description: {
        type: String,
        required: true
    },
    
    // Time Details
    start_time: {
        type: Date,
        required: true
    },
    end_time: Date,
    duration: {
        type: Number, // in minutes
        required: true,
        min: 0
    },
    
    // Billing
    hourly_rate: {
        type: Number,
        required: true,
        min: 0
    },
    billable_amount: {
        type: Number,
        required: true,
        min: 0
    },
    is_billable: {
        type: Boolean,
        default: true
    },
    is_billed: {
        type: Boolean,
        default: false
    },
    billed_at: Date,
    
    // Status
    status: {
        type: String,
        enum: ['in_progress', 'stopped', 'completed', 'billed'],
        default: 'completed'
    },
    
    // Tags and Categories
    tags: [String],
    category: String,
    
    // Notes
    notes: String
}, {
    timestamps: true
});

// Indexes
timeEntrySchema.index({ user: 1, start_time: -1 });
timeEntrySchema.index({ user: 1, client: 1 });
timeEntrySchema.index({ user: 1, is_billed: 1 });
timeEntrySchema.index({ invoice: 1 });

// Pre-save middleware
timeEntrySchema.pre('save', function(next) {
    // Calculate billable amount
    if (this.duration && this.hourly_rate) {
        const hours = this.duration / 60;
        this.billable_amount = Math.round(hours * this.hourly_rate * 100) / 100;
    }
    
    // Update status if billed
    if (this.is_billed && this.status !== 'billed') {
        this.status = 'billed';
        this.billed_at = new Date();
    }
    
    next();
});

// Virtuals
timeEntrySchema.virtual('hours').get(function() {
    return Math.round((this.duration / 60) * 100) / 100;
});

// Methods
timeEntrySchema.methods.stop = async function() {
    if (this.status !== 'in_progress') {
        throw new Error('Time entry is not in progress');
    }
    
    this.end_time = new Date();
    this.duration = Math.round((this.end_time - this.start_time) / (1000 * 60));
    this.status = 'stopped';
    
    return this.save();
};

timeEntrySchema.methods.markAsBilled = async function(invoiceId) {
    this.is_billed = true;
    this.invoice = invoiceId;
    this.status = 'billed';
    this.billed_at = new Date();
    
    return this.save();
};

// Static methods
timeEntrySchema.statics.getUnbilledEntries = function(userId, clientId = null) {
    const query = {
        user: userId,
        is_billable: true,
        is_billed: false,
        status: { $in: ['stopped', 'completed'] }
    };
    
    if (clientId) {
        query.client = clientId;
    }
    
    return this.find(query)
        .populate('client', 'name company_name')
        .sort({ start_time: -1 });
};

timeEntrySchema.statics.getClientTimeEntries = function(userId, clientId, filters = {}) {
    const query = { user: userId, client: clientId };
    
    if (filters.is_billed !== undefined) {
        query.is_billed = filters.is_billed;
    }
    
    if (filters.start_date && filters.end_date) {
        query.start_time = {
            $gte: new Date(filters.start_date),
            $lte: new Date(filters.end_date)
        };
    }
    
    return this.find(query).sort({ start_time: -1 });
};

timeEntrySchema.statics.getTimeStats = async function(userId, startDate, endDate) {
    const match = { user: userId };
    
    if (startDate && endDate) {
        match.start_time = { $gte: startDate, $lte: endDate };
    }
    
    const stats = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: {
                    client: '$client',
                    is_billed: '$is_billed'
                },
                total_duration: { $sum: '$duration' },
                total_amount: { $sum: '$billable_amount' },
                count: { $sum: 1 }
            }
        },
        {
            $lookup: {
                from: 'clients',
                localField: '_id.client',
                foreignField: '_id',
                as: 'client_info'
            }
        }
    ]);
    
    return stats;
};

timeEntrySchema.statics.startTimer = async function(userId, clientId, taskDescription, hourlyRate, projectName = null) {
    const entry = new this({
        user: userId,
        client: clientId,
        project_name: projectName,
        task_description: taskDescription,
        start_time: new Date(),
        hourly_rate: hourlyRate,
        duration: 0,
        billable_amount: 0,
        status: 'in_progress'
    });
    
    return entry.save();
};

module.exports = mongoose.model('TimeEntry', timeEntrySchema);
