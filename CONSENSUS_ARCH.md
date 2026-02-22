# Distributed Transaction Integrity & Vector-Clock Reconciler

## 🚀 Overview
Issue #730 upgrades the application's synchronization layer from a naive "last-write-wins" model to a sophisticated **Distributed Consensus System**. By implementing **Vector Clocks**, the system can distinguish between causal updates (where one change happened after another) and concurrent updates (conflicts).

## 🏗️ Core Components

### 1. Vector Clocks (`utils/vectorClockUtils.js`)
Every transaction record now carries a "Version Map" representing its history across all devices.
- **Causality Tracking**: Allows the server to know if an incoming update is built upon the latest server state or if the client missed some changes.
- **Partial Ordering**: Enables mathematically sound conflict detection without needing a global synchronized clock.

### 2. The Consensus Engine (`services/consensusEngine.js`)
The brain of the sync layer. It evaluates incoming updates against three scenarios:
- **Causal Update**: The client is strictly ahead of the server. The update is applied immediately.
- **Stale Update**: The client is sending data it has already superseded. The update is ignored.
- **Concurrent Conflict**: Both server and client have modified the record independently. The system prevents data loss by moving the state into the **Conflict Graveyard**.

### 3. Conflict Graveyard (`models/SyncConflict.js`)
When a conflict occurs, the system doesn't guess a winner. Instead:
- It preserves the `ServerState`, `ClientState`, and their respective `VectorClocks`.
- It flags the transaction as `conflict` status.
- It exposes a manual resolution API for the user to choose `client_wins`, `server_wins`, or a `merge`.

### 4. Data Integrity Guard (`utils/hashGenerator.js`)
To prevent "Ghost Updates," every state is hashed. Even if vector clocks appear aligned, the system verifies the checksum to ensure no bit-rot or intercepted data is being injected.

## 🔄 The Sync Workflow
1. **Request Received**: `SyncInterceptor` extracts device identity and the client's vector clock.
2. **Reconciliation**: `ConsensusEngine` compares the client clock against the database clock.
3. **Action Execution**:
   - If Causal: Database is updated, and the server clock is incremented.
   - If Concurrent: A record is created in `SyncConflict` for the user to resolve later.
4. **Maintenance**: `ConflictPruner` periodically purges old resolved conflicts to keep the database lean.

## ✅ Benefits
- **Zero Data Loss**: Offline edits no longer overwrite newer online changes.
- **Causal Consistency**: The system guarantees that users always see a logically consistent history of their finances.
- **Device Agnostic**: Seamlessly scales from web to mobile to offline-first desktop apps.

## 🧪 Testing
Verify the logic with:
```bash
npx mocha tests/consensusEngine.test.js
```
