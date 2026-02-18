# Programmable Notification Hub & Multi-Channel Alerting System

## 🚀 Overview
Issue #646 establishes a centralized architecture for all system communications. It replaces scattered hardcoded logic with a template-driven, provider-agnostic alerting system that respects granular user preferences across multiple channels.

## 🏗️ Technical Architecture

### 1. Provider-Agnostic Adapters (`services/notificationAdapters.js`)
The Hub uses the **Adapter Pattern** to abstract delivery logic. Current adapters include:
- **In-App**: Real-time delivery via Socket.IO.
- **Email**: Abstracted SMTP/API delivery.
- **Webhook**: POST payloads to user-defined endpoints for external system integration.

### 2. Template Engine (`templates/notificationTemplates.js`)
All messages are defined in a central recursive template engine. This ensures:
- Consistent branding and tone.
- Dynamic data injection (e.g., budget percentages, merchant names).
- Priority leveling per message type.

### 3. Granular Persistence (`models/Notification.js` & `models/NotificationPreference.js`)
- **Notification**: Stores a complete log of every alert, including its delivery status across different channels.
- **Preference**: Allows users to enable/disable specific channels for different categories (e.g., "Webhooks for Budget, but only In-App for System Updates").

### 4. Notification Hydrator (`middleware/notificationHydrator.js`)
A specialized middleware that pre-enriches the request context (timezone, contact info) specifically for the notification pipeline, reducing database noise in the service layer.

### 5. Reliable Delivery Queue (`jobs/notificationQueue.js`)
A background worker responsible for scanning the persistence layer and retrying failed deliveries (e.g., if a webhook endpoint was down).

## 🛠️ API Reference

### `GET /api/notifications`
Retrieve alert history with read/unread status filters.

### `PATCH /api/notifications/preferences`
Configure delivery channels (enable/disable Email, Webhooks, etc.).

### `POST /api/notifications/read-all`
Clear the unread queue for the current user.

## ✅ Implementation Checklist
- [x] Persistent Alert Schema with multi-channel status tracking.
- [x] Granular User Preferences (Category x Channel).
- [x] Adapter-based delivery (In-App + Email + Webhook).
- [x] Recursive Template Engine.
- [x] Notification Hydrator Middleware.
- [x] Background Retry Queue logic.

## 🧪 Testing
Run the notification integration tests:
```bash
# Example test command
npm test tests/notifications.test.js
```
*Note: Ensure Socket.IO is initialized for real-time channel testing.*
