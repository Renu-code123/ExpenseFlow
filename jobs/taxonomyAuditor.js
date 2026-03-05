const cron = require('node-cron');
const Taxonomy = require('../models/Taxonomy');
const Transaction = require('../models/Transaction');

/**
 * Taxonomy Auditor Job
 * Issue #706: Maintains hierarchical integrity and cleans up dangling references.
 */
class TaxonomyAuditor {
    constructor() {
        this.name = 'TaxonomyAuditor';
    }

    /**
     * Start the auditor worker
     */
    start() {
        console.log(`[${this.name}] Initializing hierarchical integrity worker...`);

        // Run every night at 3:30 AM
        cron.schedule('30 3 * * *', async () => {
            try {
                console.log(`[${this.name}] Starting taxonomy audit cycle...`);

                // 1. Detect dangling parents (parents that don't exist)
                const items = await Taxonomy.find({ parent: { $ne: null } });
                let fixedOrphans = 0;

                for (const item of items) {
                    const parentExists = await Taxonomy.findById(item.parent);
                    if (!parentExists) {
                        item.parent = null;
                        item.level = 0;
                        item.path = `/${item.slug}/`;
                        await item.save();
                        fixedOrphans++;
                    }
                }

                // 2. Identification of unused custom categories (potential cleanup)
                // We don't delete automatically, just log or flag in a real system.
                // For this demo, we'll verify transaction mapping integrity.
                const transactions = await Transaction.find().select('category').lean();
                const usedCategoryIds = new Set(transactions.map(t => String(t.category)));

                const unusedCustom = await Taxonomy.find({
                    _id: { $nin: Array.from(usedCategoryIds) },
                    isSystem: false,
                    createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Older than 30 days
                });

                console.log(`[${this.name}] Audit complete. 
                    - Fixed ${fixedOrphans} orphan levels.
                    - Identified ${unusedCustom.length} unused custom categories.`);

            } catch (error) {
                console.error(`[${this.name}] Critical audit error:`, error);
            }
        });
    }
}

module.exports = new TaxonomyAuditor();
