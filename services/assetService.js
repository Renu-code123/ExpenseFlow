const FixedAsset = require('../models/FixedAsset');
const depreciationEngine = require('./depreciationEngine');
const DepreciationSchedule = require('../models/DepreciationSchedule');

class AssetService {
    async registerAsset(userId, assetData) {
        const asset = new FixedAsset({
            ...assetData,
            userId,
            currentBookValue: assetData.purchasePrice
        });
        return await asset.save();
    }

    async getAssets(userId, filters = {}) {
        const query = { userId };
        if (filters.category) query.category = filters.category;
        if (filters.status) query.status = filters.status;
        return await FixedAsset.find(query).sort({ purchaseDate: -1 });
    }

    async getAssetDetails(userId, assetId) {
        const asset = await FixedAsset.findOne({ _id: assetId, userId });
        if (!asset) throw new Error('Asset not found');

        const schedule = await DepreciationSchedule.find({ assetId }).sort({ 'period.year': -1, 'period.month': -1 });
        const projections = depreciationEngine.generateProjections(asset);

        return { asset, schedule, projections };
    }

    async runDepreciationForUser(userId, year, month) {
        return await depreciationEngine.runMonthlyRoutine(userId, { year, month });
    }

    async disposeAsset(userId, assetId, disposalData) {
        const asset = await FixedAsset.findOne({ _id: assetId, userId });
        if (!asset) throw new Error('Asset not found');

        const gainLoss = disposalData.price - asset.currentBookValue;

        asset.status = 'Disposed';
        asset.disposalDetails = {
            ...disposalData,
            gainLoss
        };

        return await asset.save();
    }

    async getSummary(userId) {
        const assets = await FixedAsset.find({ userId });

        return {
            totalCount: assets.length,
            totalBookValue: assets.reduce((sum, a) => sum + a.currentBookValue, 0),
            totalAccumulatedDep: assets.reduce((sum, a) => sum + a.accumulatedDepreciation, 0),
            byCategory: assets.reduce((acc, a) => {
                acc[a.category] = (acc[a.category] || 0) + a.currentBookValue;
                return acc;
            }, {})
        };
    }

    async runBatchDepreciation() {
        const users = await require('../models/User').find({ isActive: true });
        const now = new Date();
        const results = [];

        for (const user of users) {
            try {
                const batch = await this.runDepreciationForUser(user._id, now.getFullYear(), now.getMonth() + 1);
                results.push(...batch);
            } catch (err) {
                console.error(`[AssetService] Batch dep failed for user ${user._id}:`, err.message);
            }
        }
        return results;
    }
}

module.exports = new AssetService();
