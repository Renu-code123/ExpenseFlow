const mongoose = require('mongoose');

const categoryModelSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    modelData: {
        type: Buffer,
        required: true
    },
    modelType: {
        type: String,
        enum: ['tensorflow', 'brainjs'],
        default: 'tensorflow'
    },
    version: {
        type: Number,
        default: 1
    },
    accuracy: {
        type: Number,
        default: 0,
        min: 0,
        max: 1
    },
    trainingSamples: {
        type: Number,
        default: 0
    },
    lastTrained: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    },
    metadata: {
        layers: Number,
        inputSize: Number,
        outputSize: Number,
        trainingTime: Number,
        epochs: Number
    }
}, {
    timestamps: true
});

// Indexes
categoryModelSchema.index({ user: 1, isActive: 1 });
categoryModelSchema.index({ user: 1, version: -1 });

// Static method to get active model for user
categoryModelSchema.statics.getActiveModel = async function(userId) {
    return await this.findOne({
        user: userId,
        isActive: true
    }).sort({ version: -1 });
};

// Static method to save model
categoryModelSchema.statics.saveModel = async function(userId, modelData, metadata = {}) {
    // Deactivate previous models
    await this.updateMany(
        { user: userId, isActive: true },
        { $set: { isActive: false } }
    );

    // Get next version
    const lastModel = await this.findOne({ user: userId }).sort({ version: -1 });
    const nextVersion = lastModel ? lastModel.version + 1 : 1;

    const newModel = new this({
        user: userId,
        modelData,
        version: nextVersion,
        metadata,
        lastTrained: new Date()
    });

    return await newModel.save();
};

// Static method to get model history
categoryModelSchema.statics.getModelHistory = async function(userId, limit = 10) {
    return await this.find({ user: userId })
        .sort({ version: -1 })
        .limit(limit);
};

module.exports = mongoose.model('CategoryModel', categoryModelSchema);
