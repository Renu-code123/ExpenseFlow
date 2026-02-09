const mongoose = require('mongoose');

// Challenge Participation Schema
const challengeParticipantSchema = new mongoose.Schema({
  challenge: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Challenge',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Participation status
  status: {
    type: String,
    enum: ['joined', 'active', 'completed', 'failed', 'withdrawn'],
    default: 'joined'
  },
  // Progress tracking
  progress: {
    current: {
      type: Number,
      default: 0
    },
    target: {
      type: Number,
      required: true
    },
    // Daily progress for streak-based challenges
    dailyProgress: [{
      date: Date,
      value: Number,
      achieved: Boolean
    }]
  },
  // Streak tracking
  streak: {
    current: {
      type: Number,
      default: 0
    },
    longest: {
      type: Number,
      default: 0
    },
    lastUpdated: Date
  },
  // Dates
  joinedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  // Points earned
  pointsEarned: {
    type: Number,
    default: 0
  },
  // Rank in challenge (calculated)
  rank: {
    type: Number
  },
  // Notes
  notes: {
    type: String,
    maxlength: 500
  },
  // Privacy settings
  showProgress: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index
challengeParticipantSchema.index({ challenge: 1, user: 1 }, { unique: true });
challengeParticipantSchema.index({ challenge: 1, status: 1 });
challengeParticipantSchema.index({ user: 1, status: 1 });
challengeParticipantSchema.index({ challenge: 1, 'progress.current': -1 });

// Virtual for progress percentage
challengeParticipantSchema.virtual('progressPercentage').get(function() {
  if (this.progress.target === 0) return 0;
  return Math.min(100, Math.round((this.progress.current / this.progress.target) * 100));
});

// Check if participant completed the challenge
challengeParticipantSchema.methods.hasCompleted = function() {
  return this.progress.current >= this.progress.target;
};

// Update streak
challengeParticipantSchema.methods.updateStreak = function(achieved) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const lastUpdate = this.streak.lastUpdated ? new Date(this.streak.lastUpdated) : null;
  if (lastUpdate) {
    lastUpdate.setHours(0, 0, 0, 0);
  }

  // Check if this is a new day
  if (!lastUpdate || today > lastUpdate) {
    if (achieved) {
      // Check if streak continues (yesterday or first update)
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (!lastUpdate || lastUpdate.getTime() === yesterday.getTime()) {
        this.streak.current++;
      } else {
        this.streak.current = 1;
      }
      
      if (this.streak.current > this.streak.longest) {
        this.streak.longest = this.streak.current;
      }
    } else {
      this.streak.current = 0;
    }
    
    this.streak.lastUpdated = today;
  }

  return this.streak;
};

module.exports = mongoose.model('ChallengeParticipant', challengeParticipantSchema);
