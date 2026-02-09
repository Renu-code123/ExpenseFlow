const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  progress: {
    type: Number,
    default: 0,
    min: 0
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  bestStreak: {
    type: Number,
    default: 0
  },
  completedDays: [{
    date: Date,
    value: Number
  }],
  status: {
    type: String,
    enum: ['active', 'completed', 'failed', 'withdrawn'],
    default: 'active'
  },
  completedAt: Date,
  savedAmount: {
    type: Number,
    default: 0
  }
}, { _id: false });

const challengeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  type: {
    type: String,
    required: true,
    enum: [
      'no_spend',           // No spending days challenge
      'category_reduction', // Reduce spending in a category
      'savings_target',     // Save a specific amount
      'streak',             // Maintain a behavior streak
      'budget_adherence',   // Stay under budget
      'custom'              // User-defined challenge
    ]
  },
  category: {
    type: String,
    enum: ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'coffee', 'dining', 'other', 'all'],
    default: 'all'
  },
  targetValue: {
    type: Number,
    required: true,
    min: 0
  },
  targetUnit: {
    type: String,
    enum: ['days', 'amount', 'percentage', 'count'],
    default: 'days'
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  isSystemChallenge: {
    type: Boolean,
    default: false
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'extreme'],
    default: 'medium'
  },
  rewardPoints: {
    type: Number,
    default: 100
  },
  rewardBadge: {
    type: String,
    default: null
  },
  participants: [participantSchema],
  maxParticipants: {
    type: Number,
    default: 0 // 0 means unlimited
  },
  invitedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  rules: {
    type: String,
    maxlength: 1000
  },
  icon: {
    type: String,
    default: '🎯'
  },
  status: {
    type: String,
    enum: ['upcoming', 'active', 'completed', 'cancelled'],
    default: 'upcoming'
  }
}, {
  timestamps: true
});

// Indexes
challengeSchema.index({ creator: 1, status: 1 });
challengeSchema.index({ isPublic: 1, status: 1, startDate: 1 });
challengeSchema.index({ 'participants.user': 1, status: 1 });
challengeSchema.index({ endDate: 1, status: 1 });

// Virtual for participant count
challengeSchema.virtual('participantCount').get(function() {
  return this.participants.length;
});

// Check if user is participant
challengeSchema.methods.isParticipant = function(userId) {
  return this.participants.some(p => p.user.toString() === userId.toString());
};

// Get participant data
challengeSchema.methods.getParticipant = function(userId) {
  return this.participants.find(p => p.user.toString() === userId.toString());
};

// Calculate days remaining
challengeSchema.methods.getDaysRemaining = function() {
  const now = new Date();
  const end = new Date(this.endDate);
  const diffTime = end - now;
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
};

// Check if challenge is active
challengeSchema.methods.isActive = function() {
  const now = new Date();
  return this.status === 'active' && now >= this.startDate && now <= this.endDate;
};

// Add participant
challengeSchema.methods.addParticipant = async function(userId) {
  if (this.isParticipant(userId)) {
    throw new Error('User already participating in this challenge');
  }
  
  if (this.maxParticipants > 0 && this.participants.length >= this.maxParticipants) {
    throw new Error('Challenge has reached maximum participants');
  }

  this.participants.push({
    user: userId,
    joinedAt: new Date(),
    progress: 0,
    status: 'active'
  });
  
  await this.save();
  return this;
};

// Update participant progress
challengeSchema.methods.updateProgress = async function(userId, progress, dailyData = null) {
  const participant = this.getParticipant(userId);
  if (!participant) {
    throw new Error('User is not participating in this challenge');
  }

  participant.progress = Math.max(participant.progress, progress);
  
  if (dailyData) {
    participant.completedDays.push(dailyData);
    if (dailyData.value > 0) {
      participant.currentStreak++;
      participant.bestStreak = Math.max(participant.bestStreak, participant.currentStreak);
    } else {
      participant.currentStreak = 0;
    }
  }

  // Check if completed
  if (participant.progress >= this.targetValue && participant.status === 'active') {
    participant.status = 'completed';
    participant.completedAt = new Date();
  }

  await this.save();
  return participant;
};

// Get leaderboard
challengeSchema.methods.getLeaderboard = function(limit = 10) {
  return this.participants
    .sort((a, b) => {
      if (b.status === 'completed' && a.status !== 'completed') return 1;
      if (a.status === 'completed' && b.status !== 'completed') return -1;
      if (b.progress !== a.progress) return b.progress - a.progress;
      return new Date(a.completedAt) - new Date(b.completedAt);
    })
    .slice(0, limit);
};

// Static method to get active challenges for user
challengeSchema.statics.getActiveForUser = async function(userId) {
  const now = new Date();
  return await this.find({
    status: 'active',
    startDate: { $lte: now },
    endDate: { $gte: now },
    'participants.user': userId
  }).populate('creator', 'name email');
};

// Static method to get public challenges
challengeSchema.statics.getPublicChallenges = async function(options = {}) {
  const { page = 1, limit = 20, type, status = 'active' } = options;
  const query = { isPublic: true, status };
  
  if (type) query.type = type;

  return await this.find(query)
    .populate('creator', 'name')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit);
};

// Pre-defined challenge templates
challengeSchema.statics.getTemplates = function() {
  return [
    {
      title: 'No Spend Days Challenge',
      description: 'Complete days with zero discretionary spending. Build discipline and awareness.',
      type: 'no_spend',
      icon: '🚫',
      targetValue: 7,
      targetUnit: 'days',
      rewardPoints: 150,
      difficulty: 'medium'
    },
    {
      title: 'Coffee Shop Savings',
      description: 'Reduce your coffee shop expenses by making coffee at home.',
      type: 'category_reduction',
      icon: '☕',
      category: 'food',
      targetValue: 50,
      targetUnit: 'percentage',
      rewardPoints: 200,
      difficulty: 'medium'
    },
    {
      title: 'Budget Streak Master',
      description: 'Stay under your daily budget for consecutive days.',
      type: 'budget_adherence',
      icon: '🔥',
      targetValue: 30,
      targetUnit: 'days',
      rewardPoints: 300,
      difficulty: 'hard'
    }
  ];
};

module.exports = mongoose.model('Challenge', challengeSchema);
