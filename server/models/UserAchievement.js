const mongoose = require('mongoose');

// User Achievement Progress Schema
const userAchievementSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  achievement: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Achievement',
    required: true
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
    }
  },
  // Status
  status: {
    type: String,
    enum: ['in_progress', 'completed'],
    default: 'in_progress'
  },
  // Completion info
  completedAt: {
    type: Date
  },
  // Whether user has seen/claimed the achievement
  viewed: {
    type: Boolean,
    default: false
  },
  viewedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound index for user achievements
userAchievementSchema.index({ user: 1, achievement: 1 }, { unique: true });
userAchievementSchema.index({ user: 1, status: 1 });
userAchievementSchema.index({ user: 1, completedAt: -1 });

// Virtual for progress percentage
userAchievementSchema.virtual('progressPercentage').get(function() {
  if (this.progress.target === 0) return 0;
  return Math.min(100, Math.round((this.progress.current / this.progress.target) * 100));
});

// Check if achievement is complete
userAchievementSchema.methods.isComplete = function() {
  return this.progress.current >= this.progress.target;
};

module.exports = mongoose.model('UserAchievement', userAchievementSchema);
