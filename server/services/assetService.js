const FixedAsset = require('../models/FixedAsset');
const AssetDepreciation = require('../models/AssetDepreciation');

class AssetService {
    /**
     * Calculate and apply monthly depreciation for all active assets
     */
    async runBatchDepreciation() {
        const assets = await FixedAsset.find({ status: 'active', isDeleted: false });
        const results = [];

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        for (const asset of assets) {
            // Skip if already depreciated this month
            if (asset.lastDepreciationDate &&
                asset.lastDepreciationDate.getMonth() === currentMonth &&
                asset.lastDepreciationDate.getFullYear() === currentYear) {
                continue;
            }

            const depAmount = this.calculateMonthlyDepreciation(asset);

            if (depAmount > 0) {
                const openingValue = asset.currentBookValue;
                const closingValue = Math.max(asset.salvageValue, asset.currentBookValue - depAmount);

                const entry = new AssetDepreciation({
                    assetId: asset._id,
                    date: now,
                    depreciationAmount: openingValue - closingValue,
                    openingBookValue: openingValue,
                    closingBookValue: closingValue,
                    method: asset.depreciationMethod,
                    period: { month: currentMonth + 1, year: currentYear }
                });

                await entry.save();

                asset.currentBookValue = closingValue;
                asset.lastDepreciationDate = now;
                await asset.save();

                results.push({ assetId: asset._id, amount: depAmount });
            }
        }

        return results;
    }

    calculateMonthlyDepreciation(asset) {
        if (asset.currentBookValue <= asset.salvageValue) return 0;

        if (asset.depreciationMethod === 'SLM') {
            // Straight Line Method: (Cost - Salvage) / Useful Life
            const annualDep = (asset.purchasePrice - asset.salvageValue) / asset.usefulLifeYears;
            return annualDep / 12;
        } else if (asset.depreciationMethod === 'DBM') {
            // Declining Balance Method: Current Value * Rate
            const rate = asset.depreciationRate || (2 / asset.usefulLifeYears); // Double Declining default
            return (asset.currentBookValue * rate) / 12;
        }

        return 0;
    }

    async getAssetDashboard(userId) {
        const assets = await FixedAsset.find({ userId, isDeleted: false });
        const totalValue = assets.reduce((sum, a) => sum + a.currentBookValue, 0);
        const totalPurchase = assets.reduce((sum, a) => sum + a.purchasePrice, 0);

        const categoryDist = {};
        assets.forEach(a => {
            categoryDist[a.category] = (categoryDist[a.category] || 0) + a.currentBookValue;
        });

        return {
            assets,
            stats: {
                count: assets.length,
                totalBookValue: totalValue,
                totalDepreciation: totalPurchase - totalValue,
                categoryDistribution: categoryDist
            }
        };
    }

    async getDepreciationHistory(assetId) {
        return await AssetDepreciation.find({ assetId }).sort({ date: -1 });
    }

    /**
     * Record maintenance activity for an asset
     */
    async recordMaintenance(assetId, maintenanceData) {
        const asset = await FixedAsset.findById(assetId);
        if (!asset) throw new Error('Asset not find');

        asset.maintenanceHistory.push(maintenanceData);

        // If it's an upgrade, we might want to increase the book value or life
        if (maintenanceData.type === 'upgrade' && maintenanceData.capitalize) {
            asset.currentBookValue += maintenanceData.cost;
        }

        await asset.save();
        return asset;
    }

    /**
     * Mark an asset as disposed/sold
     */
    async disposeAsset(assetId, disposalData) {
        const asset = await FixedAsset.findById(assetId);
        if (!asset) throw new Error('Asset not found');

        const gainLoss = disposalData.saleProceeds - asset.currentBookValue;

        asset.status = 'disposed';
        asset.notes = (asset.notes || '') + `\nDisposed on ${disposalData.date}. Proceeds: ${disposalData.saleProceeds}. Gain/Loss: ${gainLoss}`;

        await asset.save();
        return { asset, gainLoss };
    }
}

module.exports = new AssetService();
