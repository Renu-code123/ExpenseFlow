const cron = require('node-cron');
const Workspace = require('../models/Workspace');
const Role = require('../models/Role');

/**
 * Access Auditor Background Job
 * Issue #658: Periodically audits workspace access and cleans up orphaned permissions
 */
class AccessAuditor {
    constructor() {
        this.name = 'AccessAuditor';
    }

    /**
     * Start the scheduled access audit
     */
    start() {
        console.log(`[${this.name}] Initializing security governance jobs...`);

        // Run every night at 4:30 AM
        cron.schedule('30 4 * * *', async () => {
            try {
                console.log(`[${this.name}] Starting access audit...`);

                // 1. Audit Expired Invites (Example: If workspace members have an expiration)
                // 2. Audit Sensitive Permissions
                // 3. Clean up roles without permissions

                const workspaces = await Workspace.find();
                let orphanedRolesFound = 0;

                for (const ws of workspaces) {
                    const validMembers = ws.members.filter(m => m.user && m.role);
                    if (validMembers.length !== ws.members.length) {
                        ws.members = validMembers;
                        await ws.save();
                        orphanedRolesFound++;
                    }
                }

                console.log(`[${this.name}] Audit complete. Cleaned up ${orphanedRolesFound} workspace memberships.`);
            } catch (error) {
                console.error(`[${this.name}] Critical error in access auditor:`, error);
            }
        });
    }
}

module.exports = new AccessAuditor();
