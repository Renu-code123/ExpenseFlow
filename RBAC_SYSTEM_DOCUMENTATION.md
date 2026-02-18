# Multi-Tenant RBAC & Hierarchical Permission Governance

## 🚀 Overview
Issue #658 upgrades the workspace security model from a static role dictionary to a dynamic, multi-tenant Role-Based Access Control (RBAC) engine. It supports granular permissions, role inheritance, and automated governance auditing.

## 🏗️ Technical Architecture

### 1. Granular Permissions (`models/Permission.js`)
Instead of checking for simple strings like "admin", the system now checks for specific operational codes:
- `TRANSACTION_CREATE`: Permission to add new records.
- `WORKSPACE_SETTINGS_WRITE`: Permission to change workspace metadata.
- `AUDIT_VIEW`: Access to security logs.

### 2. Hierarchical Roles (`models/Role.js`)
Roles are now dynamic entities that support inheritance:
- **Base Viewer**: Inherits nothing.
- **Editor**: Inherits from **Viewer** and adds mutation permissions.
- **Manager**: Inherits from **Editor** and adds membership management.
- This chain ensures that updating a "Viewer" permission automatically propagates to all higher roles.

### 3. Access Resolution Service (`services/accessService.js`)
The core resolution logic:
- Fetches the user's role in the specific workspace context.
- Recursively resolves the inheritance tree to find the full set of effective permissions.
- Validates the requested permission code against the resolved set.

### 4. Hierarchical Governance (`middleware/rbacMiddleware.js`)
A proactive middleware that protects any route by requiring a specific permission code. It automatically extracts `workspaceId` from the request parameters or body.

### 5. Automation & Audit (`jobs/accessAuditor.js`)
A nightly worker that maintains system integrity:
- Prunes orphaned memberships from deleted users.
- Identifies and logs roles with overly permissive "super-admin" access.
- Ensures workspace member lists stay synchronized with the RBAC database.

## 🛠️ API Reference

### `GET /api/rbac/permissions`
Lists all granular permissions available in the system.

### `GET /api/rbac/roles`
Lists all defined roles and their permission mappings.

### `POST /api/rbac/roles`
Allows admins to create custom roles with specific inheritance and permission sets.

## ✅ Implementation Checklist
- [x] Dynamic Permission schema with module-based grouping.
- [x] Role schema with deep inheritance support.
- [x] Recursive permission resolution service.
- [x] Context-aware RBAC middleware.
- [x] Workforce governance background job.
- [x] Refactored `Workspace` model to support ObjectId role references.

## 🧪 Testing
The system allows for field-level testing of the inheritance logic:
1. Assign `VIEW` to Role A.
2. Set Role B to inherit from Role A.
3. Verify that a user with Role B can pass the `VIEW` permission check.
