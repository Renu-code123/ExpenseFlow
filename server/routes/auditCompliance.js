const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { body, query, validationResult } = require('express-validator');
const auditComplianceService = require('../services/auditComplianceService');
const ComplianceViolation = require('../models/ComplianceViolation');
const ImmutableAuditLog = require('../models/ImmutableAuditLog');

// Admin middleware for compliance operations
const adminAuth = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'compliance_officer') {
    return res.status(403).json({
      success: false,
      message: 'Admin or compliance officer access required'
    });
  }
  next();
};

// Get audit logs with filtering
router.get('/audit-logs', auth, adminAuth, [
  query('workspaceId').optional().isMongoId(),
  query('userId').optional().isMongoId(),
  query('action').optional().isString(),
  query('entityType').optional().isString(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('riskLevel').optional().isIn(['low', 'medium', 'high', 'critical']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 1000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.workspaceId) query.workspaceId = req.query.workspaceId;
    if (req.query.userId) query.userId = req.query.userId;
    if (req.query.action) query.action = req.query.action;
    if (req.query.entityType) query.entityType = req.query.entityType;
    if (req.query.riskLevel) query.riskLevel = req.query.riskLevel;
    
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) query.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) query.createdAt.$lte = new Date(req.query.endDate);
    }

    const [logs, total] = await Promise.all([
      ImmutableAuditLog.find(query)
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ImmutableAuditLog.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get audit logs'
    });
  }
});

// Verify audit log integrity
router.post('/audit-logs/verify-integrity', auth, adminAuth, [
  body('startSequence').optional().isInt({ min: 1 }),
  body('endSequence').optional().isInt({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { startSequence, endSequence } = req.body;
    const verification = await auditComplianceService.verifyAuditIntegrity(startSequence, endSequence);

    res.json({
      success: true,
      data: verification
    });
  } catch (error) {
    console.error('Audit integrity verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify audit integrity'
    });
  }
});

// Get compliance violations
router.get('/compliance/violations', auth, adminAuth, [
  query('workspaceId').optional().isMongoId(),
  query('standard').optional().isIn(['SOX', 'GDPR', 'PCI_DSS', 'HIPAA', 'SOC2', 'ISO27001']),
  query('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  query('status').optional().isIn(['open', 'investigating', 'remediation_in_progress', 'resolved', 'false_positive', 'accepted_risk']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.workspaceId) query.workspaceId = req.query.workspaceId;
    if (req.query.standard) query.standard = req.query.standard;
    if (req.query.severity) query.severity = req.query.severity;
    if (req.query.status) query.status = req.query.status;

    const [violations, total] = await Promise.all([
      ComplianceViolation.find(query)
        .populate('remediation.assignedTo', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ComplianceViolation.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        violations,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get compliance violations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get compliance violations'
    });
  }
});

// Update compliance violation status
router.put('/compliance/violations/:violationId', auth, adminAuth, [
  body('status').isIn(['open', 'investigating', 'remediation_in_progress', 'resolved', 'false_positive', 'accepted_risk']),
  body('assignedTo').optional().isMongoId(),
  body('resolutionNotes').optional().isString().trim().isLength({ max: 1000 }),
  body('dueDate').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { status, assignedTo, resolutionNotes, dueDate } = req.body;
    const updateData = { status };

    if (assignedTo) updateData['remediation.assignedTo'] = assignedTo;
    if (dueDate) updateData['remediation.dueDate'] = new Date(dueDate);
    if (status === 'resolved') {
      updateData.resolvedAt = new Date();
      updateData.resolutionNotes = resolutionNotes;
    }

    // Add audit trail entry
    const auditEntry = {
      action: `Status changed to ${status}`,
      performedBy: req.user.id,
      timestamp: new Date(),
      details: { previousStatus: req.body.previousStatus, newStatus: status }
    };

    const violation = await ComplianceViolation.findOneAndUpdate(
      { violationId: req.params.violationId },
      {
        ...updateData,
        $push: { auditTrail: auditEntry }
      },
      { new: true }
    );

    if (!violation) {
      return res.status(404).json({
        success: false,
        message: 'Compliance violation not found'
      });
    }

    // Log the compliance action
    await auditComplianceService.logImmutableAudit(
      req.user.id,
      'compliance_violation_updated',
      'compliance',
      violation._id,
      { after: { status, assignedTo, resolutionNotes } }
    );

    res.json({
      success: true,
      data: violation
    });
  } catch (error) {
    console.error('Update compliance violation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update compliance violation'
    });
  }
});

