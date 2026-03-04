const mongoose = require('mongoose');

const depreciationScheduleSchema = new mongoose.Schema({
    assetId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FixedAsset',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    period: {
        year: { type: Number, required: true },
        month: { type: Number, required: true }
    },
    openingBookValue: {
        type: Number,
        required: true
    },
    depreciationAmount: {
        type: Number,
        required: true
    },
    closingBookValue: {
        type: Number,
        required: true
    },
    isPosted: {
        type: Boolean,
        default: false
    },
    postedDate: Date,
    transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction'
    },
    methodUsed: String,
    metadata: {
        daysInPeriod: Number,
        fullYearCharge: Number
    }
}, {
    timestamps: true
});

depreciationScheduleSchema.index({ userId: 1, 'period.year': 1, 'period.month': 1 });
depreciationScheduleSchema.index({ assetId: 1, 'period.year': 1 });

module.exports = mongoose.model('DepreciationSchedule', depreciationScheduleSchema);
