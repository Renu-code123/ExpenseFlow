const mongoose = require('mongoose');

const categoryPatternSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    pattern: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    category: {
        type: String,
        required: true,
        enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other']
    },
    patternType: {
        type: String,
        enum: ['keyword', 'merchant', 'phrase', 'learned'],
        default: 'learned'
    },
    confidence: {
        type: Number,
        default: 1.0,
        min: 0,
        max: 1
    },
    usageCount: {
        type: Number,
        default: 1
    },
    lastUsed: {
        type: Date,
        default: Date.now
    },
    accuracy: {
        type: Number,
        default: 1.0,
        min: 0,
        max: 1
    },
    isActive: {
        type: Boolean,
        default: true
    },
    source: {
        type: String,
        enum: ['user_correction', 'auto_learned', 'merchant_db', 'manual'],
        default: 'auto_learned'
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
categoryPatternSchema.index({ user: 1, pattern: 1 });
categoryPatternSchema.index({ user: 1, category: 1 });
categoryPatternSchema.index({ pattern: 'text' });
categoryPatternSchema.index({ isActive: 1, confidence: -1 });

// Method to update pattern usage
categoryPatternSchema.methods.updateUsage = async function(wasCorrect = true) {
    this.usageCount += 1;
    this.lastUsed = new Date();
    
    // Update accuracy using weighted average
    const weight = 0.8; // Give more weight to recent accuracy
    this.accuracy = (this.accuracy * weight) + (wasCorrect ? 1 : 0) * (1 - weight);
    
    // Update confidence based on usage and accuracy
    this.confidence = Math.min(1.0, this.accuracy * Math.log10(this.usageCount + 1) / 2);
    
    return await this.save();
};

// Static method to find patterns for description
categoryPatternSchema.statics.findPatternsForDescription = async function(userId, description) {
    const descriptionLower = description.toLowerCase();
    const words = descriptionLower.split(/\s+/);
    
    // Find patterns that match any word in the description
    const patterns = await this.find({
        user: userId,
        isActive: true,
        pattern: { $in: words }
    }).sort({ confidence: -1, usageCount: -1 });
    
    // Also search for phrase matches
    const phrasePatterns = await this.find({
        user: userId,
        isActive: true,
        pattern: { $regex: descriptionLower, $options: 'i' }
    }).sort({ confidence: -1, usageCount: -1 });
    
    // Combine and deduplicate
    const allPatterns = [...patterns, ...phrasePatterns];
    const uniquePatterns = Array.from(
        new Map(allPatterns.map(p => [p._id.toString(), p])).values()
    );
    
    return uniquePatterns;
};

// Static method to learn from user expense
categoryPatternSchema.statics.learnFromExpense = async function(userId, description, category) {
    const words = description.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2); // Filter out very short words
    
    const patterns = [];
    
    for (const word of words) {
        // Check if pattern already exists
        let pattern = await this.findOne({ user: userId, pattern: word, category });
        
        if (pattern) {
            // Update existing pattern
            await pattern.updateUsage(true);
        } else {
            // Create new pattern
            pattern = new this({
                user: userId,
                pattern: word,
                category,
                patternType: 'learned',
                source: 'auto_learned',
                confidence: 0.5,
                usageCount: 1
            });
            await pattern.save();
        }
        
        patterns.push(pattern);
    }
    
    return patterns;
};

// Static method to get user's top patterns by category
categoryPatternSchema.statics.getUserTopPatterns = async function(userId, limit = 50) {
    return await this.find({
        user: userId,
        isActive: true
    })
    .sort({ confidence: -1, usageCount: -1 })
    .limit(limit);
};

module.exports = mongoose.model('CategoryPattern', categoryPatternSchema);
