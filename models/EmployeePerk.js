const mongoose = require('mongoose');

/**
 * EmployeePerk Model
 * Manages non-cash benefits and perquisites for employees
 */
const employeePerkSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    employeeId: {
        type: String,
        required: true,
        index: true
    },
    employeeName: String,
    perkType: {
        type: String,
        enum: [
            'company_car',
            'housing',
            'meal_vouchers',
            'health_insurance',
            'life_insurance',
            'stock_options',
            'club_membership',
            'phone_allowance',
            'internet_allowance',
            'education_allowance',
            'relocation_assistance',
            'other'
        ],
        required: true
    },
    perkName: {
        type: String,
        required: true
    },
    description: String,
    monetaryValue: {
        type: Number,
        default: 0
    },
    taxableValue: {
        type: Number,
        default: 0
    },
    isTaxable: {
        type: Boolean,
        default: true
    },
    frequency: {
        type: String,
        enum: ['one_time', 'monthly', 'quarterly', 'annual'],
        default: 'monthly'
    },
    effectiveFrom: {
        type: Date,
        required: true
    },
    effectiveTo: Date,
    provider: {
        name: String,
        contactDetails: String
    },
    documents: [{
        documentType: String,
        documentUrl: String,
        uploadedAt: Date
    }],
    utilizationTracking: {
        isTracked: {
            type: Boolean,
            default: false
        },
        utilizationLimit: Number,
        utilizationUsed: {
            type: Number,
            default: 0
        }
    },
    status: {
        type: String,
        enum: ['active', 'suspended', 'expired', 'cancelled'],
        default: 'active'
    },
    notes: String
}, {
    timestamps: true
});

// Indexes
employeePerkSchema.index({ userId: 1, employeeId: 1, status: 1 });
employeePerkSchema.index({ perkType: 1, effectiveFrom: 1 });

module.exports = mongoose.model('EmployeePerk', employeePerkSchema);
