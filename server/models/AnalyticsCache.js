const mongoose = require('mongoose');

const analyticsCacheSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    cacheKey: {
        type: String,
        required: true,
        index: true
    },
    cacheType: {
        type: String,
        required: true,
        enum: [
            'spending_trends',
            'category_breakdown',
            'monthly_comparison',
            'insights',
            'predictions',
            'summary',
            'velocity'
        ]
    },
    period: {
        startDate: Date,
        endDate: Date,
        month: Number,
        year: Number
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    computedAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true
    },
    hitCount: {
        type: Number,
        default: 0
    },
    lastAccessedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound index for efficient cache lookups
analyticsCacheSchema.index({ user: 1, cacheKey: 1 }, { unique: true });
analyticsCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Generate cache key
 */
analyticsCacheSchema.statics.generateKey = function (type, userId, params = {}) {
    const sortedParams = Object.keys(params)
        .sort()
        .map(key => `${key}:${params[key]}`)
        .join('|');
    return `${type}_${userId}_${sortedParams}`;
};

/**
 * Get cached data
 */
analyticsCacheSchema.statics.getCache = async function (type, userId, params = {}) {
    const cacheKey = this.generateKey(type, userId, params);

    const cached = await this.findOneAndUpdate(
        {
            user: userId,
            cacheKey,
            expiresAt: { $gt: new Date() }
        },
        {
            $inc: { hitCount: 1 },
            $set: { lastAccessedAt: new Date() }
        },
        { new: true }
    );

    return cached ? cached.data : null;
};

/**
 * Set cache data
 */
analyticsCacheSchema.statics.setCache = async function (type, userId, params = {}, data, ttlMinutes = 30) {
    const cacheKey = this.generateKey(type, userId, params);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.findOneAndUpdate(
        { user: userId, cacheKey },
        {
            user: userId,
            cacheKey,
            cacheType: type,
            period: params,
            data,
            computedAt: new Date(),
            expiresAt,
            hitCount: 0,
            lastAccessedAt: new Date()
        },
        { upsert: true, new: true }
    );
};

/**
 * Invalidate user cache
 */
analyticsCacheSchema.statics.invalidateUserCache = async function (userId, types = null) {
    const query = { user: userId };
    if (types && Array.isArray(types)) {
        query.cacheType = { $in: types };
    }
    await this.deleteMany(query);
};

/**
 * Get cache stats for user
 */
analyticsCacheSchema.statics.getCacheStats = async function (userId) {
    const stats = await this.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        {
            $group: {
                _id: '$cacheType',
                count: { $sum: 1 },
                totalHits: { $sum: '$hitCount' },
                oldestCache: { $min: '$computedAt' },
                newestCache: { $max: '$computedAt' }
            }
        }
    ]);

    return stats;
};

module.exports = mongoose.model('AnalyticsCache', analyticsCacheSchema);
