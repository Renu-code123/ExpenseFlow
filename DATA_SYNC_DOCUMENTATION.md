# Differential Data Synchronization & Conflict Resolution Pipeline

## 🚀 Overview
Issue #660 implements a multi-master synchronization infrastructure. Instead of simple data overwrites, the system now tracks individual mutations (diffs), manages versioning across multiple devices, and uses sophisticated conflict resolution strategies (LWW and MERGE) to ensure data integrity for offline-capable clients.

## 🏗️ Technical Architecture

### 1. Differential Tracking (`models/SyncLog.js`)
Every successful mutation (CREATE, UPDATE, DELETE) is captured by a **SyncInterceptor** and recorded in the `SyncLog`.
- **Versioned History**: Each user's mutations are strictly ordered by version numbers.
- **Efficient Payload**: Only the "changes" (the diff) are stored, minimizing sync bandwidth.
- **Temporal Pruning**: Logs are automatically pruned after 30 days via a background cleanup job.

### 2. Conflict Resolution Logic (`utils/conflictResolver.js`)
When two devices modify the same entity while offline, the system chooses the best resolution:
- **Last-Write-Wins (LWW)**: Uses timestamps to decide which device "won" the race.
- **Multi-Field Merge**: Merges independent field changes (e.g., Device A changed the `amount`, Device B changed the `category` → both are kept).
- **Vector Clocks**: Identifies concurrent edits that cannot be automatically resolved, marking them for manual user intervention in the UI.

### 3. Sync Interceptor Middleware (`middleware/syncInterceptor.js`)
A low-level hook that monitors all `/api/expenses`, `/api/budgets`, and `/api/workspaces` traffic. It automatically transparently logs mutations without requiring changes to existing controller logic.

### 4. Background Maintenance (`jobs/syncCleanup.js`)
A precision-timed worker that runs every Sunday to prune old synchronization logs, ensuring the database remains lean and performant even with millions of mutations.

## 🛠️ API Reference

### `GET /api/sync/delta?v=LAST_VERSION`
Fetches all mutations that occurred since the client's last synchronization.

### `POST /api/sync/push`
Allows a client to push a local change while requesting conflict resolution. Returns the finalized entity or resolution logs.

### `POST /api/sync/delete`
Propagates entity deletions across the sync network using a soft-delete strategy.

## ✅ Implementation Checklist
- [x] Vector clock and version metadata in Core Models.
- [x] SyncLog schema for mutation persistence.
- [x] Interceptor middleware for automatic change capture.
- [x] Conflict resolution utility (LWW/Merge).
- [x] Differential sync API routes.
- [x] Background maintenance job.

## 🧪 Testing
Run the sync engine test suite:
```bash
npm test tests/sync.test.js
```
