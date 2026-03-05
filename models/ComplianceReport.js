const mongoose = require('mongoose');

/**
 * ComplianceReport Model
 * Stores generated compliance reports for regulatory requirements
 */
const complianceReportSchema = new mongoose.Schema({
    reportId: {
        type: String,
        unique: true,
        required: true
    },
    reportType: {
        type: String,
        required: true,
        enum: ['SOX', 'GDPR', 'HIPAA', 'PCI_DSS', 'ISO_27001', 'CUSTOM']
    },
    generatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    generatedAt: {
        type: Date,
        required: true,
        default: Date.now
    },
    period: {
        startDate: {
            type: Date,
            required: true
        },
        endDate: {
            type: Date,
            required: true
        }
    },
    filters: {
        users: [mongoose.Schema.Types.ObjectId],
        actions: [String],
        entityTypes: [String],
        severity: [String],
        categories: [String]
    },
    summary: {
        totalLogs: {
            type: Number,
            default: 0
        },
        criticalEvents: {
            type: Number,
            default: 0
        },
        securityEvents: {
            type: Number,
            default: 0
        },
        dataModifications: {
            type: Number,
            default: 0
        },
        uniqueUsers: {
            type: Number,
            default: 0
        },
        failedAttempts: {
            type: Number,
            default: 0
        }
    },
    exportFormats: [{
        format: {
            type: String,
            enum: ['CSV', 'PDF', 'EXCEL', 'JSON']
        },
        filePath: String,
        fileSize: Number,
        generatedAt: Date
    }],
    integrityHash: String,
    status: {
        type: String,
        enum: ['generating', 'completed', 'failed', 'archived'],
        default: 'generating'
    },
    metadata: {
        totalPages: Number,
        recordCount: Number,
        compressionRatio: Number
    }
}, {
    timestamps: true
});

// Indexes
complianceReportSchema.index({ generatedBy: 1, generatedAt: -1 });
complianceReportSchema.index({ reportType: 1, status: 1 });
complianceReportSchema.index({ 'period.startDate': 1, 'period.endDate': 1 });

module.exports = mongoose.model('ComplianceReport', complianceReportSchema);
