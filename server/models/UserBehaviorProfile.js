const mongoose = require('mongoose');

/**
 * UserBehaviorProfile Schema
 * Tracks and analyzes user spending behavior for anomaly detection
 */
const userBehaviorProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    unique: true,
    index: true
  },
  // Spending patterns
  avgDailySpend: {
    type: Number,
    default: 0,
    min: [0, 'Average daily spend cannot be negative']
  },
  avgTransactionSize: {
    type: Number,
    default: 0,
    min: [0, 'Average transaction size cannot be negative']
  },
  medianTransactionSize: {
    type: Number,
    default: 0
  },
  maxTransactionSize: {
    type: Number,
    default: 0
  },
  minTransactionSize: {
    type: Number,
    default: Number.MAX_VALUE
  },
  transactionSizeStdDev: {
    type: Number,
    default: 0
  },
  // Spending variability
  spendingVariability: {
    coefficient: {
      type: Number,
      default: 0
    },
    trend: {
      type: String,
      enum: ['increasing', 'stable', 'decreasing', 'volatile'],
      default: 'stable'
    }
  },
  // Category preferences
  typicalCategories: [{
    category: {
      type: String,
      required: true
    },
    frequency: {
      type: Number,
      default: 0
    },
    avgAmount: {
      type: Number,
      default: 0
    },
    percentage: {
      type: Number,
      default: 0
    },
    lastTransaction: Date
  }],
  // Merchant preferences
  typicalMerchants: [{
    merchant: {
      type: String,
      required: true
    },
    frequency: {
      type: Number,
      default: 0
    },
    avgAmount: {
      type: Number,
      default: 0
    },
    lastTransaction: Date,
    isTrusted: {
      type: Boolean,
      default: false
    }
  }],
  // Temporal patterns
  activeHours: [{
    hour: {
      type: Number,
      min: 0,
      max: 23,
      required: true
    },
    transactionCount: {
      type: Number,
      default: 0
    },
    avgAmount: {
      type: Number,
      default: 0
    }
  }],
  activeDaysOfWeek: [{
    day: {
      type: Number,
      min: 0,
      max: 6,
      required: true
    },
    transactionCount: {
      type: Number,
      default: 0
    },
    avgAmount: {
      type: Number,
      default: 0
    }
  }],
  // Geographic patterns
  typicalLocations: [{
    country: {
      type: String,
      required: true
    },
    city: String,
    coordinates: {
      lat: Number,
      lng: Number
    },
    frequency: {
      type: Number,
      default: 0
    },
    lastSeen: Date,
    radius: {
      // Typical distance from this location (in km)
      type: Number,
      default: 50
    }
  }],
  homeLocation: {
    country: String,
    city: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  // Device patterns
  deviceFingerprints: [{
    fingerprint: {
      type: String,
      required: true
    },
    deviceType: {
      type: String,
      enum: ['mobile', 'tablet', 'desktop', 'other']
    },
    firstSeen: Date,
    lastSeen: Date,
    transactionCount: {
      type: Number,
      default: 0
    },
    isTrusted: {
      type: Boolean,
      default: false
    },
    ipAddresses: [{
      ip: String,
      lastSeen: Date
    }]
  }],
  // Transaction velocity patterns
  velocityProfile: {
    avgTransactionsPerDay: {
      type: Number,
      default: 0
    },
    maxTransactionsPerDay: {
      type: Number,
      default: 0
    },
    avgTransactionsPerHour: {
      type: Number,
      default: 0
    },
    maxTransactionsPerHour: {
      type: Number,
      default: 0
    }
  },
  // Risk indicators
  riskIndicators: {
    highValueTransactions: {
      type: Number,
      default: 0
    },
    internationalTransactions: {
      type: Number,
      default: 0
    },
    declinedTransactions: {
      type: Number,
      default: 0
    },
    chargebacks: {
      type: Number,
      default: 0
    },
    suspiciousActivities: {
      type: Number,
      default: 0
    }
  },
  // Statistical metadata
  statistics: {
    totalTransactions: {
      type: Number,
      default: 0
    },
    totalSpend: {
      type: Number,
      default: 0
    },
    firstTransaction: Date,
    lastTransaction: Date,
    accountAgeInDays: {
      type: Number,
      default: 0
    },
    dataQuality: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low'
    }
  },
  // Learning metadata
  modelVersion: {
    type: String,
    default: '1.0'
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
    index: true
  },
  lastFullRecalculation: {
    type: Date,
    default: Date.now
  },
  updateFrequency: {
    type: String,
    enum: ['realtime', 'hourly', 'daily', 'weekly'],
    default: 'daily'
  },
  // Anomaly thresholds (customizable per user)
  customThresholds: {
    transactionAmount: Number,
    transactionVelocity: Number,
    geographicDistance: Number,
    categoryDeviation: Number
  }
}, {
  timestamps: true
});

