const express = require('express');
const router = express.Router();
const backupService = require('../services/backupService');
const auth = require('../middleware/auth');
const { validateRequest } = require('../middleware/inputValidator');
const Joi = require('joi');

/**
 * Backup Management Routes
 * Issue #462: No Automated Backup for Financial Data
 */

// Validation schemas
const backupRestoreSchema = Joi.object({
  backupName: Joi.string().required(),
  collections: Joi.array().items(Joi.string()).optional()
}).unknown(false);

const cleanupSchema = Joi.object({
  retentionDays: Joi.number().min(1).default(30)
}).unknown(false);

/**
 * @route   POST /api/backups/create
 * @desc    Manually trigger a backup
 * @access  Private (Admin only)
 */
router.post('/create', auth, async (req, res) => {
  try {
    // Check if user is admin (implement your admin check)
    if (!req.user?.isAdmin) {
      return res.status(403).json({ 
        error: 'Only administrators can create backups' 
      });
    }

    const result = await backupService.createDatabaseBackup();

    res.status(201).json({
      success: true,
      message: 'Backup created successfully',
      data: result
    });
  } catch (error) {
    console.error('[Backups Route] Create error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/backups
 * @desc    List all available backups
 * @access  Private (Admin only)
 */
router.get('/', auth, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ 
        error: 'Only administrators can view backups' 
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const backups = await backupService.listBackups(limit);

    res.json({
      success: true,
      count: backups.length,
      data: backups
    });
  } catch (error) {
    console.error('[Backups Route] List error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/backups/stats
 * @desc    Get backup statistics
 * @access  Private (Admin only)
 */
router.get('/stats', auth, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ 
        error: 'Only administrators can view backup stats' 
      });
    }

    const stats = await backupService.getBackupStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[Backups Route] Stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/backups/:backupName/verify
 * @desc    Verify backup integrity
 * @access  Private (Admin only)
 */
router.post('/:backupName/verify', auth, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ 
        error: 'Only administrators can verify backups' 
      });
    }

    const path = require('path');
    const backupPath = path.join(
      process.env.BACKUP_DIR || './backups',
      'local',
      `${req.params.backupName}.json.gz`
    );

    const result = await backupService.verifyBackupIntegrity(backupPath);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[Backups Route] Verify error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/backups/:backupName/restore
 * @desc    Restore backup to database
 * @access  Private (Admin only)
 * @warning This is a destructive operation!
 */
router.post('/:backupName/restore', auth, validateRequest(backupRestoreSchema), async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ 
        error: 'Only administrators can restore backups' 
      });
    }

    // Require confirmation header to prevent accidental restores
    const confirmHeader = req.headers['x-confirm-restore'];
    if (confirmHeader !== 'RESTORE_CONFIRMED') {
      return res.status(400).json({
        error: 'Restore confirmation required. Send header: x-confirm-restore: RESTORE_CONFIRMED'
      });
    }

    const path = require('path');
    const backupPath = path.join(
      process.env.BACKUP_DIR || './backups',
      'local',
      `${req.params.backupName}.json.gz`
    );

    const result = await backupService.restoreFromBackup(
      backupPath,
      req.body.collections
    );

    res.json({
      success: true,
      message: 'Backup restored successfully',
      data: result
    });
  } catch (error) {
    console.error('[Backups Route] Restore error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/backups/cleanup
 * @desc    Remove old backups based on retention policy
 * @access  Private (Admin only)
 */
router.delete('/cleanup', auth, validateRequest(cleanupSchema), async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ 
        error: 'Only administrators can cleanup backups' 
      });
    }

    const retentionDays = req.body.retentionDays || 30;
    const result = await backupService.cleanupOldBackups(retentionDays);

    res.json({
      success: true,
      message: `Cleanup completed. ${result.deleted} backups removed.`,
      data: result
    });
  } catch (error) {
    console.error('[Backups Route] Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/backups/apply-retention-policy
 * @desc    Apply automatic retention policy
 * @access  Private (Admin only)
 */
router.post('/apply-retention-policy', auth, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ 
        error: 'Only administrators can manage retention policies' 
      });
    }

    const result = await backupService.applyRetentionPolicy();

    res.json({
      success: true,
      message: 'Retention policy applied',
      data: result
    });
  } catch (error) {
    console.error('[Backups Route] Retention policy error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
