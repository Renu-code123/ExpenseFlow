const mongoose = require('mongoose');

const earnedAchievementSchema = new mongoose.Schema({
  achievement: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Achievement',
    required: true
  },
  earnedAt: {
    type: Date,
    default: Date.now
  },
  progress: {
    type: Number,
    default: 100
  }
}, { _id: false });

const streakSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['login', 'expense_tracking', 'budget_adherence', 'no_spend', 'savings']
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  longestStreak: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  startDate: Date
}, { _id: false });

const achievementProgressSchema = new mongoose.Schema({
  achievementCode: {
    type: String,
    required: true
  },
  currentValue: {
    type: Number,
    default: 0
  },
  targetValue: {
    type: Number,
    required: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const userGamificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  totalPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  level: {
    type: Number,
    default: 1,
    min: 1
  },
  experience: {
    type: Number,
    default: 0,
    min: 0
  },
  experienceToNextLevel: {
    type: Number,
    default: 100
  },
  earnedAchievements: [earnedAchievementSchema],
  achievementProgress: [achievementProgressSchema],
  streaks: [streakSchema],
  challengesCompleted: {
    type: Number,
    default: 0
  },
  challengesJoined: {
    type: Number,
    default: 0
  },
  totalSavedFromChallenges: {
    type: Number,
    default: 0
  },
  rank: {
    type: String,
    enum: ['novice', 'apprentice', 'adept', 'expert', 'master', 'grandmaster', 'legend'],
    default: 'novice'
  },
  weeklyPoints: {
    type: Number,
    default: 0
  },
  monthlyPoints: {
    type: Number,
    default: 0
  },
  lastWeeklyReset: {
    type: Date,
    default: Date.now
  },
  lastMonthlyReset: {
    type: Date,
    default: Date.now
  },
  privacySettings: {
    showOnLeaderboard: {
      type: Boolean,
      default: true
    },
    showAchievements: {
      type: Boolean,
      default: true
    },
    showChallenges: {
      type: Boolean,
      default: true
    },
    showStats: {
      type: Boolean,
      default: false
    }
  },
  stats: {
    totalNoSpendDays: {
      type: Number,
      default: 0
    },
    totalExpensesTracked: {
      type: Number,
      default: 0
    },
    totalReceiptsUploaded: {
      type: Number,
      default: 0
    },
    totalGoalsCompleted: {
      type: Number,
      default: 0
    },
    analyticsViews: {
      type: Number,
      default: 0
    },
    lastLoginDate: Date,
    loginStreak: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes
userGamificationSchema.index({ user: 1 });
userGamificationSchema.index({ totalPoints: -1 });
userGamificationSchema.index({ weeklyPoints: -1 });
userGamificationSchema.index({ monthlyPoints: -1 });
userGamificationSchema.index({ level: -1 });
userGamificationSchema.index({ 'privacySettings.showOnLeaderboard': 1, totalPoints: -1 });

// Calculate level from experience
userGamificationSchema.methods.calculateLevel = function() {
  // Level formula: each level requires progressively more XP
  // Level 1: 0 XP, Level 2: 100 XP, Level 3: 250 XP, etc.
  let level = 1;
  let totalXpNeeded = 0;
  const baseXp = 100;
  
  while (this.experience >= totalXpNeeded + (baseXp * level * 1.5)) {
    totalXpNeeded += Math.floor(baseXp * level * 1.5);
    level++;
  }
  
  this.level = level;
  this.experienceToNextLevel = Math.floor(baseXp * level * 1.5) - (this.experience - totalXpNeeded);
  
  // Update rank based on level
  if (level >= 50) this.rank = 'legend';
  else if (level >= 40) this.rank = 'grandmaster';
  else if (level >= 30) this.rank = 'master';
  else if (level >= 20) this.rank = 'expert';
  else if (level >= 10) this.rank = 'adept';
  else if (level >= 5) this.rank = 'apprentice';
  else this.rank = 'novice';
  
  return this.level;
};

// Add points and experience
userGamificationSchema.methods.addPoints = function(points) {
  this.totalPoints += points;
  this.weeklyPoints += points;
  this.monthlyPoints += points;
  this.experience += points;
  this.calculateLevel();
};

// Check if user has achievement
userGamificationSchema.methods.hasAchievement = function(achievementId) {
  return this.earnedAchievements.some(
    ea => ea.achievement.toString() === achievementId.toString()
  );
};

// Get achievement progress
userGamificationSchema.methods.getProgress = function(achievementCode) {
  return this.achievementProgress.find(ap => ap.achievementCode === achievementCode);
};

// Update streak
userGamificationSchema.methods.updateStreak = function(type, increment = true) {
  let streak = this.streaks.find(s => s.type === type);
  
  if (!streak) {
    streak = {
      type,
      currentStreak: 0,
      longestStreak: 0,
      lastUpdated: new Date(),
      startDate: new Date()
    };
    this.streaks.push(streak);
    streak = this.streaks[this.streaks.length - 1];
  }
  
  const now = new Date();
  const lastUpdate = new Date(streak.lastUpdated);
  const daysSinceUpdate = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));
  
  if (increment) {
    if (daysSinceUpdate <= 1) {
      streak.currentStreak++;
    } else {
      streak.currentStreak = 1;
      streak.startDate = now;
    }
    
    if (streak.currentStreak > streak.longestStreak) {
      streak.longestStreak = streak.currentStreak;
    }
  } else {
    streak.currentStreak = 0;
    streak.startDate = null;
  }
  
  streak.lastUpdated = now;
  return streak;
};

module.exports = mongoose.model('UserGamification', userGamificationSchema);
