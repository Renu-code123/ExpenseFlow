const mongoose = require('mongoose');

/**
 * PayrollRun Model
 * Manages batch payroll processing for a specific period
 */
const payrollEntrySchema = new mongoose.Schema({
    employeeId: {
        type: String,
        required: true
    },
    employeeName: String,
    salaryStructureId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SalaryStructure'
    },
    earnings: [{
        componentName: String,
        amount: Number
    }],
    deductions: [{
        componentName: String,
        amount: Number
    }],
    reimbursements: [{
        componentName: String,
        amount: Number
    }],
    grossPay: {
        type: Number,
        required: true
    },
    totalDeductions: {
        type: Number,
        default: 0
    },
    netPay: {
        type: Number,
        required: true
    },
    taxDeducted: {
        type: Number,
        default: 0
    },
    professionalTax: {
        type: Number,
        default: 0
    },
    providentFund: {
        type: Number,
        default: 0
    },
    esi: {
        type: Number,
        default: 0
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'processed', 'failed', 'reversed'],
        default: 'pending'
    },
    paymentDate: Date,
    paymentReference: String,
    remarks: String
}, { _id: false });

const payrollRunSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    runId: {
        type: String,
        unique: true,
        required: true
    },
    payrollPeriod: {
        month: {
            type: Number,
            required: true,
            min: 1,
            max: 12
        },
        year: {
            type: Number,
            required: true
        }
    },
    periodStart: {
        type: Date,
        required: true
    },
    periodEnd: {
        type: Date,
        required: true
    },
    entries: [payrollEntrySchema],
    summary: {
        totalEmployees: {
            type: Number,
            default: 0
        },
        totalGrossPay: {
            type: Number,
            default: 0
        },
        totalDeductions: {
            type: Number,
            default: 0
        },
        totalNetPay: {
            type: Number,
            default: 0
        },
        totalTax: {
            type: Number,
            default: 0
        }
    },
    status: {
        type: String,
        enum: ['draft', 'pending_approval', 'approved', 'processing', 'completed', 'failed'],
        default: 'draft'
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: Date,
    processedAt: Date,
    notes: String
}, {
    timestamps: true
});

// Pre-save hook to calculate summary
payrollRunSchema.pre('save', function (next) {
    this.summary.totalEmployees = this.entries.length;
    this.summary.totalGrossPay = this.entries.reduce((sum, e) => sum + e.grossPay, 0);
    this.summary.totalDeductions = this.entries.reduce((sum, e) => sum + e.totalDeductions, 0);
    this.summary.totalNetPay = this.entries.reduce((sum, e) => sum + e.netPay, 0);
    this.summary.totalTax = this.entries.reduce((sum, e) => sum + e.taxDeducted, 0);

    next();
});

// Indexes
payrollRunSchema.index({ userId: 1, 'payrollPeriod.year': 1, 'payrollPeriod.month': 1 });
payrollRunSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('PayrollRun', payrollRunSchema);