// Indexes
userBehaviorProfileSchema.index({ lastUpdated: 1 });
userBehaviorProfileSchema.index({ 'statistics.dataQuality': 1 });
userBehaviorProfileSchema.index({ 'statistics.accountAgeInDays': 1 });

// Virtual for profile completeness
userBehaviorProfileSchema.virtual('completeness').get(function() {
  let score = 0;
  const maxScore = 100;
  
  if (this.typicalCategories.length > 0) score += 15;
  if (this.typicalMerchants.length > 0) score += 15;
  if (this.activeHours.length > 0) score += 10;
  if (this.typicalLocations.length > 0) score += 15;
  if (this.deviceFingerprints.length > 0) score += 10;
  if (this.statistics.totalTransactions >= 10) score += 10;
  if (this.statistics.totalTransactions >= 50) score += 10;
  if (this.statistics.accountAgeInDays >= 30) score += 15;
  
  return Math.min(score, maxScore);
});

// Virtual for is mature profile
userBehaviorProfileSchema.virtual('isMature').get(function() {
  return this.statistics.totalTransactions >= 20 && 
         this.statistics.accountAgeInDays >= 14;
});

// Methods

/**
 * Update profile with new transaction
 */
userBehaviorProfileSchema.methods.updateWithTransaction = async function(transaction) {
  // Update statistics
  this.statistics.totalTransactions += 1;
  this.statistics.totalSpend += transaction.amount || 0;
  this.statistics.lastTransaction = transaction.date || new Date();
  
  if (!this.statistics.firstTransaction) {
    this.statistics.firstTransaction = transaction.date || new Date();
  }
  
  // Update account age
  const accountAge = Date.now() - new Date(this.statistics.firstTransaction).getTime();
  this.statistics.accountAgeInDays = Math.floor(accountAge / (1000 * 60 * 60 * 24));
  
  // Update averages
  this.avgDailySpend = this.statistics.totalSpend / Math.max(this.statistics.accountAgeInDays, 1);
  this.avgTransactionSize = this.statistics.totalSpend / this.statistics.totalTransactions;
  
  // Update category
  if (transaction.category) {
    this.updateCategory(transaction.category, transaction.amount);
  }
  
  // Update merchant
  if (transaction.merchant) {
    this.updateMerchant(transaction.merchant, transaction.amount, transaction.date);
  }
  
  // Update temporal patterns
  if (transaction.date) {
    this.updateTemporalPatterns(transaction.date, transaction.amount);
  }
  
  // Update location
  if (transaction.location) {
    this.updateLocation(transaction.location, transaction.date);
  }
  
  // Update device
  if (transaction.device) {
    this.updateDevice(transaction.device, transaction.date);
  }
  
  // Update data quality
  this.updateDataQuality();
  
  this.lastUpdated = new Date();
  
  return await this.save();
};

/**
 * Update category statistics
 */
userBehaviorProfileSchema.methods.updateCategory = function(category, amount) {
  let cat = this.typicalCategories.find(c => c.category === category);
  
  if (!cat) {
    cat = {
      category,
      frequency: 0,
      avgAmount: 0,
      percentage: 0,
      lastTransaction: new Date()
    };
    this.typicalCategories.push(cat);
  }
  
  cat.frequency += 1;
  cat.avgAmount = ((cat.avgAmount * (cat.frequency - 1)) + amount) / cat.frequency;
  cat.lastTransaction = new Date();
  
  // Recalculate percentages
  const totalFreq = this.typicalCategories.reduce((sum, c) => sum + c.frequency, 0);
  this.typicalCategories.forEach(c => {
    c.percentage = (c.frequency / totalFreq) * 100;
  });
  
  // Keep only top 20 categories
  this.typicalCategories.sort((a, b) => b.frequency - a.frequency);
  if (this.typicalCategories.length > 20) {
    this.typicalCategories = this.typicalCategories.slice(0, 20);
  }
};

