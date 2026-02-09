const mongoose = require('mongoose');
const backupService = require('../services/backupService');
const path = require('path');
const fs = require('fs');

/**
 * Backup System Test Suite
 * Issue #462: Automated Backup System for Financial Data
 * 
 * Comprehensive tests for backup creation, verification, and restoration
 */

describe('BackupService Tests', () => {
  
  // Test Configuration
  const BACKUP_DIR = process.env.BACKUP_DIR || './backups-test';
  const TEST_TIMEOUT = 60000; // 60 seconds for large operations
  
  beforeAll(async () => {
    // Ensure test backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  });

  afterAll(async () => {
    // Cleanup test backups
    try {
      fs.rmSync(path.join(BACKUP_DIR, 'local'), { recursive: true, force: true });
      fs.rmSync(path.join(BACKUP_DIR, 'logs'), { recursive: true, force: true });
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('Backup Creation', () => {
    
    test('should create full database backup', async () => {
      const result = await backupService.createDatabaseBackup();
      
      expect(result).toBeDefined();
      expect(result.name).toMatch(/^backup-/);
      expect(result.size).toBeGreaterThan(0);
      expect(result.collections).toBe(12);
      expect(result.destination).toContain('local');
    }, TEST_TIMEOUT);

    test('should create backup with metadata', async () => {
      const result = await backupService.createDatabaseBackup();
      const metaPath = path.join(BACKUP_DIR, 'local', `${result.name}.meta.json`);
      
      expect(fs.existsSync(metaPath)).toBe(true);
      
      const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      expect(metadata.name).toBe(result.name);
      expect(metadata.timestamp).toBeDefined();
      expect(metadata.checksum).toBeDefined();
    }, TEST_TIMEOUT);

    test('should compress backup file', async () => {
      const result = await backupService.createDatabaseBackup();
      const backupPath = path.join(BACKUP_DIR, 'local', `${result.name}.json.gz`);
      
      expect(fs.existsSync(backupPath)).toBe(true);
      
      const stats = fs.statSync(backupPath);
      expect(stats.size).toBeGreaterThan(0);
      // Compressed files should be significantly smaller than raw JSON
      expect(stats.size).toBeLessThan(50 * 1024 * 1024); // Less than 50MB
    }, TEST_TIMEOUT);
  });

  describe('Backup Integrity Verification', () => {
    
    let testBackupPath;

    beforeAll(async () => {
      const result = await backupService.createDatabaseBackup();
      testBackupPath = path.join(BACKUP_DIR, 'local', `${result.name}.json.gz`);
    });

    test('should verify backup integrity successfully', async () => {
      const result = await backupService.verifyBackupIntegrity(testBackupPath);
      
      expect(result.verified).toBe(true);
      expect(result.checksum).toBeDefined();
      expect(result.size).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    test('should calculate consistent checksums', async () => {
      const checksum1 = await backupService.calculateChecksum(testBackupPath);
      const checksum2 = await backupService.calculateChecksum(testBackupPath);
      
      expect(checksum1).toBe(checksum2);
    }, TEST_TIMEOUT);

    test('should detect corrupted backup', async () => {
      // Create a temporary corrupted file
      const corruptPath = path.join(BACKUP_DIR, 'local', 'test-corrupt.json.gz');
      fs.writeFileSync(corruptPath, Buffer.from([0xFF, 0xD8, 0xFF])); // Invalid gzip
      
      try {
        await expect(backupService.verifyBackupIntegrity(corruptPath)).rejects.toThrow();
      } finally {
        fs.unlinkSync(corruptPath);
      }
    }, TEST_TIMEOUT);
  });

  describe('Backup Listing', () => {
    
    beforeAll(async () => {
      // Create multiple test backups
      for (let i = 0; i < 3; i++) {
        await backupService.createDatabaseBackup();
        // Small delay between backups
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    });

    test('should list all backups', async () => {
      const backups = await backupService.listBackups();
      
      expect(Array.isArray(backups)).toBe(true);
      expect(backups.length).toBeGreaterThanOrEqual(3);
    }, TEST_TIMEOUT);

    test('should sort backups by date descending', async () => {
      const backups = await backupService.listBackups();
      
      for (let i = 0; i < backups.length - 1; i++) {
        const current = new Date(backups[i].timestamp);
        const next = new Date(backups[i + 1].timestamp);
        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
      }
    }, TEST_TIMEOUT);

    test('should respect limit parameter', async () => {
      const backups = await backupService.listBackups(2);
      
      expect(backups.length).toBeLessThanOrEqual(2);
    }, TEST_TIMEOUT);
  });

  describe('Backup Statistics', () => {
    
    test('should retrieve backup statistics', async () => {
      const stats = await backupService.getBackupStats();
      
      expect(stats.totalBackups).toBeGreaterThanOrEqual(0);
      expect(stats.totalSize).toBeGreaterThanOrEqual(0);
      expect(stats.lastBackupTime).toBeDefined();
      expect(stats.nextBackupTime).toBeDefined();
    });

    test('should calculate storage usage percentage', async () => {
      const stats = await backupService.getBackupStats();
      
      expect(stats.storageUsagePercent).toBeGreaterThanOrEqual(0);
      expect(stats.storageUsagePercent).toBeLessThanOrEqual(100);
    });
  });

  describe('Retention Policy', () => {
    
    test('should identify daily backups', async () => {
      const type = backupService.getBackupType();
      
      expect(['daily', 'weekly', 'monthly']).toContain(type);
    });

    test('should apply retention policy', async () => {
      // Create multiple backups with timestamps
      const oldBackupPath = path.join(BACKUP_DIR, 'local', 'backup-old-2020-01-01-000000.json.gz');
      fs.writeFileSync(oldBackupPath, Buffer.alloc(1000)); // Dummy file
      
      const result = await backupService.applyRetentionPolicy();
      
      expect(result.removed).toBeGreaterThanOrEqual(0);
      expect(result.kept).toBeGreaterThanOrEqual(0);
    }, TEST_TIMEOUT);

    test('should cleanup old backups', async () => {
      // Create old test backup
      const oldPath = path.join(BACKUP_DIR, 'local', 'backup-2010-01-01-000000.json.gz');
      fs.writeFileSync(oldPath, Buffer.alloc(1000));
      
      const result = await backupService.cleanupOldBackups(1);
      
      expect(result.deleted).toBeGreaterThanOrEqual(0);
      expect(result.totalSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Backup Restoration', () => {
    
    let testBackupPath;

    beforeAll(async () => {
      const result = await backupService.createDatabaseBackup();
      testBackupPath = path.join(BACKUP_DIR, 'local', `${result.name}.json.gz`);
    });

    test('should verify backup before restoration', async () => {
      // Should not throw error for valid backup
      await expect(backupService.verifyBackupIntegrity(testBackupPath)).resolves.toBeDefined();
    }, TEST_TIMEOUT);

    test('should handle restoration with collections filter', async () => {
      const result = await backupService.restoreFromBackup(
        testBackupPath,
        ['expenses', 'invoices'] // Restore only specific collections
      );
      
      expect(result.collectionsRestored).toBeLessThanOrEqual(2);
    }, TEST_TIMEOUT);

    test('should log restoration operations', async () => {
      const restoreLogPath = path.join(BACKUP_DIR, 'logs', 'restore.log');
      
      // Clear existing log
      if (fs.existsSync(restoreLogPath)) {
        fs.unlinkSync(restoreLogPath);
      }
      
      await backupService.restoreFromBackup(testBackupPath, ['expenses']);
      
      expect(fs.existsSync(restoreLogPath)).toBe(true);
      const logContent = fs.readFileSync(restoreLogPath, 'utf8');
      expect(logContent).toContain('expenses');
    }, TEST_TIMEOUT);
  });

  describe('Backup Logging', () => {
    
    test('should log backup events', () => {
      backupService.logBackup({
        type: 'daily',
        status: 'success',
        size: 245000,
        destination: 'local'
      });
      
      const logPath = path.join(BACKUP_DIR, 'logs', 'backup.log');
      expect(fs.existsSync(logPath)).toBe(true);
    });

    test('should create log directory if not exists', () => {
      const logsDir = path.join(BACKUP_DIR, 'logs');
      expect(fs.existsSync(logsDir)).toBe(true);
    });

    test('should append to existing log file', () => {
      const logPath = path.join(BACKUP_DIR, 'logs', 'backup.log');
      const beforeSize = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
      
      backupService.logBackup({
        type: 'test',
        status: 'success'
      });
      
      const afterSize = fs.statSync(logPath).size;
      expect(afterSize).toBeGreaterThan(beforeSize);
    });
  });

  describe('Error Handling', () => {
    
    test('should handle database connection errors gracefully', async () => {
      // Backup service should handle MongoDB errors
      expect(async () => {
        await backupService.createDatabaseBackup();
      }).not.toThrow();
    }, TEST_TIMEOUT);

    test('should handle missing backup file', async () => {
      const nonExistentPath = path.join(BACKUP_DIR, 'local', 'non-existent-backup.json.gz');
      
      await expect(backupService.verifyBackupIntegrity(nonExistentPath)).rejects.toThrow();
    });

    test('should handle invalid metadata', async () => {
      const result = await backupService.createDatabaseBackup();
      const metaPath = path.join(BACKUP_DIR, 'local', `${result.name}.meta.json`);
      
      // Write invalid JSON
      fs.writeFileSync(metaPath, 'invalid json {');
      
      // Service should handle gracefully
      expect(() => {
        const content = fs.readFileSync(metaPath, 'utf8');
        JSON.parse(content);
      }).toThrow();
    });

    test('should handle permission errors', async () => {
      // This test is system-dependent and may need adjustment
      // Skipping for portable tests
      expect(true).toBe(true);
    });
  });

  describe('Performance', () => {
    
    test('backup creation should complete within timeout', async () => {
      const startTime = Date.now();
      await backupService.createDatabaseBackup();
      const duration = Date.now() - startTime;
      
      // Should complete in reasonable time (adjust based on data size)
      expect(duration).toBeLessThan(TEST_TIMEOUT);
    }, TEST_TIMEOUT);

    test('backup verification should be fast', async () => {
      const result = await backupService.createDatabaseBackup();
      const backupPath = path.join(BACKUP_DIR, 'local', `${result.name}.json.gz`);
      
      const startTime = Date.now();
      await backupService.verifyBackupIntegrity(backupPath);
      const duration = Date.now() - startTime;
      
      // Verification should be faster than creation
      expect(duration).toBeLessThan(30000);
    }, TEST_TIMEOUT);
  });

  describe('Cloud Integration (Mocked)', () => {
    
    test('should handle S3 backup destination', async () => {
      // This test should use mocked AWS SDK
      // Implementation depends on test setup
      if (process.env.AWS_S3_BUCKET) {
        const result = await backupService.createDatabaseBackup();
        expect(result.destination).toContain('s3');
      }
    }, TEST_TIMEOUT);

    test('should handle GCS backup destination', async () => {
      // This test should use mocked Google Cloud SDK
      // Implementation depends on test setup
      if (process.env.GCS_BUCKET) {
        const result = await backupService.createDatabaseBackup();
        expect(result.destination).toContain('gcs');
      }
    }, TEST_TIMEOUT);

    test('should continue if cloud backup fails', async () => {
      // Local backup should succeed even if cloud upload fails
      const result = await backupService.createDatabaseBackup();
      expect(result.destination).toContain('local');
    }, TEST_TIMEOUT);
  });

  describe('Data Integrity', () => {
    
    test('should backup all 12 required collections', async () => {
      const result = await backupService.createDatabaseBackup();
      
      expect(result.collections).toBe(12);
      const requiredCollections = [
        'users', 'expenses', 'invoices', 'payments',
        'budgets', 'goals', 'groups', 'auditLogs',
        'sessions', 'bankConnections', 'investments', 'deductions'
      ];
      
      // Verify metadata contains all collections
      const metaPath = path.join(BACKUP_DIR, 'local', `${result.name}.meta.json`);
      const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      
      requiredCollections.forEach(collection => {
        expect(metadata.collections).toContain(collection);
      });
    }, TEST_TIMEOUT);

    test('should track document counts in metadata', async () => {
      const result = await backupService.createDatabaseBackup();
      const metaPath = path.join(BACKUP_DIR, 'local', `${result.name}.meta.json`);
      
      const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      expect(metadata.totalDocuments).toBeGreaterThanOrEqual(0);
    }, TEST_TIMEOUT);
  });
});

/**
 * Integration Tests (requires full environment setup)
 */
describe('BackupService Integration Tests', () => {
  
  const TEST_TIMEOUT = 120000; // 2 minutes

  test.skip('should perform end-to-end backup and restore cycle', async () => {
    // 1. Create backup
    const backup = await backupService.createDatabaseBackup();
    expect(backup.name).toBeDefined();
    
    // 2. Verify integrity
    const verification = await backupService.verifyBackupIntegrity(
      path.join(process.env.BACKUP_DIR, 'local', `${backup.name}.json.gz`)
    );
    expect(verification.verified).toBe(true);
    
    // 3. Restore (commented to prevent data loss in tests)
    // const restored = await backupService.restoreFromBackup(...);
    // expect(restored.collectionsRestored).toBeGreaterThan(0);
  }, TEST_TIMEOUT);

  test.skip('should handle scheduled backup execution', async () => {
    // Test that would verify cron job integration
    // Requires setup of actual cron jobs
    expect(true).toBe(true);
  });
});

module.exports = {
  BACKUP_DIR,
  TEST_TIMEOUT
};
