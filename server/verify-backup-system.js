#!/usr/bin/env node

/**
 * Backup System Verification Script
 * Issue #462: No Automated Backup for Financial Data
 * 
 * Verifies all backup components are properly configured
 */

const path = require('path');
const fs = require('fs');

console.log('\n========================================');
console.log('  Backup System Verification');
console.log('========================================\n');

let errors = [];
let warnings = [];
let checks = [];

// Check 1: Files exist
console.log('Checking files...');
const requiredFiles = [
  'services/backupService.js',
  'services/backupRecoveryService.js',
  'routes/backups.js',
  'services/cronJobs.js',
  '.env.example'
];

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✓ ${file}`);
    checks.push(`✓ ${file} exists`);
  } else {
    console.log(`  ✗ ${file}`);
    errors.push(`Missing file: ${file}`);
  }
});

// Check 2: Backup directories
console.log('\nChecking backup directories...');
const backupDir = process.env.BACKUP_DIR || './backups';
const localDir = path.join(backupDir, 'local');
const logsDir = path.join(backupDir, 'logs');

if (!fs.existsSync(backupDir)) {
  console.log(`  ⚠ Creating backup directory: ${backupDir}`);
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`  ✓ Backup directory created`);
  } catch (err) {
    errors.push(`Failed to create backup directory: ${err.message}`);
  }
}

if (!fs.existsSync(localDir)) {
  console.log(`  ⚠ Creating local backup directory: ${localDir}`);
  try {
    fs.mkdirSync(localDir, { recursive: true });
    console.log(`  ✓ Local backup directory created`);
  } catch (err) {
    errors.push(`Failed to create local backup directory: ${err.message}`);
  }
}

if (!fs.existsSync(logsDir)) {
  console.log(`  ⚠ Creating logs directory: ${logsDir}`);
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log(`  ✓ Logs directory created`);
  } catch (err) {
    errors.push(`Failed to create logs directory: ${err.message}`);
  }
}

// Check 3: Module imports
console.log('\nChecking module imports...');
try {
  const backupService = require('./services/backupService');
  console.log(`  ✓ Backup service loaded`);
  checks.push('✓ Backup service loads successfully');
} catch (err) {
  errors.push(`Failed to load backup service: ${err.message}`);
  console.log(`  ✗ Backup service: ${err.message}`);
}

try {
  const recoveryService = require('./services/backupRecoveryService');
  console.log(`  ✓ Recovery service loaded`);
  checks.push('✓ Recovery service loads successfully');
} catch (err) {
  errors.push(`Failed to load recovery service: ${err.message}`);
  console.log(`  ✗ Recovery service: ${err.message}`);
}

try {
  const backupRoutes = require('./routes/backups');
  console.log(`  ✓ Backup routes loaded`);
  checks.push('✓ Backup routes load successfully');
} catch (err) {
  errors.push(`Failed to load backup routes: ${err.message}`);
  console.log(`  ✗ Backup routes: ${err.message}`);
}

try {
  const cronJobs = require('./services/cronJobs');
  console.log(`  ✓ Cron jobs loaded`);
  checks.push('✓ Cron jobs load successfully');
} catch (err) {
  errors.push(`Failed to load cron jobs: ${err.message}`);
  console.log(`  ✗ Cron jobs: ${err.message}`);
}

// Check 4: Environment configuration
console.log('\nChecking environment configuration...');
const envFile = path.join(__dirname, '.env');
const envExampleFile = path.join(__dirname, '.env.example');

if (fs.existsSync(envFile)) {
  console.log(`  ✓ .env file exists`);
  checks.push('✓ .env configuration file exists');
} else {
  console.log(`  ⚠ .env file not found (create from .env.example)`);
  warnings.push('No .env file - backup will use defaults');
}

if (fs.existsSync(envExampleFile)) {
  console.log(`  ✓ .env.example found`);
  checks.push('✓ .env.example template exists');
} else {
  warnings.push('Missing .env.example template');
  console.log(`  ⚠ .env.example not found`);
}

// Check 5: Configuration values
console.log('\nConfiguration values:');
const backupDirValue = process.env.BACKUP_DIR || './backups';
console.log(`  BACKUP_DIR: ${backupDirValue}`);
console.log(`  BACKUP_TO_S3: ${process.env.BACKUP_TO_S3 || 'false'}`);
console.log(`  BACKUP_TO_GCS: ${process.env.BACKUP_TO_GCS || 'false'}`);
console.log(`  BACKUP_DAILY_RETENTION_DAYS: ${process.env.BACKUP_DAILY_RETENTION_DAYS || '7'}`);
console.log(`  BACKUP_WEEKLY_RETENTION_DAYS: ${process.env.BACKUP_WEEKLY_RETENTION_DAYS || '28'}`);

// Summary
console.log('\n========================================');
console.log('  Verification Summary');
console.log('========================================\n');

if (checks.length > 0) {
  console.log('Passed Checks:');
  checks.forEach(check => console.log(`  ${check}`));
}

if (warnings.length > 0) {
  console.log('\n⚠ Warnings:');
  warnings.forEach(warning => console.log(`  ⚠ ${warning}`));
}

if (errors.length > 0) {
  console.log('\n✗ Errors:');
  errors.forEach(error => console.log(`  ✗ ${error}`));
  console.log('\n❌ Verification FAILED');
  process.exit(1);
} else {
  console.log('\n✅ All checks passed! Backup system is ready.');
  console.log('\nNext steps:');
  console.log('  1. Copy .env.example to .env and configure');
  console.log('  2. Update MONGODB_URI in .env');
  console.log('  3. Configure cloud storage if desired (S3/GCS/Azure)');
  console.log('  4. Start the server: npm start');
  console.log('  5. Backups will run automatically on schedule');
  console.log('  6. Use CLI recovery tool: node services/backupRecoveryService.js');
  console.log('\nAPI Endpoints:');
  console.log('  GET    /api/backups                 - List all backups');
  console.log('  GET    /api/backups/stats            - View statistics');
  console.log('  POST   /api/backups/create           - Create manual backup');
  console.log('  POST   /api/backups/:name/verify     - Verify integrity');
  console.log('  POST   /api/backups/:name/restore    - Restore from backup');
  process.exit(0);
}
