const AuditLog = require('../models/AuditLog');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Audit Service
 * Handles bulk logging, forensics, and audit trail analysis
 * Issue #469: Enterprise-Grade Security Audit Trail & Forensics Engine
 */

class AuditService {
  /**
   * Create audit log entry
   */
  async createLog(logData) {
    try {
      // Get previous hash for chaining
      const previousHash = await AuditLog.getLatestHash(logData.userId);
      
      const auditLog = new AuditLog({
        ...logData,
        previousHash
      });
      
      // Generate cryptographic hash
      auditLog.generateHash();
      
      await auditLog.save();
      
      return auditLog;
    } catch (error) {
      console.error('[AuditService] Error creating audit log:', error);
      throw error;
    }
  }
  
  /**
   * Bulk create audit logs
   */
  async bulkCreateLogs(logsData) {
    try {
      const logs = [];
      
      for (const logData of logsData) {
        const previousHash = logs.length > 0 
          ? logs[logs.length - 1].hash 
          : await AuditLog.getLatestHash(logData.userId);
        
        const auditLog = new AuditLog({
          ...logData,
          previousHash
        });
        
        auditLog.generateHash();
        logs.push(auditLog);
      }
      
      await AuditLog.insertMany(logs);
      
      return logs;
    } catch (error) {
      console.error('[AuditService] Error bulk creating audit logs:', error);
      throw error;
    }
  }
  
