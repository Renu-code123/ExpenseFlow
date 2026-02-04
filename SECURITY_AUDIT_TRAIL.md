# 🔐 Enterprise-Grade Security Audit Trail & Forensics Engine

## Overview

The Security Audit Trail provides comprehensive tracking and forensics capabilities for all state-changing operations in ExpenseFlow. Built with blockchain-inspired cryptographic hash chaining, this system ensures tamper-proof audit logs, suspicious activity detection, and forensic analysis capabilities.

## Architecture

### Components

1. **AuditLog Model** (`models/AuditLog.js`)
   - Centralized audit log storage
   - Cryptographic hash chaining for integrity
   - Workspace and user context tracking

2. **Audit Middleware** (`middleware/auditMiddleware.js`)
   - Automatic interception of all state-changing requests
   - Non-blocking async log creation
   - Request/response state capture

3. **Audit Service** (`services/auditService.js`)
   - Business logic for audit operations
   - Suspicious activity detection algorithms
   - PDF export with document protection
   - Blockchain-style chain integrity verification

4. **Audit Routes** (`routes/audit.js`)
   - RESTful API for audit trail access
   - Admin review and flagging workflows
   - Search and filtering capabilities

5. **Security Dashboard** (`public/security-dashboard.html`)
   - Real-time audit log visualization
   - Diff viewer for state changes
   - Chain integrity verification UI
   - Protected PDF export

## Features

### 1. Automatic Audit Logging

All state-changing operations (POST, PUT, PATCH, DELETE) are automatically logged with:
- **Timestamp**: Precise capture time
- **User Context**: Who performed the action
- **Action Type**: Create, update, delete, bulk operations
- **Resource**: What was affected (expense, budget, goal, etc.)
- **IP Address**: Client location tracking
- **User Agent**: Browser/device information
- **State Delta**: Before/after comparison
- **Severity Level**: Critical, high, medium, low

```javascript
// Automatic logging - no code changes needed
app.use(AuditMiddleware.auditInterceptor());
```

### 2. Cryptographic Hash Chaining

Each audit log is linked to the previous log via SHA-256 hash, creating a blockchain-style integrity chain:

```
Log 1: hash(data1)
Log 2: hash(data2 + previousHash1)
Log 3: hash(data3 + previousHash2)
```

**Benefits:**
- Tamper detection: Any modification breaks the chain
- Chronological ordering: Ensures log sequence integrity
- Forensic validation: Verify entire audit history

### 3. Suspicious Activity Detection

Real-time pattern detection algorithms identify:

| Pattern | Threshold | Severity |
|---------|-----------|----------|
| Rapid Deletes | ≥5 in 5 minutes | Critical |
| Rapid Updates | ≥10 in 5 minutes | High |
| Multiple IPs | ≥3 different IPs | Critical |
| High Volume | ≥20 operations | Medium |

**Auto-flagging:**
- Suspicious logs automatically flagged for review
- Reason captured in `flagReason` field
- Admin notifications (console warnings)

### 4. State Change Tracking

Delta calculation captures exact changes:

```json
{
  "delta": {
    "amount": {
      "old": 100,
      "new": 150
    },
    "category": {
      "old": "Food",
      "new": "Entertainment"
    }
  }
}
```

### 5. Protected PDF Export

Generate tamper-proof audit reports:
- **Document Protection**: No copy, modify, or annotate permissions
- **Formatted Tables**: Color-coded severity levels
- **Metadata**: Export timestamp, user, filters
- **Cryptographic Footer**: Warning about chain integrity

```javascript
// Export last 30 days
POST /api/audit/export/pdf
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "severity": "critical"
}
```

### 6. Admin Review Workflow

**Flagging:**
```javascript
POST /api/audit/flag/{logId}
{
  "reason": "Unusual bulk delete operation"
}
```

**Review:**
```javascript
POST /api/audit/review/{logId}
{
  "notes": "Verified with user - legitimate cleanup"
}
```

### 7. Chain Integrity Verification

Verify blockchain-style audit chain:

```javascript
GET /api/audit/verify-chain?startDate=2024-01-01&endDate=2024-01-31

Response:
{
  "total": 1250,
  "verified": 1250,
  "failed": 0,
  "chainBroken": false,
  "brokenLinks": []
}
```

## API Reference

### GET /api/audit/logs

Get filtered audit logs with pagination.

**Query Parameters:**
- `resource` (string): Filter by resource type (expense, budget, goal, etc.)
- `action` (string): Filter by action (create, update, delete, etc.)
- `severity` (string): Filter by severity (critical, high, medium, low)
- `flagged` (boolean): Filter flagged logs
- `reviewed` (boolean): Filter reviewed logs
- `startDate` (date): Start date filter
- `endDate` (date): End date filter
- `page` (number): Page number (default: 1)
- `limit` (number): Results per page (default: 50)
- `sortBy` (string): Sort field (default: createdAt)
- `sortOrder` (string): Sort order (asc/desc, default: desc)