// Generate compliance report
router.post('/compliance/reports', auth, adminAuth, [
  body('standard').isIn(['SOX', 'GDPR', 'PCI_DSS', 'HIPAA', 'SOC2', 'ISO27001']),
  body('workspaceId').optional().isMongoId(),
  body('dateRange.start').optional().isISO8601(),
  body('dateRange.end').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { standard, workspaceId, dateRange } = req.body;
    
    const report = await auditComplianceService.generateComplianceReport(
      standard,
      workspaceId,
      dateRange
    );

    // Log report generation
    await auditComplianceService.logImmutableAudit(
      req.user.id,
      'report_generated',
      'report',
      report.generatedAt,
      { after: { standard, workspaceId, dateRange } }
    );

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Generate compliance report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate compliance report'
    });
  }
});

// Apply legal hold
router.post('/legal-hold/apply', auth, adminAuth, [
  body('entityType').isIn(['expense', 'user', 'workspace', 'payment', 'report']),
  body('entityId').isMongoId(),
  body('reason').notEmpty().isString().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { entityType, entityId, reason } = req.body;
    
    await auditComplianceService.applyLegalHold(entityType, entityId, reason, req.user.id);

    res.json({
      success: true,
      message: 'Legal hold applied successfully'
    });
  } catch (error) {
    console.error('Apply legal hold error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply legal hold'
    });
  }
});

// Release legal hold
router.post('/legal-hold/release', auth, adminAuth, [
  body('entityType').isIn(['expense', 'user', 'workspace', 'payment', 'report']),
  body('entityId').isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { entityType, entityId } = req.body;
    
    await auditComplianceService.releaseLegalHold(entityType, entityId, req.user.id);

    res.json({
      success: true,
      message: 'Legal hold released successfully'
    });
  } catch (error) {
    console.error('Release legal hold error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to release legal hold'
    });
  }
});

// Get compliance dashboard
router.get('/compliance/dashboard', auth, adminAuth, [
  query('workspaceId').optional().isMongoId()
], async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId;
    const query = workspaceId ? { workspaceId } : {};

    const [
      totalAuditLogs,
      openViolations,
      criticalViolations,
      recentActivity,
      complianceByStandard
    ] = await Promise.all([
      ImmutableAuditLog.countDocuments(query),
      ComplianceViolation.countDocuments({ ...query, status: 'open' }),
      ComplianceViolation.countDocuments({ ...query, severity: 'critical' }),
      ImmutableAuditLog.find(query).sort({ createdAt: -1 }).limit(10).populate('userId', 'name'),
      ComplianceViolation.aggregate([
        { $match: query },
        { $group: { _id: '$standard', count: { $sum: 1 } } }
      ])
    ]);

    const dashboard = {
      summary: {
        totalAuditLogs,
        openViolations,
        criticalViolations,
        complianceScore: await this.calculateOverallComplianceScore(workspaceId)
      },
      recentActivity,
      complianceByStandard,
      generatedAt: new Date()
    };

    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    console.error('Get compliance dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get compliance dashboard'
    });
  }
});

// Export audit data for external systems
router.post('/audit-logs/export', auth, adminAuth, [
  body('format').isIn(['json', 'csv', 'xml']),
  body('filters').optional().isObject(),
  body('dateRange.start').optional().isISO8601(),
  body('dateRange.end').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { format, filters = {}, dateRange } = req.body;
    
    const query = { ...filters };
    if (dateRange?.start || dateRange?.end) {
      query.createdAt = {};
      if (dateRange.start) query.createdAt.$gte = new Date(dateRange.start);
      if (dateRange.end) query.createdAt.$lte = new Date(dateRange.end);
    }

    const auditLogs = await ImmutableAuditLog.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(10000); // Limit for performance

    // Log the export action
    await auditComplianceService.logImmutableAudit(
      req.user.id,
      'data_export',
      'audit_log',
      new Date(),
      { after: { format, recordCount: auditLogs.length, filters } }
    );

    let exportData;
    let contentType;
    let filename;

    switch (format) {
      case 'json':
        exportData = JSON.stringify(auditLogs, null, 2);
        contentType = 'application/json';
        filename = `audit-logs-${Date.now()}.json`;
        break;
      case 'csv':
        exportData = this.convertToCSV(auditLogs);
        contentType = 'text/csv';
        filename = `audit-logs-${Date.now()}.csv`;
        break;
      case 'xml':
        exportData = this.convertToXML(auditLogs);
        contentType = 'application/xml';
        filename = `audit-logs-${Date.now()}.xml`;
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(exportData);
  } catch (error) {
    console.error('Export audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export audit logs'
    });
  }
});

module.exports = router;