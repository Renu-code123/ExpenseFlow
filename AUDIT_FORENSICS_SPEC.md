# Polymorphic Audit Logging & Forensic Traceability Engine

## 🚀 Overview
Issue #731 implements a state-of-the-art forensic auditing system. Unlike simple event logging, this engine captures the **State Delta** of every major entity modification in the system, enabling full traceability, liability assignment, and historical state reconstruction ("Time Travel").

## 🏗️ Architecture

### 1. High-Volume Audit Log (`models/AuditLog.js`)
A polymorphic collection that tracks mutations across all registered models.
- **Entity Agnostic**: Stores logs for `Transaction`, `Taxonomy`, `Workspace`, etc., in a unified schema.
- **State Capture**: Stores the `before` and `after` snapshots along with a calculated `diff`.
- **Contextual Metadata**: Captures IP, User Agent, and Request ID for every change.

### 2. Mongoose Lifecycle Plugin (`plugins/mongooseAuditV2.js`)
An automated "black box" for the database.
- Hooks into `pre('save')` and `post('save')` to identify updates.
- Automatically calculates deltas using the `utils/diffEngine.js`.
- Respects security context injected via `doc.setAuditContext()`.

### 3. Forensic Search & Reconstruction (`services/auditProcessor.js`)
The "Time Machine" logic.
- **State Reconstruction**: Can take an entity ID and a target timestamp to rebuild exactly what that object looked like at that moment by replaying chronological diffs.
- **Mass Action Detection**: Security logic to alert on suspicious patterns like rapid updates or bulk deletions.

### 4. Diff Engine (`utils/diffEngine.js`)
A optimized JSON comparator that:
- Ignores internal Mongoose noise (`__v`, `updatedAt`).
- Detects deep changes in nested objects and arrays.
- Generates a minimized patch object for storage efficiency.

## 🔐 Security & Compliance
- **GDPR Ready**: Automated purging of non-critical logs after 90 days.
- **Immutable Logic**: Audit logs are designed to be "Append-Only" to prevent forensic tampering.
- **Context Injection**: Uses `auditInterceptor.js` to link every DB change to a specific web request and user identity.

## 🧪 Forensic Queries
Administrators can use the Forensic API to answer questions like:
- *"Who changed the category of transaction XYZ from 'Travel' to 'Personal' yesterday at 4 PM?"*
- *"What did Workspace PQR's member list look like 3 months ago?"*
- *"Which IP address initiated the bulk deletion of the 2023 Tax records?"*

## ✅ Benefits
- **Accountability**: 100% visibility into who did what and when.
- **Recovery**: Ability to manually revert accidental mass updates.
- **Detection**: Proactive alerting on credential stuffing or rogue employee activity.
