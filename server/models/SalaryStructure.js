const mongoose = require('mongoose');

/**
 * SalaryStructure Model
 * Defines flexible component-based salary structure for employees
 */
const salaryComponentSchema = new mongoose.Schema({
    componentName: {
        type: String,
        required: true
    },
    componentType: {
        type: String,
        enum: ['earning', 'deduction', 'reimbursement'],
        required: true
    },
    calculationType: {
        type: String,
        enum: ['fixed', 'percentage', 'formula'],
        default: 'fixed'
    },
    amount: {
        type: Number,
        default: 0
    },
    percentage: {
        type: Number,
        default: 0
    },
    baseComponent: {
        type: String,
        default: null
    },
    isTaxable: {
        type: Boolean,
        default: true
    },
    isStatutory: {
        type: Boolean,
        default: false
    }
}, { _id: false });

const salaryStructureSchema = new mongoose.Schema({
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
    employeeName: {
        type: String,
        required: true
    },
    designation: String,
    department: String,
    effectiveFrom: {
        type: Date,
        required: true
    },
    effectiveTo: Date,
    components: [salaryComponentSchema],
    ctc: {
        type: Number,
        required: true
    },
    grossSalary: {
        type: Number,
        default: 0
    },
    netSalary: {
        type: Number,
        default: 0
    },
    paymentFrequency: {
        type: String,
        enum: ['monthly', 'bi-weekly', 'weekly'],
        default: 'monthly'
    },
    bankDetails: {
        accountNumber: String,
        ifscCode: String,
        bankName: String,
        accountHolderName: String
    },
    taxRegime: {
        type: String,
        enum: ['old', 'new'],
        default: 'new'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Pre-save hook to calculate gross and net salary
salaryStructureSchema.pre('save', function (next) {
    const earnings = this.components
        .filter(c => c.componentType === 'earning')
        .reduce((sum, c) => sum + c.amount, 0);

    const deductions = this.components
        .filter(c => c.componentType === 'deduction')
        .reduce((sum, c) => sum + c.amount, 0);

    this.grossSalary = earnings;
    this.netSalary = earnings - deductions;

    next();
});

// Indexes
salaryStructureSchema.index({ userId: 1, employeeId: 1 });
salaryStructureSchema.index({ effectiveFrom: 1, isActive: 1 });

module.exports = mongoose.model('SalaryStructure', salaryStructureSchema);
