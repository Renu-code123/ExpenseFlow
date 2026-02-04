const mongoose = require('mongoose');

/**
 * Global Pattern Schema
 * Stores global merchant/keyword patterns that can be shared across users
 * These are pre-defined patterns from merchant databases and common keywords
 */
const patternSchema = new mongoose.Schema({
    // Pattern string (lowercase)
    pattern: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        index: true
    },
    
    // Target category for this pattern
    category: {
        type: String,
        required: true,
        enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other']
    },
    
    // Type of pattern
    patternType: {
        type: String,
        enum: ['merchant', 'keyword', 'phrase', 'regex'],
        default: 'keyword'
    },
    
    // Synonyms and variations
    aliases: [{
        type: String,
        lowercase: true,
        trim: true
    }],
    
    // Base confidence for this pattern (0-1)
    baseConfidence: {
        type: Number,
        default: 0.8,
        min: 0,
        max: 1
    },
    
    // Priority (higher = more important when multiple matches)
    priority: {
        type: Number,
        default: 5,
        min: 1,
        max: 10
    },
    
    // Global usage statistics
    globalUsageCount: {
        type: Number,
        default: 0
    },
    
    // Accuracy tracking from user feedback
    globalAccuracy: {
        type: Number,
        default: 0.9,
        min: 0,
        max: 1
    },
    
    // Region-specific (e.g., "petrol" vs "gas")
    regions: [{
        type: String,
        enum: ['global', 'us', 'uk', 'in', 'eu', 'au'],
        default: 'global'
    }],
    
    // Is this pattern active?
    isActive: {
        type: Boolean,
        default: true
    },
    
    // Source of the pattern
    source: {
        type: String,
        enum: ['system', 'merchant_db', 'crowd_sourced', 'admin'],
        default: 'system'
    }
}, {
    timestamps: true
});

// Compound index for efficient lookups
patternSchema.index({ pattern: 'text', aliases: 'text' });
patternSchema.index({ category: 1, isActive: 1, baseConfidence: -1 });
patternSchema.index({ patternType: 1, isActive: 1 });

/**
 * Find matching patterns for a description
 */
patternSchema.statics.findMatchingPatterns = async function(description) {
    const descLower = description.toLowerCase();
    const words = descLower.split(/\s+/).filter(w => w.length > 2);
    
    // Find exact pattern matches
    const exactMatches = await this.find({
        isActive: true,
        $or: [
            { pattern: { $in: words } },
            { aliases: { $in: words } }
        ]
    }).sort({ priority: -1, baseConfidence: -1 });
    
    // Find partial matches (pattern contained in description)
    const partialMatches = await this.find({
        isActive: true,
        pattern: { $regex: words.join('|'), $options: 'i' }
    }).sort({ priority: -1, baseConfidence: -1 });
    
    // Find where description contains the pattern
    const containedMatches = await this.find({
        isActive: true
    });
    
    const descMatches = containedMatches.filter(p => 
        descLower.includes(p.pattern) || 
        p.aliases.some(a => descLower.includes(a))
    );
    
    // Combine and deduplicate
    const allMatches = [...exactMatches, ...partialMatches, ...descMatches];
    const uniqueMatches = Array.from(
        new Map(allMatches.map(p => [p._id.toString(), p])).values()
    );
    
    return uniqueMatches.sort((a, b) => {
        // Sort by priority first, then confidence
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.baseConfidence - a.baseConfidence;
    });
};

/**
 * Update global stats when pattern is used
 */
patternSchema.methods.recordUsage = async function(wasCorrect = true) {
    this.globalUsageCount += 1;
    
    // Update accuracy with weighted average
    const weight = 0.95; // Heavily weight historical data
    this.globalAccuracy = (this.globalAccuracy * weight) + (wasCorrect ? 1 : 0) * (1 - weight);
    
    return await this.save();
};

/**
 * Seed initial patterns
 */
