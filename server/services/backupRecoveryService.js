const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

/**
 * Backup Recovery Service
 * Issue #462: No Automated Backup for Financial Data
 * 
 * Provides utilities for:
 * - Listing and viewing backup information
 * - Verifying backup integrity
 * - Restoring from specific backups
 * - Backup management and administration
 */

class BackupRecoveryService {
  constructor(backupDir = process.env.BACKUP_DIR || './backups') {
    this.backupDir = backupDir;
    this.backupService = require('./backupService');
  }

  /**
   * Display interactive backup management menu
   */
  async interactiveMenu() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

    console.log('\n========================================');
    console.log('  ExpenseFlow Backup Recovery System');
    console.log('========================================\n');

    let running = true;
    while (running) {
      console.log('\nOptions:');
      console.log('1. List all backups');
      console.log('2. View backup details');
      console.log('3. Verify backup integrity');
      console.log('4. Restore from backup');
      console.log('5. View backup statistics');
      console.log('6. Cleanup old backups');
      console.log('7. Exit\n');

      const choice = await question('Choose an option (1-7): ');

      try {
        switch (choice) {
          case '1':
            await this.displayBackupsList();
            break;
          case '2':
            await this.displayBackupDetails(question);
            break;
          case '3':
            await this.verifyBackupInteractive(question);
            break;
          case '4':
            await this.restoreBackupInteractive(question);
            break;
          case '5':
            await this.displayBackupStats();
            break;
          case '6':
            await this.cleanupBackupsInteractive(question);
            break;
          case '7':
            running = false;
            console.log('\nGoodbye!');
            break;
          default:
            console.log('Invalid option. Please try again.');
        }
      } catch (error) {
        console.error('\n❌ Error:', error.message);
      }
    }