/**
 * Update merchant statistics
 */
userBehaviorProfileSchema.methods.updateMerchant = function(merchant, amount, date) {
  let merch = this.typicalMerchants.find(m => m.merchant === merchant);
  
  if (!merch) {
    merch = {
      merchant,
      frequency: 0,
      avgAmount: 0,
      lastTransaction: date || new Date(),
      isTrusted: false
    };
    this.typicalMerchants.push(merch);
  }
  
  merch.frequency += 1;
  merch.avgAmount = ((merch.avgAmount * (merch.frequency - 1)) + amount) / merch.frequency;
  merch.lastTransaction = date || new Date();
  
  // Mark as trusted if used frequently
  if (merch.frequency >= 5) {
    merch.isTrusted = true;
  }
  
  // Keep only top 50 merchants
  this.typicalMerchants.sort((a, b) => b.frequency - a.frequency);
  if (this.typicalMerchants.length > 50) {
    this.typicalMerchants = this.typicalMerchants.slice(0, 50);
  }
};

/**
 * Update temporal patterns
 */
userBehaviorProfileSchema.methods.updateTemporalPatterns = function(date, amount) {
  const hour = new Date(date).getHours();
  const day = new Date(date).getDay();
  
  // Update hour
  let hourData = this.activeHours.find(h => h.hour === hour);
  if (!hourData) {
    hourData = { hour, transactionCount: 0, avgAmount: 0 };
    this.activeHours.push(hourData);
  }
  hourData.transactionCount += 1;
  hourData.avgAmount = ((hourData.avgAmount * (hourData.transactionCount - 1)) + amount) / hourData.transactionCount;
  
  // Update day
  let dayData = this.activeDaysOfWeek.find(d => d.day === day);
  if (!dayData) {
    dayData = { day, transactionCount: 0, avgAmount: 0 };
    this.activeDaysOfWeek.push(dayData);
  }
  dayData.transactionCount += 1;
  dayData.avgAmount = ((dayData.avgAmount * (dayData.transactionCount - 1)) + amount) / dayData.transactionCount;
};

/**
 * Update location patterns
 */
userBehaviorProfileSchema.methods.updateLocation = function(location, date) {
  let loc = this.typicalLocations.find(l => 
    l.country === location.country && l.city === location.city
  );
  
  if (!loc) {
    loc = {
      country: location.country,
      city: location.city,
      coordinates: location.coordinates,
      frequency: 0,
      lastSeen: date || new Date(),
      radius: 50
    };
    this.typicalLocations.push(loc);
  }
  
  loc.frequency += 1;
  loc.lastSeen = date || new Date();
  
  // Set home location as most frequent
  this.typicalLocations.sort((a, b) => b.frequency - a.frequency);
  if (this.typicalLocations.length > 0) {
    const mostFrequent = this.typicalLocations[0];
    this.homeLocation = {
      country: mostFrequent.country,
      city: mostFrequent.city,
      coordinates: mostFrequent.coordinates
    };
  }
  
  // Keep only top 10 locations
  if (this.typicalLocations.length > 10) {
    this.typicalLocations = this.typicalLocations.slice(0, 10);
  }
};

/**
 * Update device fingerprint
 */
userBehaviorProfileSchema.methods.updateDevice = function(device, date) {
  let dev = this.deviceFingerprints.find(d => d.fingerprint === device.fingerprint);
  
  if (!dev) {
    dev = {
      fingerprint: device.fingerprint,
      deviceType: device.type,
      firstSeen: date || new Date(),
      lastSeen: date || new Date(),
      transactionCount: 0,
      isTrusted: false,
      ipAddresses: []
    };
    this.deviceFingerprints.push(dev);
  }
  
  dev.lastSeen = date || new Date();
  dev.transactionCount += 1;
  
  // Mark as trusted after 3 transactions
  if (dev.transactionCount >= 3) {
    dev.isTrusted = true;
  }
  
  // Update IP addresses
  if (device.ipAddress) {
    const existingIP = dev.ipAddresses.find(ip => ip.ip === device.ipAddress);
    if (existingIP) {
      existingIP.lastSeen = date || new Date();
    } else {
      dev.ipAddresses.push({
        ip: device.ipAddress,
        lastSeen: date || new Date()
      });
    }
    
    // Keep only recent 10 IPs
    if (dev.ipAddresses.length > 10) {
      dev.ipAddresses.sort((a, b) => b.lastSeen - a.lastSeen);
      dev.ipAddresses = dev.ipAddresses.slice(0, 10);
    }
  }
};

