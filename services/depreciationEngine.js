const FixedAsset = require('../models/FixedAsset');
const DepreciationSchedule = require('../models/DepreciationSchedule');

class DepreciationEngine {
    /**
     * Calculate depreciation for a specific asset and period
     */
    calculateDepreciation(asset, period) {
        const { year, month } = period;
        const method = asset.depreciationMethod;
        let amount = 0;

        if (method === 'Straight Line') {
            // Amount = (Cost - Salvage) / Life / 12
            const annualDep = (asset.purchasePrice - asset.salvageValue) / asset.usefulLife;
            amount = annualDep / 12;
        } else if (method === 'Written Down Value') {
            // Amount = Current Book Value * Rate / 12 (approximate)
            // Or precise: Current Book Value * (Rate/100) / 12
            const rate = asset.depreciationRate || (1 / asset.usefulLife) * 2 * 100; // Double declining approx
            amount = (asset.currentBookValue * (rate / 100)) / 12;
        }

        // Ensure we don't go below salvage value
        if (asset.currentBookValue - amount < asset.salvageValue) {
            amount = asset.currentBookValue - asset.salvageValue;
        }

        return Math.max(0, amount);
    }

    /**
     * Run monthly depreciation routine for all active assets of a user
     */
    async runMonthlyRoutine(userId, period) {
        const assets = await FixedAsset.find({ userId, status: 'Active' });
        const results = [];

        for (const asset of assets) {
            const amount = this.calculateDepreciation(asset, period);

            if (amount <= 0) continue;

            const schedule = new DepreciationSchedule({
                assetId: asset._id,
                userId,
                period,
                openingBookValue: asset.currentBookValue,
                depreciationAmount: amount,
                closingBookValue: asset.currentBookValue - amount,
                methodUsed: asset.depreciationMethod
            });

            await schedule.save();

            // Update asset status
            asset.currentBookValue -= amount;
            asset.accumulatedDepreciation += amount;

            if (asset.currentBookValue <= asset.salvageValue) {
                // Asset fully depreciated
            }

            await asset.save();
            results.push(schedule);
        }

        return results;
    }

    /**
     * Generate 5-year projection for an asset
     */
    generateProjections(asset) {
        const projections = [];
        let tempValue = asset.currentBookValue;
        const method = asset.depreciationMethod;
        const salvage = asset.salvageValue;
        const rate = asset.depreciationRate || (1 / asset.usefulLife) * 2 * 100;

        for (let i = 1; i <= 60; i++) { // 60 months
            let amount = 0;
            if (method === 'Straight Line') {
                amount = (asset.purchasePrice - salvage) / asset.usefulLife / 12;
            } else {
                amount = (tempValue * (rate / 100)) / 12;
            }

            if (tempValue - amount < salvage) {
                amount = tempValue - salvage;
            }

            if (amount <= 0) break;

            tempValue -= amount;
            projections.push({
                month: i,
                amount,
                remainingValue: tempValue
            });
        }

        return projections;
    }
    /**
     * Calculate depreciation based on tax laws (Income Tax Act - India)
     * Takes block of assets into account
     */
    calculateTaxDepreciation(blockValue, rate, period) {
        // Simplified block-wise calculation
        return (blockValue * (rate / 100)) / 12; // Monthly charge
    }

    /**
     * Handle asset write-off (Total loss)
     */
    async writeOffAsset(userId, assetId, reason) {
        const asset = await FixedAsset.findOne({ _id: assetId, userId });
        if (!asset) throw new Error('Asset not found');

        const lossAmount = asset.currentBookValue;

        asset.status = 'Written Off';
        asset.accumulatedDepreciation += lossAmount;
        asset.currentBookValue = 0;
        asset.disposalDetails = {
            date: new Date(),
            price: 0,
            gainLoss: -lossAmount,
            reason: reason || 'Asset written off due to irreparable damage'
        };

        return await asset.save();
    }

    /**
     * Revalue an asset (IFRS/GAAP)
     */
    async revalueAsset(userId, assetId, newValue) {
        const asset = await FixedAsset.findOne({ _id: assetId, userId });
        if (!asset) throw new Error('Asset not found');

        const adjustment = newValue - asset.currentBookValue;
        asset.currentBookValue = newValue;

        // In a real system, this would post to a Revaluation Reserve
        return await asset.save();
    }
}

module.exports = new DepreciationEngine();
