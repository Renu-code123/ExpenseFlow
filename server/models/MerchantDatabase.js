const mongoose = require('mongoose');

const merchantDatabaseSchema = new mongoose.Schema({
    merchantName: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    aliases: [{
        type: String,
        lowercase: true,
        trim: true
    }],
    category: {
        type: String,
        required: true,
        enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other']
    },
    keywords: [{
        type: String,
        lowercase: true
    }],
    merchantType: {
        type: String,
        enum: ['restaurant', 'grocery', 'fuel', 'streaming', 'retail', 'medical', 'transport', 'utility', 'other'],
        default: 'other'
    },
    confidence: {
        type: Number,
        default: 0.9,
        min: 0,
        max: 1
    },
    globalUsageCount: {
        type: Number,
        default: 0
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    country: {
        type: String,
        default: 'IN'
    }
}, {
    timestamps: true
});

// Indexes
merchantDatabaseSchema.index({ merchantName: 'text', aliases: 'text', keywords: 'text' });
merchantDatabaseSchema.index({ category: 1 });
merchantDatabaseSchema.index({ country: 1 });

// Static method to search merchants
merchantDatabaseSchema.statics.searchMerchant = async function(description) {
    const descriptionLower = description.toLowerCase();
    
    // Try exact match first
    let merchant = await this.findOne({
        $or: [
            { merchantName: { $regex: descriptionLower, $options: 'i' } },
            { aliases: { $in: [descriptionLower] } }
        ]
    });
    
    if (merchant) return merchant;
    
    // Try text search
    const results = await this.find(
        { $text: { $search: description } },
        { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } }).limit(1);
    
    return results.length > 0 ? results[0] : null;
};

