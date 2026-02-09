const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  icon: {
    type: String,
    required: true,
    default: '🏆'
  },
  category: {
    type: String,
    required: true,
    enum: ['savings', 'budgeting', 'tracking', 'social', 'challenges', 'streaks', 'milestones', 'special']
  },
  tier: {
    type: String,
    enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    default: 'bronze'
  },
  points: {
    type: Number,
    default: 10,
    min: 0
  },
  requirement: {
    type: {
      type: String,
      required: true,
      enum: [
        'budget_streak',      // Stay under budget for X days/months
        'savings_amount',     // Save total X amount
        'expense_tracking',   // Track X expenses
        'goal_completion',    // Complete X goals
        'challenge_wins',     // Win X challenges
        'login_streak',       // Login X days in a row
        'category_master',    // Track X expenses in one category
        'analytics_usage',    // View analytics X times
        'first_action',       // First time doing something
        'social_engagement',  // Invite/compete with friends
        'no_spend_days',      // Have X no-spend days
        'receipt_uploads',    // Upload X receipts
        'custom'
      ]
    },
    value: {
      type: Number,
      required: true
    },
    category: String,      // For category-specific achievements
    timeframe: String      // 'daily', 'weekly', 'monthly', 'yearly', 'all_time'
  },
  isSecret: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  rarity: {
    type: String,
    enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
    default: 'common'
  }
}, {
  timestamps: true
});

// Indexes
achievementSchema.index({ code: 1 });
achievementSchema.index({ category: 1, isActive: 1 });
achievementSchema.index({ tier: 1 });
achievementSchema.index({ 'requirement.type': 1 });

// Get tier color
achievementSchema.methods.getTierColor = function() {
  const colors = {
    bronze: '#CD7F32',
    silver: '#C0C0C0',
    gold: '#FFD700',
    platinum: '#E5E4E2',
    diamond: '#B9F2FF'
  };
  return colors[this.tier] || colors.bronze;
};

// Static method to get default achievements
achievementSchema.statics.getDefaultAchievements = function() {
  return [
    // Budget achievements
    {
      code: 'BUDGET_BEGINNER',
      name: 'Budget Beginner',
      description: 'Stay under budget for 7 consecutive days',
      icon: '📊',
      category: 'budgeting',
      tier: 'bronze',
      points: 50,
      requirement: { type: 'budget_streak', value: 7, timeframe: 'daily' },
      rarity: 'common'
    },
    {
      code: 'BUDGET_MASTER',
      name: 'Budget Master',
      description: 'Stay under budget for 3 consecutive months',
      icon: '🏆',
      category: 'budgeting',
      tier: 'gold',
      points: 500,
      requirement: { type: 'budget_streak', value: 90, timeframe: 'daily' },
      rarity: 'rare'
    },
    // Savings achievements
    {
      code: 'FIRST_SAVINGS',
      name: 'First Savings',
      description: 'Save your first ₹1,000',
      icon: '💰',
      category: 'savings',
      tier: 'bronze',
      points: 25,
      requirement: { type: 'savings_amount', value: 1000 },
      rarity: 'common'
    },
    {
      code: 'SAVINGS_CHAMPION',
      name: 'Savings Champion',
      description: 'Save ₹50,000 total',
      icon: '🏅',
      category: 'savings',
      tier: 'gold',
      points: 400,
      requirement: { type: 'savings_amount', value: 50000 },
      rarity: 'rare'
    },
    // Streak achievements
    {
      code: 'WEEK_WARRIOR',
      name: 'Week Warrior',
      description: 'Log expenses for 7 consecutive days',
      icon: '⚡',
      category: 'streaks',
      tier: 'bronze',
      points: 50,
      requirement: { type: 'login_streak', value: 7 },
      rarity: 'common'
    },
    {
      code: 'MONTH_MASTER',
      name: 'Month Master',
      description: 'Log expenses for 30 consecutive days',
      icon: '🌟',
      category: 'streaks',
      tier: 'silver',
      points: 200,
      requirement: { type: 'login_streak', value: 30 },
      rarity: 'uncommon'
    },
    // Milestone achievements
    {
      code: 'FIRST_EXPENSE',
      name: 'First Expense',
      description: 'Log your first expense',
      icon: '✨',
      category: 'milestones',
      tier: 'bronze',
      points: 10,
      requirement: { type: 'expense_tracking', value: 1 },
      rarity: 'common'
    },
    {
      code: 'EXPENSE_EXPERT',
      name: 'Expense Expert',
      description: 'Log 1,000 expenses',
      icon: '📚',
      category: 'milestones',
      tier: 'gold',
      points: 500,
      requirement: { type: 'expense_tracking', value: 1000 },
      rarity: 'rare'
    },
    // Social achievements
    {
      code: 'SOCIAL_BUTTERFLY',
      name: 'Social Butterfly',
      description: 'Invite your first friend',
      icon: '🦋',
      category: 'social',
      tier: 'bronze',
      points: 30,
      requirement: { type: 'social_engagement', value: 1 },
      rarity: 'common'
    },
    {
      code: 'CHALLENGE_CHAMPION',
      name: 'Challenge Champion',
      description: 'Complete 10 challenges',
      icon: '🏅',
      category: 'challenges',
      tier: 'gold',
      points: 400,
      requirement: { type: 'challenge_wins', value: 10 },
      rarity: 'rare'
    }
  ];
};

module.exports = mongoose.model('Achievement', achievementSchema);