patternSchema.statics.seedDefaultPatterns = async function() {
    const defaultPatterns = [
        // Food & Dining
        { pattern: 'starbucks', category: 'food', patternType: 'merchant', aliases: ['sbux'], baseConfidence: 0.95, priority: 9 },
        { pattern: 'mcdonalds', category: 'food', patternType: 'merchant', aliases: ['mcd', 'mcds'], baseConfidence: 0.95, priority: 9 },
        { pattern: 'restaurant', category: 'food', patternType: 'keyword', baseConfidence: 0.9, priority: 8 },
        { pattern: 'cafe', category: 'food', patternType: 'keyword', aliases: ['coffee', 'coffeeshop'], baseConfidence: 0.85, priority: 7 },
        { pattern: 'pizza', category: 'food', patternType: 'keyword', aliases: ['dominos', 'pizzahut'], baseConfidence: 0.9, priority: 8 },
        { pattern: 'grocery', category: 'food', patternType: 'keyword', aliases: ['groceries', 'supermarket'], baseConfidence: 0.9, priority: 8 },
        { pattern: 'swiggy', category: 'food', patternType: 'merchant', aliases: ['zomato', 'doordash', 'ubereats'], baseConfidence: 0.95, priority: 9 },
        { pattern: 'kfc', category: 'food', patternType: 'merchant', aliases: ['kentucky'], baseConfidence: 0.95, priority: 9 },
        { pattern: 'subway', category: 'food', patternType: 'merchant', baseConfidence: 0.95, priority: 9 },
        { pattern: 'burger', category: 'food', patternType: 'keyword', aliases: ['burgerking', 'wendys'], baseConfidence: 0.85, priority: 7 },
        { pattern: 'bakery', category: 'food', patternType: 'keyword', baseConfidence: 0.85, priority: 7 },
        { pattern: 'dining', category: 'food', patternType: 'keyword', baseConfidence: 0.85, priority: 7 },
        { pattern: 'lunch', category: 'food', patternType: 'keyword', aliases: ['dinner', 'breakfast', 'brunch'], baseConfidence: 0.8, priority: 6 },
        
        // Transport
        { pattern: 'uber', category: 'transport', patternType: 'merchant', aliases: ['lyft', 'ola', 'grab'], baseConfidence: 0.95, priority: 9 },
        { pattern: 'shell', category: 'transport', patternType: 'merchant', aliases: ['chevron', 'exxon', 'bp'], baseConfidence: 0.95, priority: 9 },
        { pattern: 'petrol', category: 'transport', patternType: 'keyword', aliases: ['gas', 'gasoline', 'fuel', 'diesel'], baseConfidence: 0.9, priority: 8 },
        { pattern: 'taxi', category: 'transport', patternType: 'keyword', aliases: ['cab', 'rideshare'], baseConfidence: 0.9, priority: 8 },
        { pattern: 'metro', category: 'transport', patternType: 'keyword', aliases: ['subway', 'train', 'railway'], baseConfidence: 0.85, priority: 7 },
        { pattern: 'bus', category: 'transport', patternType: 'keyword', aliases: ['buspass', 'transit'], baseConfidence: 0.85, priority: 7 },
        { pattern: 'parking', category: 'transport', patternType: 'keyword', aliases: ['parkingfee', 'garage'], baseConfidence: 0.9, priority: 8 },
        { pattern: 'toll', category: 'transport', patternType: 'keyword', aliases: ['tollway', 'fastag'], baseConfidence: 0.9, priority: 8 },
        { pattern: 'flight', category: 'transport', patternType: 'keyword', aliases: ['airline', 'airfare', 'airplane'], baseConfidence: 0.85, priority: 7 },
        { pattern: 'car', category: 'transport', patternType: 'keyword', aliases: ['carwash', 'carmaintenance', 'carrepair'], baseConfidence: 0.75, priority: 6 },
        
        // Shopping
        { pattern: 'amazon', category: 'shopping', patternType: 'merchant', aliases: ['amzn'], baseConfidence: 0.85, priority: 8 },
        { pattern: 'walmart', category: 'shopping', patternType: 'merchant', aliases: ['target', 'costco'], baseConfidence: 0.85, priority: 8 },
        { pattern: 'flipkart', category: 'shopping', patternType: 'merchant', aliases: ['myntra', 'ajio'], baseConfidence: 0.85, priority: 8 },
        { pattern: 'mall', category: 'shopping', patternType: 'keyword', aliases: ['shoppingmall', 'store'], baseConfidence: 0.8, priority: 7 },
        { pattern: 'clothes', category: 'shopping', patternType: 'keyword', aliases: ['clothing', 'apparel', 'fashion'], baseConfidence: 0.85, priority: 7 },
        { pattern: 'shoes', category: 'shopping', patternType: 'keyword', aliases: ['footwear', 'sneakers'], baseConfidence: 0.85, priority: 7 },
        { pattern: 'electronics', category: 'shopping', patternType: 'keyword', aliases: ['gadget', 'tech'], baseConfidence: 0.8, priority: 7 },
        
        // Entertainment
        { pattern: 'netflix', category: 'entertainment', patternType: 'merchant', aliases: ['spotify', 'hulu', 'disney+', 'prime'], baseConfidence: 0.95, priority: 9 },
        { pattern: 'movie', category: 'entertainment', patternType: 'keyword', aliases: ['cinema', 'theater', 'theatre', 'film'], baseConfidence: 0.9, priority: 8 },
        { pattern: 'gaming', category: 'entertainment', patternType: 'keyword', aliases: ['game', 'playstation', 'xbox', 'steam'], baseConfidence: 0.85, priority: 7 },
        { pattern: 'concert', category: 'entertainment', patternType: 'keyword', aliases: ['event', 'show', 'ticket'], baseConfidence: 0.85, priority: 7 },
        { pattern: 'subscription', category: 'entertainment', patternType: 'keyword', baseConfidence: 0.7, priority: 5 },
        { pattern: 'gym', category: 'entertainment', patternType: 'keyword', aliases: ['fitness', 'workout'], baseConfidence: 0.85, priority: 7 },
        
        // Utilities
        { pattern: 'electricity', category: 'utilities', patternType: 'keyword', aliases: ['electric', 'power', 'hydro'], baseConfidence: 0.95, priority: 9 },
        { pattern: 'water', category: 'utilities', patternType: 'keyword', aliases: ['waterbill'], baseConfidence: 0.9, priority: 8 },
        { pattern: 'internet', category: 'utilities', patternType: 'keyword', aliases: ['wifi', 'broadband', 'isp'], baseConfidence: 0.9, priority: 8 },
        { pattern: 'phone', category: 'utilities', patternType: 'keyword', aliases: ['mobile', 'cellular', 'telecom'], baseConfidence: 0.8, priority: 7 },
        { pattern: 'rent', category: 'utilities', patternType: 'keyword', aliases: ['housing', 'lease'], baseConfidence: 0.9, priority: 8 },
        { pattern: 'insurance', category: 'utilities', patternType: 'keyword', aliases: ['premium'], baseConfidence: 0.85, priority: 7 },
        { pattern: 'bill', category: 'utilities', patternType: 'keyword', aliases: ['payment', 'utility'], baseConfidence: 0.7, priority: 5 },
        
        // Healthcare
        { pattern: 'hospital', category: 'healthcare', patternType: 'keyword', aliases: ['clinic', 'medical'], baseConfidence: 0.95, priority: 9 },
        { pattern: 'pharmacy', category: 'healthcare', patternType: 'keyword', aliases: ['medicine', 'drug', 'prescription'], baseConfidence: 0.95, priority: 9 },
        { pattern: 'doctor', category: 'healthcare', patternType: 'keyword', aliases: ['physician', 'specialist', 'consultation'], baseConfidence: 0.9, priority: 8 },
        { pattern: 'dentist', category: 'healthcare', patternType: 'keyword', aliases: ['dental'], baseConfidence: 0.95, priority: 9 },
        { pattern: 'lab', category: 'healthcare', patternType: 'keyword', aliases: ['laboratory', 'diagnostic', 'tests'], baseConfidence: 0.85, priority: 7 },
        { pattern: 'therapy', category: 'healthcare', patternType: 'keyword', aliases: ['counseling', 'mental'], baseConfidence: 0.85, priority: 7 }
    ];
    
    for (const pattern of defaultPatterns) {
        const exists = await this.findOne({ pattern: pattern.pattern });
        if (!exists) {
            pattern.regions = ['global'];
            pattern.source = 'system';
            await this.create(pattern);
        }
    }
    
    console.log(`Seeded ${defaultPatterns.length} default patterns`);
};

module.exports = mongoose.model('Pattern', patternSchema);
