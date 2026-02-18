# Distributed Vector-Clock & Field-Level Conflict Resolution

## 🚀 Overview
Issue #705 upgrades the synchronization engine from a primitive "Last-Write-Wins" (LWW) model to a sophisticated **Distributed Consensus Architecture**. It ensures data integrity across multiple offline-capable devices by using Vector Clocks to establish partial ordering and field-level semantic merging.

## 🏗️ Technical Architecture

### 1. Vector Clock Logic (`utils/vectorClockMath.js`)
Unlike timestamps which suffer from clock drift, Vector Clocks track logical time per contributing node (device).
- **Causal Relationship**: Allows the system to determine if an update "Happened-Before" the current state, or if they are "Concurrent" (conflicting).
- **Concurrency**: Defined as `(A not < B) AND (B not < A)`.

### 2. The Conflict Store (`models/SyncConflict.js`)
When concurrent edits are detected, the system refuses to overwrite data. Instead, it:
- Forks the state into a `SyncConflict` record.
- Preserves the `baseState` and all `conflictingStates`.
- Flags the entity as "In-Conflict" until resolved.

### 3. Field-Level Merge Engine (`services/consensusService.js`)
The engine attempts to reduce manual conflicts by comparing specific fields:
- If `Device A` changed the `description` and `Device B` changed the `amount` concurrently, the engine can **Auto-Merge** them into a single consistent state because the change sets do not overlap.

### 4. Semantic Guard Middleware (`middleware/consistencyGuard.js`)
A global interceptor that validates the `vectorClock` of every incoming mutation. It ensures:
1. **Out-of-Order Rejection**: If an old update arrives after a newer one (latency), it is rejected with a `409 Conflict`.
2. **Atomic Upgrades**: Successful updates increment the logical clock for the specific device, ensuring the next sync maintains causality.

## 🛠️ API Reference

### `GET /api/sync/conflicts`
Returns a list of all unresolved conflicts for the authenticated user.

### `POST /api/sync/resolve/:conflictId`
Allows the user (or a smart client) to provide a manually merged `resolvedState`. This increments a `SYSTEM_RESOLVER` clock to signal global consensus.

## ✅ Implementation Checklist
- [x] Vector Clock partial ordering math (After/Before/Concurrent).
- [x] Conflict storage schema for multi-device state forks.
- [x] Field-level differencing for auto-merge.
- [x] HTTP Interceptor for stale update rejection.
- [x] Background worker for cleaning old resolution logs.
- [x] REST API for manual conflict management.

## 🧪 Testing
Run the consensus test suite:
```bash
npx mocha tests/consensus.test.js
```