**Response:**
```json
{
  "logs": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalLogs": 500,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### GET /api/audit/resource/:resource/:resourceId

Get complete audit trail for a specific resource.

**Example:**
```
GET /api/audit/resource/expense/507f1f77bcf86cd799439011
```

### GET /api/audit/suspicious

Detect suspicious activity in real-time.

**Query Parameters:**
- `timeWindow` (number): Time window in minutes (default: 5)

**Response:**
```json
{
  "detected": true,
  "reasons": [
    "Rapid deletes detected (6 in 5 minutes)",
    "Multiple IP addresses detected (4 unique IPs)"
  ],
  "severity": "critical"
}
```

### POST /api/audit/flag/:logId

Flag an audit log for review.

**Body:**
```json
{
  "reason": "Unusual behavior detected"
}
```

### POST /api/audit/review/:logId

Review a flagged audit log.

**Body:**
```json
{
  "notes": "Verified with user - legitimate action"
}
```

### GET /api/audit/verify-chain

Verify audit chain integrity.

**Query Parameters:**
- `startDate` (date): Start date for verification
- `endDate` (date): End date for verification

### GET /api/audit/statistics

Get aggregated audit statistics.

**Query Parameters:**
- `startDate` (date): Start date (default: 30 days ago)
- `endDate` (date): End date (default: now)

**Response:**
```json
{
  "totalLogs": 1250,
  "byAction": {
    "create": 500,
    "update": 400,
    "delete": 350
  },
  "byResource": {
    "expense": 600,
    "budget": 350,
    "goal": 300
  },
  "criticalCount": 25,
  "highCount": 150,
  "flaggedCount": 15,
  "reviewedCount": 10,
  "uniqueResources": 250,
  "uniqueIPs": 12
}
```

### POST /api/audit/export/pdf

Export audit logs to protected PDF.

**Body:**
```json
{
  "resource": "expense",
  "severity": "critical",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

**Response:** Binary PDF file download

### GET /api/audit/search

Full-text search across audit logs.

**Query Parameters:**
- `q` (string): Search term (required)
- `page` (number): Page number
- `limit` (number): Results per page
- `sortBy` (string): Sort field
- `sortOrder` (string): Sort order

### GET /api/audit/recent

Get recent audit activity.

**Query Parameters:**
- `limit` (number): Number of logs (default: 20)

### GET /api/audit/flagged

Get all flagged activities.

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Results per page

## Security Features

### 1. Hash Chain Integrity

Each log contains:
```javascript
{
  hash: sha256(userId + action + resource + timestamp + previousHash),
  previousHash: "abc123..."
}
```

Verification:
1. Retrieve logs chronologically
2. For each log, recalculate hash
3. Compare calculated vs stored hash
4. Verify previousHash matches prior log
5. Report any breaks in the chain

### 2. Non-Blocking Performance

Audit logging uses `setImmediate()` for async processing:
- No impact on request latency
- Background log creation
- Error handling without request failure

### 3. Automatic State Capture

Middleware captures:
- **Before State**: Database query before update
- **After State**: Response data after update
- **Delta Calculation**: Precise field-level changes

### 4. Severity Assignment

Automatic severity levels:

| Severity | Actions |
|----------|---------|
| **Critical** | bulk_delete, permission_change, security events |
| **High** | delete, bulk operations, DELETE method |
| **Medium** | update, PUT, PATCH methods |
| **Low** | create, POST method, read operations |

## Usage Examples

### 1. Track Expense Modifications

```javascript
// Automatic tracking - just update as normal
await Expense.findByIdAndUpdate(id, { amount: 150 });

// Audit log automatically created:
{
  action: "update",
  resource: "expense",
  resourceId: "507f1f77bcf86cd799439011",
  delta: { amount: { old: 100, new: 150 } },
  severity: "medium"
}
```

### 2. Monitor Bulk Deletions

```javascript
// This triggers suspicious activity detection
await Expense.deleteMany({ userId, category: "Food" });

// Audit log with auto-flagging:
{
  action: "bulk_delete",
  resource: "expense",
  severity: "critical",
  flagged: true,
  flagReason: "Rapid deletes detected (6 in 5 minutes)"
}
```

### 3. Export Compliance Report

```javascript
// Generate PDF for regulatory compliance
const filters = {
  startDate: "2024-01-01",
  endDate: "2024-12-31",
  severity: "critical"
};

await auditService.exportToPDF(filters, "./reports/audit-2024.pdf");
```

### 4. Verify Data Integrity

```javascript
// Verify no tampering occurred
const result = await auditService.verifyChainIntegrity(
  userId,
  new Date("2024-01-01"),
  new Date("2024-12-31")
);

if (result.chainBroken) {
  console.error("Audit chain compromised!", result.brokenLinks);
}
```

## Frontend Integration

### Security Dashboard

Navigate to `/security-dashboard.html` for:
- **Real-time Audit Viewer**: Live log feed
- **Advanced Filters**: Resource, action, severity, date range
- **Diff Visualization**: Color-coded state changes
- **Flagging UI**: One-click suspicious activity marking
- **Chain Verification**: Integrity check button
- **PDF Export**: Download protected reports

### Dashboard Features

1. **Statistics Cards**
   - Total audit logs
   - Critical events count
   - Flagged activities
   - Unique resources

2. **Chain Integrity Panel**
   - Verify button triggers blockchain-style check
   - Visual status (verified/broken)
   - Broken link details

3. **Audit Table**
   - Sortable columns
   - Severity badges
   - Flagged indicators
   - Click-to-expand details

4. **Detail Modal**
   - Full log information
   - Diff viewer with before/after
   - Flag/review actions
   - Cryptographic hash display

## Performance Considerations

### 1. Async Logging

All audit operations use `setImmediate()`:
```javascript
setImmediate(async () => {
  await createAuditLog(logData);
});
```

**Benefits:**
- Zero request latency impact
- Non-blocking I/O
- Graceful error handling

### 2. Indexed Queries

AuditLog model indexes:
- `userId` + `createdAt` (compound)
- `workspaceId`
- `resource` + `resourceId`
- `flagged`
- `hash`

### 3. Pagination

All list endpoints support pagination:
- Default: 50 logs per page
- Maximum: 100 logs per page
- Cursor-based for large datasets

### 4. Retention Policy

Automatic cleanup:
```javascript
// Delete logs older than 2 years (except flagged)
await auditService.cleanupOldLogs(730);
```

## Compliance & Standards

### SOC 2 Type II

- **Logging & Monitoring**: All changes tracked
- **Change Management**: Delta tracking
- **Incident Response**: Suspicious activity detection
- **Data Integrity**: Cryptographic verification

### GDPR

- **Right to Audit**: Complete user activity trail
- **Data Portability**: PDF export capability
- **Retention Policies**: Configurable cleanup
- **Accountability**: User attribution

### ISO 27001

- **A.12.4.1 Event Logging**: Comprehensive audit trail
- **A.12.4.2 Logging Protection**: Hash chain integrity
- **A.12.4.3 Administrator Logs**: All admin actions tracked
- **A.12.4.4 Clock Synchronization**: Precise timestamps

## Troubleshooting

### Issue: Logs Not Appearing

**Check:**
1. Middleware registered before routes in `server.js`
2. Auth middleware populating `req.user`
3. Database connection established

```javascript
// Correct order in server.js
app.use(auth.protect);
app.use(AuditMiddleware.auditInterceptor());
app.use('/api/expenses', expenseRoutes);
```

### Issue: Chain Verification Failed

**Causes:**
1. Manual database modification
2. System clock changes
3. Concurrent log creation race condition

**Resolution:**
- Check `brokenLinks` in verification response
- Review logs around broken link timestamps
- Investigate database access patterns

### Issue: High Database Load

**Optimization:**
1. Increase retention cleanup frequency
2. Archive old logs to separate collection
3. Implement log aggregation for statistics

```javascript
// Archive logs older than 1 year
db.auditLogs.find({ createdAt: { $lt: oneYearAgo }})
  .forEach(log => {
    db.auditLogsArchive.insert(log);
    db.auditLogs.remove({ _id: log._id });
  });
```

## Best Practices

### 1. Regular Verification

Schedule automated chain verification:
```javascript
// Daily integrity check
cron.schedule('0 2 * * *', async () => {
  const result = await auditService.verifyChainIntegrity();
  if (result.chainBroken) {
    emailService.sendAlert('Audit chain compromised!', result);
  }
});
```

### 2. Review Flagged Logs

Establish review SLA:
- Critical flags: 1 hour
- High flags: 24 hours
- Medium flags: 1 week

### 3. Export Archives

Regular compliance exports:
```javascript
// Monthly compliance report
const lastMonth = {
  startDate: moment().subtract(1, 'month').startOf('month'),
  endDate: moment().subtract(1, 'month').endOf('month')
};

await auditService.exportToPDF(
  lastMonth,
  `./compliance/audit-${moment().format('YYYY-MM')}.pdf`
);
```

### 4. Monitor Statistics

Track trends over time:
- Increasing critical events: Potential security issue
- Decreasing log volume: Missing audit capture
- High flagged ratio: Tune detection thresholds

## Future Enhancements

### Planned Features

1. **SIEM Integration**
   - Splunk connector
   - ELK Stack export
   - Real-time streaming

2. **ML Anomaly Detection**
   - User behavior profiling
   - Anomalous pattern detection
   - Predictive risk scoring

3. **Advanced Forensics**
   - Geolocation tracking
   - Device fingerprinting
   - Session correlation

4. **Compliance Reports**
   - SOC 2 automated reports
   - GDPR data subject requests
   - HIPAA audit trails

## Support

For issues or questions:
- GitHub Issues: [ExpenseFlow/issues](https://github.com/Renu-code123/ExpenseFlow/issues)
- Security Concerns: Email security@expenseflow.com
- Documentation: [docs.expenseflow.com](https://docs.expenseflow.com)

---

**Built with Enterprise Security in Mind** 🔐

Last Updated: January 2025
Version: 1.0.0
