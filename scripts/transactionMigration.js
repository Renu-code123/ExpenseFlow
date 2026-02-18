/**
 * Transaction Pipeline Migration Script
 * Issue #628: Updates existing transactions to have a baseline status
 */

const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');

async function migrate() {
    try {
        console.log('🚀 Starting Transaction Status Migration...');

        // Connect to MongoDB (assuming standard local env for the user)
        // In a real script we'd take this from process.env
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect('mongodb://localhost:27017/expenseflow');
        }

        const result = await Transaction.updateMany(
            { status: { $exists: false } }, // Find old transactions without status
            {
                $set: {
                    status: 'validated',
                    'forexMetadata.isHistoricallyAccurate': true
                },
                $push: {
                    processingLogs: {
                        step: 'migration',
                        status: 'success',
                        message: 'Migrated to multi-stage pipeline schema',
                        timestamp: new Date()
                    }
                }
            }
        );

        console.log(`✅ Migration Complete!`);
        console.log(`- Matched: ${result.matchedCount}`);
        console.log(`- Modified: ${result.modifiedCount}`);

    } catch (error) {
        console.error('❌ Migration Failed:', error);
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }
    }
}

// Run if called directly
if (require.main === module) {
    migrate();
}

module.exports = migrate;