// Static method to initialize pre-trained merchants
merchantDatabaseSchema.statics.initializeDefaultMerchants = async function() {
    const defaultMerchants = [
        // Food & Dining
        { merchantName: 'Swiggy', aliases: ['swiggy'], category: 'food', merchantType: 'restaurant', keywords: ['food', 'delivery', 'restaurant'], confidence: 0.95, isVerified: true },
        { merchantName: 'Zomato', aliases: ['zomato'], category: 'food', merchantType: 'restaurant', keywords: ['food', 'delivery', 'dining'], confidence: 0.95, isVerified: true },
        { merchantName: 'McDonald', aliases: ['mcdonalds', 'mcd'], category: 'food', merchantType: 'restaurant', keywords: ['food', 'fast food', 'burger'], confidence: 0.95, isVerified: true },
        { merchantName: 'Starbucks', aliases: ['starbucks'], category: 'food', merchantType: 'restaurant', keywords: ['coffee', 'cafe'], confidence: 0.95, isVerified: true },
        { merchantName: 'Pizza Hut', aliases: ['pizzahut'], category: 'food', merchantType: 'restaurant', keywords: ['pizza', 'food'], confidence: 0.95, isVerified: true },
        { merchantName: 'Dominos', aliases: ['dominos'], category: 'food', merchantType: 'restaurant', keywords: ['pizza', 'food', 'delivery'], confidence: 0.95, isVerified: true },
        { merchantName: 'KFC', aliases: ['kfc', 'kentucky'], category: 'food', merchantType: 'restaurant', keywords: ['chicken', 'fast food'], confidence: 0.95, isVerified: true },
        { merchantName: 'Subway', aliases: ['subway'], category: 'food', merchantType: 'restaurant', keywords: ['sandwich', 'food'], confidence: 0.95, isVerified: true },
        
        // Groceries
        { merchantName: 'BigBasket', aliases: ['bigbasket'], category: 'shopping', merchantType: 'grocery', keywords: ['grocery', 'vegetables', 'food'], confidence: 0.95, isVerified: true },
        { merchantName: 'Blinkit', aliases: ['blinkit', 'grofers'], category: 'shopping', merchantType: 'grocery', keywords: ['grocery', 'delivery'], confidence: 0.95, isVerified: true },
        { merchantName: 'DMart', aliases: ['dmart'], category: 'shopping', merchantType: 'grocery', keywords: ['grocery', 'retail'], confidence: 0.95, isVerified: true },
        { merchantName: 'Reliance Fresh', aliases: ['reliance fresh'], category: 'shopping', merchantType: 'grocery', keywords: ['grocery', 'vegetables'], confidence: 0.95, isVerified: true },
        
        // Entertainment
        { merchantName: 'Netflix', aliases: ['netflix'], category: 'entertainment', merchantType: 'streaming', keywords: ['streaming', 'movies', 'series'], confidence: 0.98, isVerified: true },
        { merchantName: 'Amazon Prime', aliases: ['prime video', 'amazon prime'], category: 'entertainment', merchantType: 'streaming', keywords: ['streaming', 'movies'], confidence: 0.98, isVerified: true },
        { merchantName: 'Disney+ Hotstar', aliases: ['hotstar', 'disney'], category: 'entertainment', merchantType: 'streaming', keywords: ['streaming', 'movies'], confidence: 0.98, isVerified: true },
        { merchantName: 'Spotify', aliases: ['spotify'], category: 'entertainment', merchantType: 'streaming', keywords: ['music', 'streaming'], confidence: 0.98, isVerified: true },
        { merchantName: 'YouTube Premium', aliases: ['youtube', 'youtube premium'], category: 'entertainment', merchantType: 'streaming', keywords: ['video', 'streaming'], confidence: 0.98, isVerified: true },
        { merchantName: 'BookMyShow', aliases: ['bookmyshow', 'bms'], category: 'entertainment', merchantType: 'other', keywords: ['movie', 'ticket', 'cinema'], confidence: 0.95, isVerified: true },
        { merchantName: 'PVR', aliases: ['pvr'], category: 'entertainment', merchantType: 'other', keywords: ['movie', 'cinema'], confidence: 0.95, isVerified: true },
        { merchantName: 'INOX', aliases: ['inox'], category: 'entertainment', merchantType: 'other', keywords: ['movie', 'cinema'], confidence: 0.95, isVerified: true },
        
        // Transport
        { merchantName: 'Uber', aliases: ['uber'], category: 'transport', merchantType: 'transport', keywords: ['cab', 'taxi', 'ride'], confidence: 0.98, isVerified: true },
        { merchantName: 'Ola', aliases: ['ola', 'ola cabs'], category: 'transport', merchantType: 'transport', keywords: ['cab', 'taxi', 'ride'], confidence: 0.98, isVerified: true },
        { merchantName: 'Rapido', aliases: ['rapido'], category: 'transport', merchantType: 'transport', keywords: ['bike', 'taxi', 'ride'], confidence: 0.95, isVerified: true },
        { merchantName: 'Indian Oil', aliases: ['ioc', 'indian oil'], category: 'transport', merchantType: 'fuel', keywords: ['petrol', 'diesel', 'fuel'], confidence: 0.95, isVerified: true },
        { merchantName: 'HP Petrol', aliases: ['hp', 'hpcl'], category: 'transport', merchantType: 'fuel', keywords: ['petrol', 'diesel', 'fuel'], confidence: 0.95, isVerified: true },
        { merchantName: 'IRCTC', aliases: ['irctc', 'railway'], category: 'transport', merchantType: 'transport', keywords: ['train', 'ticket', 'railway'], confidence: 0.98, isVerified: true },
        
        // Utilities
        { merchantName: 'Electricity Bill', aliases: ['electricity', 'power'], category: 'utilities', merchantType: 'utility', keywords: ['electricity', 'power', 'bill'], confidence: 0.95, isVerified: true },
        { merchantName: 'Water Bill', aliases: ['water'], category: 'utilities', merchantType: 'utility', keywords: ['water', 'bill'], confidence: 0.95, isVerified: true },
        { merchantName: 'Gas Bill', aliases: ['gas', 'lpg'], category: 'utilities', merchantType: 'utility', keywords: ['gas', 'lpg', 'bill'], confidence: 0.95, isVerified: true },
        { merchantName: 'Airtel', aliases: ['airtel'], category: 'utilities', merchantType: 'utility', keywords: ['mobile', 'recharge', 'bill'], confidence: 0.95, isVerified: true },
        { merchantName: 'Jio', aliases: ['jio', 'reliance jio'], category: 'utilities', merchantType: 'utility', keywords: ['mobile', 'recharge', 'bill'], confidence: 0.95, isVerified: true },
        { merchantName: 'Vi', aliases: ['vi', 'vodafone', 'idea'], category: 'utilities', merchantType: 'utility', keywords: ['mobile', 'recharge', 'bill'], confidence: 0.95, isVerified: true },
        
        // Healthcare
        { merchantName: 'Apollo', aliases: ['apollo', 'apollo hospital'], category: 'healthcare', merchantType: 'medical', keywords: ['hospital', 'doctor', 'medical'], confidence: 0.95, isVerified: true },
        { merchantName: 'Fortis', aliases: ['fortis'], category: 'healthcare', merchantType: 'medical', keywords: ['hospital', 'medical'], confidence: 0.95, isVerified: true },
        { merchantName: 'PharmEasy', aliases: ['pharmeasy'], category: 'healthcare', merchantType: 'medical', keywords: ['medicine', 'pharmacy'], confidence: 0.95, isVerified: true },
        { merchantName: 'Netmeds', aliases: ['netmeds'], category: 'healthcare', merchantType: 'medical', keywords: ['medicine', 'pharmacy'], confidence: 0.95, isVerified: true },
        { merchantName: '1mg', aliases: ['1mg', 'onemg'], category: 'healthcare', merchantType: 'medical', keywords: ['medicine', 'pharmacy', 'lab'], confidence: 0.95, isVerified: true },
        
        // Shopping
        { merchantName: 'Amazon', aliases: ['amazon', 'amazon.in'], category: 'shopping', merchantType: 'retail', keywords: ['shopping', 'online', 'ecommerce'], confidence: 0.98, isVerified: true },
        { merchantName: 'Flipkart', aliases: ['flipkart'], category: 'shopping', merchantType: 'retail', keywords: ['shopping', 'online', 'ecommerce'], confidence: 0.98, isVerified: true },
        { merchantName: 'Myntra', aliases: ['myntra'], category: 'shopping', merchantType: 'retail', keywords: ['fashion', 'clothes', 'shopping'], confidence: 0.95, isVerified: true },
        { merchantName: 'Ajio', aliases: ['ajio'], category: 'shopping', merchantType: 'retail', keywords: ['fashion', 'clothes'], confidence: 0.95, isVerified: true },
        { merchantName: 'Nykaa', aliases: ['nykaa'], category: 'shopping', merchantType: 'retail', keywords: ['beauty', 'cosmetics'], confidence: 0.95, isVerified: true },
        { merchantName: 'Zara', aliases: ['zara'], category: 'shopping', merchantType: 'retail', keywords: ['fashion', 'clothes'], confidence: 0.95, isVerified: true },
        { merchantName: 'H&M', aliases: ['h&m', 'hm'], category: 'shopping', merchantType: 'retail', keywords: ['fashion', 'clothes'], confidence: 0.95, isVerified: true }
    ];
    
    for (const merchant of defaultMerchants) {
        await this.findOneAndUpdate(
            { merchantName: merchant.merchantName },
            merchant,
            { upsert: true, new: true }
        );
    }
    
    console.log(`Initialized ${defaultMerchants.length} default merchants`);
};

module.exports = mongoose.model('MerchantDatabase', merchantDatabaseSchema);
