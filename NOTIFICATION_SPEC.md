# Omnichannel Notification Delivery & Template Lifecycle Engine

## 🚀 Overview
Issue #721 introduces a decoupled, multi-channel notification infrastructure. It moves away from hardcoded logic (e.g., `emailService.send`) and embraces a "Dispatch & Route" pattern. This allows the system to send alerts across Email, Push, SMS, and In-App feeds using a single trigger point.

## 🏗️ Technical Architecture

### 1. Template Engine (`models/NotificationTemplate.js`)
Templates are managed as data objects in MongoDB. Each template defines:
- **Slug**: Unique identifier for code integration.
- **Channels**: Content specific to Email (Subject/Body), Push (Title/Body), etc.
- **Variable Definitions**: Schema-based validation for dynamic data injection (e.g., `{{amount}}`).

### 2. Resolution Logic (`utils/templateResolver.js`)
Uses a regex-based interpolation engine to inject runtime variables into template bodies. This ensures that a single high-level object can populate a customized Email, a shorter Push notification, and a concise SMS.

### 3. Delivery Orchestrator (`services/notificationOrchestrator.js`)
The central brain of the system.
- **Fetching**: Retrieves the active template for a given slug.
- **Validation**: Ensures all required data is present.
- **Routing**: Simultaneously dispatches content to SendGrid (Email), FCM (Push), and internal databases (In-App).

### 4. Anti-Spam Guard (`middleware/notificationGuard.js`)
Implements frequency caps to protect users from alert fatigue. It tracks notification velocity and blocks excessive dispatches for the same user/slug within a fixed time window.

## 🔄 Integration Flow
1. **Event Trigger**: A system event (e.g., `budget.limit_reached`) is emitted.
2. **Listener Hook**: `AuditListener` catches the event.
3. **Orchestration**: `AuditListener` calls `orchestrator.dispatch('budget-alert', userId, { ...data })`.
4. **Resolution**: Content is generated for all enabled channels.
5. **Multi-Channel Dispatch**: 
   - User gets an Email with full transaction details.
   - User gets a Push notification with a quick summary.
   - User's mobile app dashboard shows an In-App alert.

## ✅ Benefits
- **Decoupling**: Business services don't need to know about SendGrid or Firebase.
- **Consistency**: The same alert looks professional across all platforms.
- **Velocity**: Marketing and Product teams can update notification copy in the database without code deployments.

## 📦 Future Scope
- **User Preferences**: Allow users to toggle specific channels (e.g., "SMS Off").
- **A/B Testing**: Support multiple versions of the same template slug.
- **Retry Queues**: Add BullMQ support for guaranteed delivery.