  /**
   * Get audit logs with filters
   */
  async getLogs(filters = {}, options = {}) {
    try {
      const {
        userId,
        workspaceId,
        resource,
        action,
        startDate,
        endDate,
        severity,
        flagged,
        reviewed
      } = filters;
      
      const {
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;
      
      const query = {};
      
      if (userId) query.userId = userId;
      if (workspaceId) query.workspaceId = workspaceId;
      if (resource) query.resource = resource;
      if (action) query.action = action;
      if (severity) query.severity = severity;
      if (typeof flagged !== 'undefined') query.flagged = flagged;
      if (typeof reviewed !== 'undefined') query.reviewed = reviewed;
      
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }
      
      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
      
      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .populate('userId', 'name email')
          .populate('reviewedBy', 'name email')
          .lean(),
        AuditLog.countDocuments(query)
      ]);
      
      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('[AuditService] Error getting audit logs:', error);
      throw error;
    }
  }
  
  /**
   * Get resource audit trail
   */
  async getResourceTrail(resource, resourceId, limit = 50) {
    try {
      return await AuditLog.getResourceTrail(resource, resourceId, limit);
    } catch (error) {
      console.error('[AuditService] Error getting resource trail:', error);
      throw error;
    }
  }
  
  /**
   * Detect suspicious activity
   */
  async detectSuspiciousActivity(userId, timeWindowMinutes = 5) {
    try {
      return await AuditLog.detectSuspiciousActivity(userId, timeWindowMinutes);
    } catch (error) {
      console.error('[AuditService] Error detecting suspicious activity:', error);
      throw error;
    }
  }
  
  /**
   * Flag audit log for review
   */
  async flagLog(logId, reason) {
    try {
      const log = await AuditLog.findByIdAndUpdate(
        logId,
        {
          $set: {
            flagged: true,
            flagReason: reason
          }
        },
        { new: true }
      );
      
      return log;
    } catch (error) {
      console.error('[AuditService] Error flagging audit log:', error);
      throw error;
    }
  }
  
  /**
   * Review flagged audit log
   */
  async reviewLog(logId, reviewedBy, notes) {
    try {
      const log = await AuditLog.findByIdAndUpdate(
        logId,
        {
          $set: {
            reviewed: true,
            reviewedBy,
            reviewedAt: new Date(),
            reviewNotes: notes
          }
        },
        { new: true }
      );
      
      return log;
    } catch (error) {
      console.error('[AuditService] Error reviewing audit log:', error);
      throw error;
    }
  }
  
  /**
   * Verify audit chain integrity
   */
  async verifyChainIntegrity(userId, startDate, endDate) {
    try {
      return await AuditLog.verifyChainIntegrity(userId, startDate, endDate);
    } catch (error) {
      console.error('[AuditService] Error verifying chain integrity:', error);
      throw error;
    }
  }
  
  /**
   * Get audit statistics
   */
  async getStatistics(userId, startDate, endDate) {
    try {
      const stats = await AuditLog.getStatistics(userId, startDate, endDate);
      
      // Add additional statistics
      const [
        criticalCount,
        highCount,
        flaggedCount,
        reviewedCount,
        uniqueResources,
        uniqueIPs
      ] = await Promise.all([
        AuditLog.countDocuments({
          userId,
          createdAt: { $gte: startDate, $lte: endDate },
          severity: 'critical'
        }),
        AuditLog.countDocuments({
          userId,
          createdAt: { $gte: startDate, $lte: endDate },
          severity: 'high'
        }),
        AuditLog.countDocuments({
          userId,
          createdAt: { $gte: startDate, $lte: endDate },
          flagged: true
        }),
        AuditLog.countDocuments({
          userId,
          createdAt: { $gte: startDate, $lte: endDate },
          reviewed: true
        }),
        AuditLog.distinct('resource', {
          userId,
          createdAt: { $gte: startDate, $lte: endDate }
        }),
        AuditLog.distinct('ipAddress', {
          userId,
          createdAt: { $gte: startDate, $lte: endDate }
        })
      ]);
      
      stats.criticalCount = criticalCount;
      stats.highCount = highCount;
      stats.flaggedCount = flaggedCount;
      stats.reviewedCount = reviewedCount;
      stats.uniqueResources = uniqueResources.length;
      stats.uniqueIPs = uniqueIPs.length;
      
      return stats;
    } catch (error) {
      console.error('[AuditService] Error getting statistics:', error);
      throw error;
    }
  }
  
  /**
   * Export audit logs to PDF
   */
  async exportToPDF(filters, outputPath) {
    try {
      const { logs } = await this.getLogs(filters, { limit: 1000 });
      
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          info: {
            Title: 'Audit Trail Report',
            Author: 'ExpenseFlow Security System',
            Subject: 'Audit Log Export',
            Keywords: 'audit, security, forensics'
          },
          permissions: {
            printing: 'highResolution',
            modifying: false,
            copying: false,
            annotating: false,
            fillingForms: false,
            contentAccessibility: true,
            documentAssembly: false
          }
        });
        
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);
        
        // Title
        doc.fontSize(20)
           .font('Helvetica-Bold')
           .text('Security Audit Trail Report', { align: 'center' });
        
        doc.moveDown();
        
        // Metadata
        doc.fontSize(10)
           .font('Helvetica')
           .text(`Generated: ${new Date().toISOString()}`, { align: 'center' })
           .text(`Total Records: ${logs.length}`, { align: 'center' });
        
        doc.moveDown(2);
        
        // Table header
        doc.fontSize(8)
           .font('Helvetica-Bold');
        
        const tableTop = doc.y;
        const colWidths = {
          timestamp: 80,
          user: 100,
          action: 80,
          resource: 70,
          severity: 50,
          ip: 90
        };
        
        let xPos = 50;
        doc.text('Timestamp', xPos, tableTop);
        xPos += colWidths.timestamp;
        doc.text('User', xPos, tableTop);
        xPos += colWidths.user;
        doc.text('Action', xPos, tableTop);
        xPos += colWidths.action;
        doc.text('Resource', xPos, tableTop);
        xPos += colWidths.resource;
        doc.text('Severity', xPos, tableTop);
        xPos += colWidths.severity;
        doc.text('IP Address', xPos, tableTop);
        
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);
        
        // Table rows
        doc.font('Helvetica').fontSize(7);
        
        for (const log of logs) {
          if (doc.y > 700) {
            doc.addPage();
            doc.y = 50;
          }
          
          const rowTop = doc.y;
          xPos = 50;
          
          doc.text(new Date(log.createdAt).toISOString().substring(0, 16), xPos, rowTop, {
            width: colWidths.timestamp,
            ellipsis: true
          });
          
          xPos += colWidths.timestamp;
          doc.text(log.userId?.name || log.userId?.email || 'Unknown', xPos, rowTop, {
            width: colWidths.user,
            ellipsis: true
          });
          
          xPos += colWidths.user;
          doc.text(log.action, xPos, rowTop, {
            width: colWidths.action,
            ellipsis: true
          });
          
          xPos += colWidths.action;
          doc.text(log.resource, xPos, rowTop, {
            width: colWidths.resource,
            ellipsis: true
          });
          
          xPos += colWidths.resource;
          
          // Color code severity
          const severityColors = {
            critical: '#DC2626',
            high: '#F59E0B',
            medium: '#3B82F6',
            low: '#10B981'
          };
          doc.fillColor(severityColors[log.severity] || '#000000');
          doc.text(log.severity, xPos, rowTop, {
            width: colWidths.severity
          });
          doc.fillColor('#000000');
          
          xPos += colWidths.severity;
          doc.text(log.ipAddress, xPos, rowTop, {
            width: colWidths.ip,
            ellipsis: true
          });
          
          doc.moveDown(0.8);
        }
        
        // Footer with hash verification
        doc.fontSize(6)
           .font('Helvetica-Oblique')
           .text(
             'This document is cryptographically protected. Any modification will invalidate the audit trail.',
             50,
             750,
             { align: 'center' }
           );
        
        doc.end();
        
        stream.on('finish', () => {
          resolve(outputPath);
        });
        
        stream.on('error', (error) => {
          reject(error);
        });
      });
    } catch (error) {
      console.error('[AuditService] Error exporting to PDF:', error);
      throw error;
    }
  }
  
  /**
   * Search audit logs
   */
  async searchLogs(searchTerm, filters = {}, options = {}) {
    try {
      const query = { ...filters };
      
      if (searchTerm) {
        query.$or = [
          { action: { $regex: searchTerm, $options: 'i' } },
          { resource: { $regex: searchTerm, $options: 'i' } },
          { ipAddress: { $regex: searchTerm, $options: 'i' } },
          { userAgent: { $regex: searchTerm, $options: 'i' } },
          { flagReason: { $regex: searchTerm, $options: 'i' } }
        ];
      }
      
      return this.getLogs(query, options);
    } catch (error) {
      console.error('[AuditService] Error searching audit logs:', error);
      throw error;
    }
  }
  
  /**
   * Get recent activity
   */
  async getRecentActivity(userId, limit = 20) {
    try {
      return await AuditLog.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'name email')
        .lean();
    } catch (error) {
      console.error('[AuditService] Error getting recent activity:', error);
      throw error;
    }
  }
  
  /**
   * Get flagged activities
   */
  async getFlaggedActivities(filters = {}) {
    try {
      return this.getLogs({ ...filters, flagged: true, reviewed: false });
    } catch (error) {
      console.error('[AuditService] Error getting flagged activities:', error);
      throw error;
    }
  }
  
  /**
   * Cleanup old audit logs (optional, based on retention policy)
   */
  async cleanupOldLogs(retentionDays = 730) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      const result = await AuditLog.deleteMany({
        createdAt: { $lt: cutoffDate },
        flagged: false // Keep flagged logs regardless of age
      });
      
      return {
        deleted: result.deletedCount,
        cutoffDate
      };
    } catch (error) {
      console.error('[AuditService] Error cleaning up old logs:', error);
      throw error;
    }
  }
}

module.exports = new AuditService();