/**
 * Update data quality score
 */
userBehaviorProfileSchema.methods.updateDataQuality = function() {
  const txCount = this.statistics.totalTransactions;
  const accountAge = this.statistics.accountAgeInDays;
  
  if (txCount >= 50 && accountAge >= 30) {
    this.statistics.dataQuality = 'high';
  } else if (txCount >= 20 && accountAge >= 14) {
    this.statistics.dataQuality = 'medium';
  } else {
    this.statistics.dataQuality = 'low';
  }
};

/**
 * Calculate anomaly score for transaction
 */
userBehaviorProfileSchema.methods.calculateAnomalyScore = function(transaction) {
  if (!this.isMature) {
    return 0; // Don't score until profile is mature
  }
  
  let score = 0;
  const weights = {
    amount: 0.3,
    category: 0.15,
    merchant: 0.15,
    time: 0.1,
    location: 0.2,
    device: 0.1
  };
  
  // Amount anomaly
  if (transaction.amount > this.avgTransactionSize * 3) {
    score += weights.amount * 100;
  } else if (transaction.amount > this.avgTransactionSize * 2) {
    score += weights.amount * 60;
  }
  
  // Category anomaly
  const categoryMatch = this.typicalCategories.find(c => c.category === transaction.category);
  if (!categoryMatch) {
    score += weights.category * 80;
  } else if (categoryMatch.percentage < 5) {
    score += weights.category * 40;
  }
  
  // Merchant anomaly
  const merchantMatch = this.typicalMerchants.find(m => m.merchant === transaction.merchant);
  if (!merchantMatch) {
    score += weights.merchant * 70;
  } else if (!merchantMatch.isTrusted) {
    score += weights.merchant * 30;
  }
  
  // Time anomaly
  const hour = new Date(transaction.date).getHours();
  const hourMatch = this.activeHours.find(h => h.hour === hour);
  if (!hourMatch || hourMatch.transactionCount < 3) {
    score += weights.time * 50;
  }
  
  // Location anomaly
  if (transaction.location) {
    const locationMatch = this.typicalLocations.find(l => 
      l.country === transaction.location.country
    );
    if (!locationMatch) {
      score += weights.location * 90;
    }
  }
  
  // Device anomaly
  if (transaction.device) {
    const deviceMatch = this.deviceFingerprints.find(d => 
      d.fingerprint === transaction.device.fingerprint
    );
    if (!deviceMatch) {
      score += weights.device * 80;
    } else if (!deviceMatch.isTrusted) {
      score += weights.device * 40;
    }
  }
  
  return Math.min(Math.round(score), 100);
};

/**
 * Full recalculation from transaction history
 */
userBehaviorProfileSchema.methods.recalculateFromHistory = async function(transactions) {
  // Reset all statistics
  this.typicalCategories = [];
  this.typicalMerchants = [];
  this.activeHours = [];
  this.activeDaysOfWeek = [];
  this.typicalLocations = [];
  this.deviceFingerprints = [];
  this.statistics.totalTransactions = 0;
  this.statistics.totalSpend = 0;
  
  // Process all transactions
  for (const tx of transactions) {
    await this.updateWithTransaction(tx);
  }
  
  this.lastFullRecalculation = new Date();
  return await this.save();
};

// Static methods

/**
 * Get or create profile
 */
userBehaviorProfileSchema.statics.getOrCreateProfile = async function(userId) {
  let profile = await this.findOne({ userId });
  
  if (!profile) {
    profile = new this({ userId });
    await profile.save();
  }
  
  return profile;
};

/**
 * Get profiles needing update
 */
userBehaviorProfileSchema.statics.getProfilesNeedingUpdate = async function() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  return await this.find({
    updateFrequency: 'daily',
    lastUpdated: { $lte: oneDayAgo }
  }).lean();
};

/**
 * Get mature profiles
 */
userBehaviorProfileSchema.statics.getMatureProfiles = async function() {
  return await this.find({
    'statistics.totalTransactions': { $gte: 20 },
    'statistics.accountAgeInDays': { $gte: 14 }
  }).lean();
};

const UserBehaviorProfile = mongoose.model('UserBehaviorProfile', userBehaviorProfileSchema);

module.exports = UserBehaviorProfile;