    rl.close();
  }

  /**
   * Display list of all backups
   */
  async displayBackupsList() {
    try {
      const backups = await this.backupService.listBackups(1000);

      if (backups.length === 0) {
        console.log('\n✗ No backups found.');
        return;
      }

      console.log('\n========== Available Backups ==========\n');
      console.log('Index | Backup Name                          | Type    | Timestamp');
      console.log('------|--------------------------------------|---------|-------------------------------');

      backups.forEach((backup, index) => {
        const timestamp = new Date(backup.timestamp).toLocaleString();
        console.log(
          `${String(index + 1).padEnd(5)} | ${backup.name.padEnd(36)} | ${backup.type.padEnd(7)} | ${timestamp}`
        );
      });

      console.log('\n✓ Total backups: ' + backups.length);
    } catch (error) {
      console.error('Error listing backups:', error.message);
    }
  }

  /**
   * Display detailed information about a specific backup
   */
  async displayBackupDetails(question) {
    try {
      const backups = await this.backupService.listBackups(1000);

      if (backups.length === 0) {
        console.log('\n✗ No backups found.');
        return;
      }

      // Display list
      console.log('\n========== Select Backup ==========\n');
      backups.slice(0, 10).forEach((backup, index) => {
        console.log(`${index + 1}. ${backup.name} (${backup.type}) - ${new Date(backup.timestamp).toLocaleString()}`);
      });

      const indexStr = await question('\nEnter backup index (or press Enter to cancel): ');
      if (!indexStr) return;

      const index = parseInt(indexStr) - 1;
      if (index < 0 || index >= backups.length) {
        console.log('Invalid index.');
        return;
      }

      const backup = backups[index];
      const cols = backup.collections || [];

      console.log('\n========== Backup Details ==========\n');
      console.log(`Name:       ${backup.name}`);
      console.log(`Type:       ${backup.type}`);
      console.log(`Timestamp:  ${new Date(backup.timestamp).toLocaleString()}`);
      console.log(`Collections: ${cols.length}`);
      console.log('\nCollections:');

      cols.forEach(col => {
        console.log(`  - ${col.name.padEnd(20)}: ${col.count} documents`);
      });

      console.log('\n✓ Backup details displayed.');
    } catch (error) {
      console.error('Error displaying backup details:', error.message);
    }
  }

  /**
   * Verify backup integrity interactively
   */
  async verifyBackupInteractive(question) {
    try {
      const backups = await this.backupService.listBackups(1000);

      if (backups.length === 0) {
        console.log('\n✗ No backups found.');
        return;
      }

      console.log('\n========== Verify Backup Integrity ==========\n');
      backups.slice(0, 10).forEach((backup, index) => {
        console.log(`${index + 1}. ${backup.name}`);
      });

      const indexStr = await question('\nEnter backup index to verify: ');
      if (!indexStr) return;

      const index = parseInt(indexStr) - 1;
      if (index < 0 || index >= backups.length) {
        console.log('Invalid index.');
        return;
      }

      const backup = backups[index];
      const backupPath = path.join(
        this.backupDir,
        'local',
        `${backup.name}.json.gz`
      );

      console.log(`\nVerifying: ${backup.name}...`);

      const result = await this.backupService.verifyBackupIntegrity(backupPath);

      if (result.valid) {
        console.log('\n✓ Backup integrity verified successfully!');
        console.log(`  Timestamp: ${result.timestamp}`);
        console.log(`  Checksum: ${result.calculatedChecksum}`);
      } else {
        console.log('\n✗ Backup integrity check failed!');
        if (result.error) {
          console.log(`  Error: ${result.error}`);
        } else {
          console.log('  Checksum mismatch detected.');
          console.log(`  Expected: ${result.storedChecksum}`);
          console.log(`  Got: ${result.calculatedChecksum}`);
        }
      }
    } catch (error) {
      console.error('Error verifying backup:', error.message);
    }
  }

  /**
   * Restore from backup interactively
   */
  async restoreBackupInteractive(question) {
    try {
      const backups = await this.backupService.listBackups(1000);

      if (backups.length === 0) {
        console.log('\n✗ No backups found.');
        return;
      }

      console.log('\n========== Restore from Backup ==========\n');
      console.log('⚠️  WARNING: This operation will restore data to the database.');
      console.log('Make sure you have a backup of your current database!\n');

      backups.slice(0, 10).forEach((backup, index) => {
        console.log(`${index + 1}. ${backup.name} (${backup.type}) - ${new Date(backup.timestamp).toLocaleString()}`);
      });

      const indexStr = await question('\nEnter backup index to restore from: ');
      if (!indexStr) return;

      const index = parseInt(indexStr) - 1;
      if (index < 0 || index >= backups.length) {
        console.log('Invalid index.');
        return;
      }

      const backup = backups[index];

      // Double confirmation
      const confirm1 = await question(
        `\nRestore from "${backup.name}"? Type "confirm" to proceed: `
      );
      if (confirm1 !== 'confirm') {
        console.log('Restore cancelled.');
        return;
      }

      const confirm2 = await question(
        'This action cannot be undone. Type "RESTORE" to confirm: '
      );
      if (confirm2 !== 'RESTORE') {
        console.log('Restore cancelled.');
        return;
      }

      const backupPath = path.join(
        this.backupDir,
        'local',
        `${backup.name}.json.gz`
      );

      console.log('\nVerifying backup integrity before restore...');
      const integrity = await this.backupService.verifyBackupIntegrity(backupPath);

      if (!integrity.valid) {
        console.log('✗ Backup integrity check failed. Restore aborted.');
        console.log(`  Error: ${integrity.error}`);
        return;
      }

      console.log('✓ Backup integrity verified.');
      console.log('\nRestoring from backup...');

      // Ask which collections to restore
      const allCollectionsStr = await question(
        'Restore all collections? (y/n, default: y): '
      );
      const allCollections = allCollectionsStr.toLowerCase() !== 'n';

      let result;
      if (allCollections) {
        result = await this.backupService.restoreFromBackup(backupPath);
      } else {
        const collectionsStr = await question(
          'Enter collection names (comma-separated): '
        );
        const collections = collectionsStr.split(',').map(c => c.trim());
        result = await this.backupService.restoreFromBackup(backupPath, collections);
      }

      console.log('\n✓ Restore completed!');
      console.log('Results:');
      console.log(JSON.stringify(result.results, null, 2));
    } catch (error) {
      console.error('Error restoring backup:', error.message);
    }
  }

  /**
   * Display backup statistics
   */
  async displayBackupStats() {
    try {
      const stats = await this.backupService.getBackupStats();

      if (!stats) {
        console.log('\n✗ Unable to retrieve backup statistics.');
        return;
      }

      console.log('\n========== Backup Statistics ==========\n');
      console.log(`Total Backups:        ${stats.totalBackups}`);
      console.log(`Total Size:           ${stats.totalSizeGB} GB`);
      console.log(`Daily Backups:        ${stats.backupsByType.daily}`);
      console.log(`Weekly Backups:       ${stats.backupsByType.weekly}`);
      console.log(`Monthly Backups:      ${stats.backupsByType.monthly}`);
      console.log(`Latest Backup:        ${stats.latestBackup || 'None'}`);
      console.log('\nRetention Policy:');
      console.log('  - Daily: Keep for 7 days');
      console.log('  - Weekly: Keep for 4 weeks');
      console.log('  - Monthly: Keep indefinitely');
      console.log('\n✓ Statistics displayed.');
    } catch (error) {
      console.error('Error retrieving statistics:', error.message);
    }
  }

  /**
   * Cleanup old backups interactively
   */
  async cleanupBackupsInteractive(question) {
    try {
      console.log('\n========== Cleanup Old Backups ==========\n');
      console.log('Current retention policy:');
      console.log('  - Daily backups: 7 days');
      console.log('  - Weekly backups: 4 weeks (28 days)');
      console.log('  - Monthly backups: indefinite\n');

      const confirm = await question(
        'Apply retention policy cleanup? (y/n): '
      );

      if (confirm.toLowerCase() !== 'y') {
        console.log('Cleanup cancelled.');
        return;
      }

      console.log('\nRunning cleanup...');
      const result = await this.backupService.applyRetentionPolicy();

      console.log('\n✓ Cleanup completed!');
      console.log(`Backups deleted by type:`);
      console.log(`  - Daily: ${result.daily}`);
      console.log(`  - Weekly: ${result.weekly}`);
      console.log(`  - Monthly: 0 (never deleted)`);
    } catch (error) {
      console.error('Error during cleanup:', error.message);
    }
  }

  /**
   * Export backup details to file
   */
  async exportBackupReport(outputFile = 'backup_report.json') {
    try {
      const backups = await this.backupService.listBackups(1000);
      const stats = await this.backupService.getBackupStats();

      const report = {
        generatedAt: new Date().toISOString(),
        summary: {
          totalBackups: stats.totalBackups,
          totalSizeGB: stats.totalSizeGB,
          byType: stats.backupsByType
        },
        backups: backups.map(b => ({
          name: b.name,
          type: b.type,
          timestamp: b.timestamp,
          collections: b.collections
        })),
        retentionPolicy: {
          daily: '7 days',
          weekly: '4 weeks',
          monthly: 'indefinite'
        }
      };

      await fs.writeFile(
        outputFile,
        JSON.stringify(report, null, 2)
      );

      console.log(`✓ Backup report exported to ${outputFile}`);
      return report;
    } catch (error) {
      console.error('Error exporting backup report:', error.message);
      throw error;
    }
  }

  /**
   * Get backup health status
   */
  async getBackupHealth() {
    try {
      const backups = await this.backupService.listBackups(1000);
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Check if there's a recent backup
      const recentBackups = backups.filter(b => new Date(b.timestamp) > oneDayAgo);

      const health = {
        status: 'healthy',
        lastBackup: backups[0],
        recentBackupExists: recentBackups.length > 0,
        totalBackups: backups.length,
        warnings: []
      };

      if (backups.length === 0) {
        health.status = 'critical';
        health.warnings.push('No backups found!');
      } else if (recentBackups.length === 0) {
        health.status = 'warning';
        health.warnings.push('No backup in the last 24 hours');
      }

      if (backups.length < 7) {
        health.warnings.push('Less than 7 daily backups available');
      }

      return health;
    } catch (error) {
      console.error('Error checking backup health:', error.message);
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

// CLI Interface
if (require.main === module) {
  const service = new BackupRecoveryService();
  service.interactiveMenu().catch(console.error);
}

module.exports = BackupRecoveryService;
