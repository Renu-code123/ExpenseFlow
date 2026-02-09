const Challenge = require('../models/Challenge');
const Achievement = require('../models/Achievement');
const UserGamification = require('../models/UserGamification');
const Expense = require('../models/Expense');
const Goal = require('../models/Goal');
const mongoose = require('mongoose');

class GamificationService {
  /**
   * Initialize or get user gamification profile
   */
  async getOrCreateProfile(userId) {
    let profile = await UserGamification.findOne({ user: userId });
    
    if (!profile) {
      profile = new UserGamification({ user: userId });
      await profile.save();
      
      // Check for first-time achievements
      await this.checkAchievement(userId, 'first_login');
    }
    
    return profile;
  }

  /**
   * Award points to user
   */
  async awardPoints(userId, points, reason) {
    const profile = await this.getOrCreateProfile(userId);
    profile.addPoints(points);
    await profile.save();
    
    // Emit notification if socket available
    if (global.io) {
      global.io.to(`user_${userId}`).emit('points_earned', {
        points,
        reason,
        totalPoints: profile.totalPoints,
        level: profile.level
      });
    }
    
    return profile;
  }

  /**
   * Update user streak
   */
  async updateStreak(userId, type) {
    const profile = await this.getOrCreateProfile(userId);
    const streak = profile.updateStreak(type, true);
    await profile.save();
    
    // Check streak-based achievements
    await this.checkStreakAchievements(userId, type, streak.currentStreak);
    
    return streak;
  }

  /**
   * Check and award achievements
   */
  async checkAchievement(userId, type, value = 1, category = null) {
    const profile = await this.getOrCreateProfile(userId);
    
    // Find matching achievements
    const query = {
      'requirement.type': type,
      isActive: true
    };
    
    if (category) {
      query['requirement.category'] = category;
    }
    
    const achievements = await Achievement.find(query);
    const newlyEarned = [];
    
    for (const achievement of achievements) {
      // Skip if already earned
      if (profile.hasAchievement(achievement._id)) continue;
      
      // Update or create progress
      let progress = profile.getProgress(achievement.code);
      
      if (!progress) {
        profile.achievementProgress.push({
          achievementCode: achievement.code,
          currentValue: 0,
          targetValue: achievement.requirement.value
        });
        progress = profile.achievementProgress[profile.achievementProgress.length - 1];
      }
      
      // Update progress
      progress.currentValue = Math.max(progress.currentValue, value);
      progress.lastUpdated = new Date();
      
      // Check if achievement is earned
      if (progress.currentValue >= achievement.requirement.value) {
        profile.earnedAchievements.push({
          achievement: achievement._id,
          earnedAt: new Date(),
          progress: 100
        });
        
        // Award points
        profile.addPoints(achievement.points);
        
        newlyEarned.push({
          achievement,
          points: achievement.points
        });
      }
    }
    
    await profile.save();
    
    // Send notifications for new achievements
    if (newlyEarned.length > 0 && global.io) {
      for (const earned of newlyEarned) {
        global.io.to(`user_${userId}`).emit('achievement_unlocked', {
          name: earned.achievement.name,
          description: earned.achievement.description,
          icon: earned.achievement.icon,
          points: earned.points,
          tier: earned.achievement.tier
        });
      }
    }
    
    return newlyEarned;
  }

  /**
   * Check streak-based achievements
   */
  async checkStreakAchievements(userId, streakType, currentStreak) {
    const typeMapping = {
      'login': 'login_streak',
      'expense_tracking': 'expense_tracking',
      'budget_adherence': 'budget_streak',
      'no_spend': 'no_spend_days'
    };
    
    const achievementType = typeMapping[streakType];
    if (achievementType) {
      await this.checkAchievement(userId, achievementType, currentStreak);
    }
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(type = 'all_time', limit = 50, userId = null) {
    let sortField;
    
    switch (type) {
      case 'weekly':
        sortField = 'weeklyPoints';
        break;
      case 'monthly':
        sortField = 'monthlyPoints';
        break;
      default:
        sortField = 'totalPoints';
    }
    
    const leaderboard = await UserGamification.find({
      'privacySettings.showOnLeaderboard': true
    })
      .sort({ [sortField]: -1 })
      .limit(limit)
      .populate('user', 'name email')
      .lean();
    
    // Add rank positions
    const result = leaderboard.map((entry, index) => ({
      rank: index + 1,
      userId: entry.user._id,
      name: entry.user.name,
      points: entry[sortField],
      level: entry.level,
      rankTitle: entry.rank,
      achievementCount: entry.earnedAchievements.length
    }));
    
    // If userId provided, add user's position if not in top
    if (userId) {
      const userInList = result.find(r => r.userId.toString() === userId.toString());
      
      if (!userInList) {
        const userProfile = await UserGamification.findOne({ user: userId })
          .populate('user', 'name');
        
        if (userProfile) {
          const userRank = await UserGamification.countDocuments({
            'privacySettings.showOnLeaderboard': true,
            [sortField]: { $gt: userProfile[sortField] }
          }) + 1;
          
          result.push({
            rank: userRank,
            userId: userProfile.user._id,
            name: userProfile.user.name,
            points: userProfile[sortField],
            level: userProfile.level,
            rankTitle: userProfile.rank,
            achievementCount: userProfile.earnedAchievements.length,
            isCurrentUser: true
          });
        }
      } else {
        userInList.isCurrentUser = true;
      }
    }
    
    return result;
  }

  /**
   * Create a challenge
   */
  async createChallenge(creatorId, challengeData) {
    const challenge = new Challenge({
      ...challengeData,
      creator: creatorId,
      participants: [{
        user: creatorId,
        joinedAt: new Date(),
        status: 'active'
      }]
    });
    
    // Update challenge status based on dates
    const now = new Date();
    if (challenge.startDate <= now && challenge.endDate > now) {
      challenge.status = 'active';
    } else if (challenge.startDate > now) {
      challenge.status = 'upcoming';
    }
    
    await challenge.save();
    
    // Award points for creating challenge
    await this.awardPoints(creatorId, 10, 'Created a challenge');
    
    // Update user stats
    const profile = await this.getOrCreateProfile(creatorId);
    profile.challengesJoined++;
    await profile.save();
    
    return challenge;
  }

  /**
   * Join a challenge
   */
  async joinChallenge(userId, challengeId) {
    const challenge = await Challenge.findById(challengeId);
    
    if (!challenge) {
      throw new Error('Challenge not found');
    }
    
    if (challenge.status === 'completed' || challenge.status === 'cancelled') {
      throw new Error('This challenge is no longer active');
    }
    
    if (challenge.isParticipant(userId)) {
      throw new Error('Already participating in this challenge');
    }
    
    if (challenge.maxParticipants > 0 && challenge.participants.length >= challenge.maxParticipants) {
      throw new Error('Challenge is full');
    }
    
    challenge.participants.push({
      user: userId,
      joinedAt: new Date(),
      status: 'active'
    });
    
    await challenge.save();
    
    // Update user stats
    const profile = await this.getOrCreateProfile(userId);
    profile.challengesJoined++;
    await profile.save();
    
    // Award points for joining
    await this.awardPoints(userId, 5, 'Joined a challenge');
    
    return challenge;
  }

  /**
   * Update challenge progress for a user
   */
  async updateChallengeProgress(userId, challengeId, progressData) {
    const challenge = await Challenge.findById(challengeId);
    
    if (!challenge) {
      throw new Error('Challenge not found');
    }
    
    const participant = challenge.getParticipant(userId);
    
    if (!participant) {
      throw new Error('Not a participant of this challenge');
    }
    
    // Update progress based on challenge type
    participant.progress = progressData.progress || participant.progress;
    participant.currentStreak = progressData.currentStreak || participant.currentStreak;
    participant.savedAmount = progressData.savedAmount || participant.savedAmount;
    
    if (progressData.completedDay) {
      participant.completedDays.push({
        date: new Date(),
        value: progressData.dayValue || 0
      });
    }
    
    if (participant.currentStreak > participant.bestStreak) {
      participant.bestStreak = participant.currentStreak;
    }
    
    // Check if challenge completed
    if (participant.progress >= 100 && participant.status === 'active') {
      participant.status = 'completed';
      participant.completedAt = new Date();
      
      // Award completion points
      await this.completeChallengeForUser(userId, challenge);
    }
    
    await challenge.save();
    
    return challenge;
  }

  /**
   * Complete challenge for user
   */
  async completeChallengeForUser(userId, challenge) {
    const profile = await this.getOrCreateProfile(userId);
    
    // Award points
    await this.awardPoints(userId, challenge.rewardPoints, `Completed challenge: ${challenge.title}`);
    
    // Update stats
    profile.challengesCompleted++;
    
    const participant = challenge.getParticipant(userId);
    if (participant && participant.savedAmount) {
      profile.totalSavedFromChallenges += participant.savedAmount;
    }
    
    await profile.save();
    
    // Check challenge-related achievements
    await this.checkAchievement(userId, 'challenge_wins', profile.challengesCompleted);
    
    // Award badge if challenge has one
    if (challenge.rewardBadge) {
      // Badge logic would go here
    }
    
    // Emit notification
    if (global.io) {
      global.io.to(`user_${userId}`).emit('challenge_completed', {
        challengeTitle: challenge.title,
        points: challenge.rewardPoints
      });
    }
  }

  /**
   * Calculate challenge progress based on expenses
   */
  async calculateChallengeProgress(userId, challengeId) {
    const challenge = await Challenge.findById(challengeId);
    
    if (!challenge) {
      throw new Error('Challenge not found');
    }
    
    const participant = challenge.getParticipant(userId);
    
    if (!participant) {
      throw new Error('Not a participant');
    }
    
    let progress = 0;
    let savedAmount = 0;
    
    const startDate = new Date(Math.max(challenge.startDate, participant.joinedAt));
    const endDate = new Date(Math.min(challenge.endDate, new Date()));
    
    switch (challenge.type) {
      case 'no_spend': {
        // Count days with no spending
        const expenses = await Expense.aggregate([
          {
            $match: {
              user: new mongoose.Types.ObjectId(userId),
              type: 'expense',
              date: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$date' }
              },
              total: { $sum: '$amount' }
            }
          }
        ]);
        
        const daysWithExpenses = new Set(expenses.map(e => e._id));
        const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        const noSpendDays = totalDays - daysWithExpenses.size;
        
        progress = Math.min(100, (noSpendDays / challenge.targetValue) * 100);
        break;
      }
      
      case 'category_reduction': {
        // Compare spending in category to previous period
        const periodLength = Math.ceil((challenge.endDate - challenge.startDate) / (1000 * 60 * 60 * 24));
        const previousStart = new Date(challenge.startDate);
        previousStart.setDate(previousStart.getDate() - periodLength);
        
        const categoryQuery = challenge.category === 'all' 
          ? {} 
          : { category: challenge.category };
        
        const [currentPeriod, previousPeriod] = await Promise.all([
          Expense.aggregate([
            {
              $match: {
                user: new mongoose.Types.ObjectId(userId),
                type: 'expense',
                date: { $gte: startDate, $lte: endDate },
                ...categoryQuery
              }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]),
          Expense.aggregate([
            {
              $match: {
                user: new mongoose.Types.ObjectId(userId),
                type: 'expense',
                date: { $gte: previousStart, $lt: challenge.startDate },
                ...categoryQuery
              }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ])
        ]);
        
        const currentTotal = currentPeriod[0]?.total || 0;
        const previousTotal = previousPeriod[0]?.total || 1;
        
        const reduction = ((previousTotal - currentTotal) / previousTotal) * 100;
        savedAmount = Math.max(0, previousTotal - currentTotal);
        progress = Math.min(100, (reduction / challenge.targetValue) * 100);
        break;
      }
      
      case 'savings_target': {
        // Calculate net savings
        const stats = await Expense.aggregate([
          {
            $match: {
              user: new mongoose.Types.ObjectId(userId),
              date: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: '$type',
              total: { $sum: '$amount' }
            }
          }
        ]);
        
        let income = 0, expenses = 0;
        stats.forEach(s => {
          if (s._id === 'income') income = s.total;
          if (s._id === 'expense') expenses = s.total;
        });
        
        savedAmount = Math.max(0, income - expenses);
        progress = Math.min(100, (savedAmount / challenge.targetValue) * 100);
        break;
      }
      
      case 'budget_adherence': {
        // Check if staying under budget
        // This would integrate with the budget system
        const Budget = require('../models/Budget');
        const budgets = await Budget.find({
          user: userId,
          startDate: { $lte: endDate },
          endDate: { $gte: startDate }
        });
        
        if (budgets.length > 0) {
          let underBudgetDays = 0;
          const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
          
          // Simplified: check if overall spending is under budget
          for (const budget of budgets) {
            const spent = await Expense.aggregate([
              {
                $match: {
                  user: new mongoose.Types.ObjectId(userId),
                  type: 'expense',
                  date: { $gte: budget.startDate, $lte: budget.endDate },
                  category: budget.category
                }
              },
              { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            
            if (!spent[0] || spent[0].total <= budget.amount) {
              underBudgetDays += totalDays;
            }
          }
          
          progress = Math.min(100, (underBudgetDays / challenge.targetValue) * 100);
        }
        break;
      }
      
      case 'streak': {
        progress = Math.min(100, (participant.currentStreak / challenge.targetValue) * 100);
        break;
      }
      
      default:
        // Custom challenge - use manual progress updates
        break;
    }
    
    // Update participant
    await this.updateChallengeProgress(userId, challengeId, {
      progress: Math.round(progress),
      savedAmount
    });
    
    return { progress: Math.round(progress), savedAmount };
  }

  /**
   * Get active challenges for user
   */
  async getUserChallenges(userId, status = null) {
    const query = {
      'participants.user': userId
    };
    
    if (status) {
      query.status = status;
    }
    
    const challenges = await Challenge.find(query)
      .populate('creator', 'name')
      .sort({ startDate: -1 });
    
    return challenges.map(challenge => {
      const participant = challenge.getParticipant(userId);
      return {
        ...challenge.toObject(),
        userProgress: participant?.progress || 0,
        userStatus: participant?.status || 'active',
        userStreak: participant?.currentStreak || 0,
        daysRemaining: challenge.getDaysRemaining()
      };
    });
  }

  /**
   * Get available public challenges
   */
  async getPublicChallenges(userId, filters = {}) {
    const query = {
      isPublic: true,
      status: { $in: ['upcoming', 'active'] }
    };
    
    if (filters.type) {
      query.type = filters.type;
    }
    
    if (filters.difficulty) {
      query.difficulty = filters.difficulty;
    }
    
    const challenges = await Challenge.find(query)
      .populate('creator', 'name')
      .sort({ startDate: 1 })
      .limit(filters.limit || 20);
    
    return challenges.map(challenge => ({
      ...challenge.toObject(),
      isJoined: challenge.isParticipant(userId),
      participantCount: challenge.participants.length,
      daysRemaining: challenge.getDaysRemaining()
    }));
  }

  /**
   * Get user achievements with progress
   */
  async getUserAchievements(userId) {
    const profile = await this.getOrCreateProfile(userId);
    const allAchievements = await Achievement.find({ isActive: true });
    
    return allAchievements.map(achievement => {
      const isEarned = profile.hasAchievement(achievement._id);
      const progress = profile.getProgress(achievement.code);
      
      // Hide secret achievements that aren't earned
      if (achievement.isSecret && !isEarned) {
        return {
          id: achievement._id,
          name: '???',
          description: 'Secret achievement',
          icon: '🔒',
          category: achievement.category,
          tier: achievement.tier,
          isSecret: true,
          isEarned: false,
          progress: 0
        };
      }
      
      return {
        id: achievement._id,
        code: achievement.code,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        category: achievement.category,
        tier: achievement.tier,
        points: achievement.points,
        rarity: achievement.rarity,
        isEarned,
        earnedAt: isEarned 
          ? profile.earnedAchievements.find(ea => ea.achievement.toString() === achievement._id.toString())?.earnedAt 
          : null,
        progress: progress 
          ? Math.min(100, Math.round((progress.currentValue / progress.targetValue) * 100))
          : 0,
        currentValue: progress?.currentValue || 0,
        targetValue: achievement.requirement.value
      };
    });
  }

  /**
   * Track expense for gamification
   */
  async trackExpense(userId, expense) {
    const profile = await this.getOrCreateProfile(userId);
    
    // Update stats
    profile.stats.totalExpensesTracked++;
    await profile.save();
    
    // Check expense tracking achievements
    await this.checkAchievement(userId, 'expense_tracking', profile.stats.totalExpensesTracked);
    
    // Update expense tracking streak
    await this.updateStreak(userId, 'expense_tracking');
    
    // Award points for tracking
    await this.awardPoints(userId, 1, 'Tracked an expense');
    
    // Update active challenges
    const activeChallenges = await Challenge.find({
      'participants.user': userId,
      status: 'active'
    });
    
    for (const challenge of activeChallenges) {
      await this.calculateChallengeProgress(userId, challenge._id);
    }
  }

  /**
   * Track login for streak
   */
  async trackLogin(userId) {
    const profile = await this.getOrCreateProfile(userId);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastLogin = profile.stats.lastLoginDate 
      ? new Date(profile.stats.lastLoginDate) 
      : null;
    
    if (!lastLogin || lastLogin < today) {
      profile.stats.lastLoginDate = now;
      
      // Update login streak
      if (lastLogin) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (lastLogin >= yesterday) {
          profile.stats.loginStreak++;
        } else {
          profile.stats.loginStreak = 1;
        }
      } else {
        profile.stats.loginStreak = 1;
      }
      
      await profile.save();
      
      // Check login streak achievements
      await this.checkAchievement(userId, 'login_streak', profile.stats.loginStreak);
      
      // Award daily login points
      await this.awardPoints(userId, 2, 'Daily login');
    }
    
    return profile;
  }

  /**
   * Track analytics view
   */
  async trackAnalyticsView(userId) {
    const profile = await this.getOrCreateProfile(userId);
    profile.stats.analyticsViews++;
    await profile.save();
    
    await this.checkAchievement(userId, 'analytics_usage', profile.stats.analyticsViews);
  }

  /**
   * Track goal completion
   */
  async trackGoalCompletion(userId) {
    const profile = await this.getOrCreateProfile(userId);
    profile.stats.totalGoalsCompleted++;
    await profile.save();
    
    await this.checkAchievement(userId, 'goal_completion', profile.stats.totalGoalsCompleted);
    await this.awardPoints(userId, 50, 'Completed a financial goal');
  }

  /**
   * Track receipt upload
   */
  async trackReceiptUpload(userId) {
    const profile = await this.getOrCreateProfile(userId);
    profile.stats.totalReceiptsUploaded++;
    await profile.save();
    
    await this.checkAchievement(userId, 'receipt_uploads', profile.stats.totalReceiptsUploaded);
    await this.awardPoints(userId, 3, 'Uploaded a receipt');
  }

  /**
   * Initialize default achievements
   */
  async initializeDefaultAchievements() {
    const defaultAchievements = [
      // Savings achievements
      {
        code: 'first_savings',
        name: 'First Steps',
        description: 'Track your first expense',
        icon: '🌱',
        category: 'tracking',
        tier: 'bronze',
        points: 10,
        requirement: { type: 'expense_tracking', value: 1 },
        rarity: 'common'
      },
      {
        code: 'expense_tracker_50',
        name: 'Dedicated Tracker',
        description: 'Track 50 expenses',
        icon: '📝',
        category: 'tracking',
        tier: 'silver',
        points: 25,
        requirement: { type: 'expense_tracking', value: 50 },
        rarity: 'uncommon'
      },
      {
        code: 'expense_tracker_500',
        name: 'Tracking Master',
        description: 'Track 500 expenses',
        icon: '🏆',
        category: 'tracking',
        tier: 'gold',
        points: 100,
        requirement: { type: 'expense_tracking', value: 500 },
        rarity: 'rare'
      },
      // Budget achievements
      {
        code: 'budget_master_7',
        name: 'Budget Beginner',
        description: 'Stay under budget for 7 days',
        icon: '💰',
        category: 'budgeting',
        tier: 'bronze',
        points: 20,
        requirement: { type: 'budget_streak', value: 7 },
        rarity: 'common'
      },
      {
        code: 'budget_master_30',
        name: 'Budget Pro',
        description: 'Stay under budget for 30 days',
        icon: '💎',
        category: 'budgeting',
        tier: 'silver',
        points: 50,
        requirement: { type: 'budget_streak', value: 30 },
        rarity: 'uncommon'
      },
      {
        code: 'budget_master_90',
        name: 'Budget Master',
        description: 'Stay under budget for 3 months',
        icon: '👑',
        category: 'budgeting',
        tier: 'gold',
        points: 150,
        requirement: { type: 'budget_streak', value: 90 },
        rarity: 'rare'
      },
      // Streak achievements
      {
        code: 'login_streak_7',
        name: 'Week Warrior',
        description: 'Log in 7 days in a row',
        icon: '🔥',
        category: 'streaks',
        tier: 'bronze',
        points: 15,
        requirement: { type: 'login_streak', value: 7 },
        rarity: 'common'
      },
      {
        code: 'login_streak_30',
        name: 'Monthly Master',
        description: 'Log in 30 days in a row',
        icon: '⭐',
        category: 'streaks',
        tier: 'silver',
        points: 50,
        requirement: { type: 'login_streak', value: 30 },
        rarity: 'uncommon'
      },
      {
        code: 'savings_streak_30',
        name: 'Savings Streak',
        description: 'Save consistently for 30 days',
        icon: '💎',
        category: 'savings',
        tier: 'gold',
        points: 75,
        requirement: { type: 'savings_amount', value: 30, timeframe: 'daily' },
        rarity: 'rare'
      },
      // Goal achievements
      {
        code: 'goal_crusher_1',
        name: 'Goal Getter',
        description: 'Complete your first financial goal',
        icon: '🎯',
        category: 'milestones',
        tier: 'bronze',
        points: 25,
        requirement: { type: 'goal_completion', value: 1 },
        rarity: 'common'
      },
      {
        code: 'goal_crusher_5',
        name: 'Goal Crusher',
        description: 'Complete 5 financial goals',
        icon: '🏅',
        category: 'milestones',
        tier: 'gold',
        points: 100,
        requirement: { type: 'goal_completion', value: 5 },
        rarity: 'rare'
      },
      // Challenge achievements
      {
        code: 'challenge_winner_1',
        name: 'Challenge Accepted',
        description: 'Complete your first challenge',
        icon: '🎮',
        category: 'challenges',
        tier: 'bronze',
        points: 20,
        requirement: { type: 'challenge_wins', value: 1 },
        rarity: 'common'
      },
      {
        code: 'challenge_winner_10',
        name: 'Challenge Champion',
        description: 'Complete 10 challenges',
        icon: '🏆',
        category: 'challenges',
        tier: 'gold',
        points: 150,
        requirement: { type: 'challenge_wins', value: 10 },
        rarity: 'rare'
      },
      // Analytics achievements
      {
        code: 'analytics_pro',
        name: 'Analytics Pro',
        description: 'Check your dashboard 7 days in a row',
        icon: '📊',
        category: 'tracking',
        tier: 'silver',
        points: 30,
        requirement: { type: 'analytics_usage', value: 7 },
        rarity: 'uncommon'
      },
      // No spend achievements
      {
        code: 'no_spend_3',
        name: 'Frugal Start',
        description: 'Have 3 no-spend days',
        icon: '🌿',
        category: 'savings',
        tier: 'bronze',
        points: 15,
        requirement: { type: 'no_spend_days', value: 3 },
        rarity: 'common'
      },
      {
        code: 'no_spend_10',
        name: 'Frugal Master',
        description: 'Have 10 no-spend days',
        icon: '🌳',
        category: 'savings',
        tier: 'silver',
        points: 40,
        requirement: { type: 'no_spend_days', value: 10 },
        rarity: 'uncommon'
      },
      // Receipt achievements
      {
        code: 'receipt_hunter_10',
        name: 'Receipt Collector',
        description: 'Upload 10 receipts',
        icon: '🧾',
        category: 'tracking',
        tier: 'bronze',
        points: 20,
        requirement: { type: 'receipt_uploads', value: 10 },
        rarity: 'common'
      },
      {
        code: 'receipt_hunter_50',
        name: 'Receipt Master',
        description: 'Upload 50 receipts',
        icon: '📋',
        category: 'tracking',
        tier: 'silver',
        points: 50,
        requirement: { type: 'receipt_uploads', value: 50 },
        rarity: 'uncommon'
      }
    ];
    
    for (const achievement of defaultAchievements) {
      await Achievement.findOneAndUpdate(
        { code: achievement.code },
        achievement,
        { upsert: true, new: true }
      );
    }
    
    console.log('Default achievements initialized');
  }

  /**
   * Reset weekly/monthly points
   */
  async resetPeriodicPoints(type) {
    const now = new Date();
    
    if (type === 'weekly') {
      await UserGamification.updateMany(
        {},
        {
          $set: {
            weeklyPoints: 0,
            lastWeeklyReset: now
          }
        }
      );
    } else if (type === 'monthly') {
      await UserGamification.updateMany(
        {},
        {
          $set: {
            monthlyPoints: 0,
            lastMonthlyReset: now
          }
        }
      );
    }
  }

  /**
   * Check and update all active challenges status
   */
  async updateChallengeStatuses() {
    const now = new Date();
    
    // Mark started challenges as active
    await Challenge.updateMany(
      {
        status: 'upcoming',
        startDate: { $lte: now }
      },
      { $set: { status: 'active' } }
    );
    
    // Mark ended challenges as completed
    const endedChallenges = await Challenge.find({
      status: 'active',
      endDate: { $lt: now }
    });
    
    for (const challenge of endedChallenges) {
      challenge.status = 'completed';
      
      // Mark remaining active participants as failed
      for (const participant of challenge.participants) {
        if (participant.status === 'active') {
          participant.status = 'failed';
        }
      }
      
      await challenge.save();
    }
  }

  /**
   * Seed default achievements
   */
  async seedAchievements() {
    const defaultAchievements = [
      {
        name: 'First Login',
        description: 'Welcome to ExpenseFlow! Complete your first login.',
        icon: '🎉',
        type: 'milestone',
        points: 100,
        criteria: { action: 'first_login' },
        isActive: true
      },
      {
        name: 'Expense Tracker',
        description: 'Add your first expense to start tracking.',
        icon: '💰',
        type: 'milestone',
        points: 50,
        criteria: { action: 'first_expense' },
        isActive: true
      },
      {
        name: 'Budget Master',
        description: 'Create your first budget to manage spending.',
        icon: '📊',
        type: 'milestone',
        points: 75,
        criteria: { action: 'first_budget' },
        isActive: true
      },
      {
        name: 'Goal Setter',
        description: 'Set your first financial goal.',
        icon: '🎯',
        type: 'milestone',
        points: 75,
        criteria: { action: 'first_goal' },
        isActive: true
      },
      {
        name: 'Streak Master',
        description: 'Maintain a 7-day expense tracking streak.',
        icon: '🔥',
        type: 'streak',
        points: 200,
        criteria: { streak: 7 },
        isActive: true
      },
      {
        name: 'Savings Champion',
        description: 'Save $1000 in a month.',
        icon: '💎',
        type: 'savings',
        points: 500,
        criteria: { amount: 1000, period: 'monthly' },
        isActive: true
      }
    ];

    for (const achievementData of defaultAchievements) {
      const existing = await Achievement.findOne({ name: achievementData.name });
      if (!existing) {
        const achievement = new Achievement(achievementData);
        await achievement.save();
      }
    }
  }

  /**
   * Create system challenges
   */
  async createSystemChallenges() {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const systemChallenges = [
      {
        title: 'Weekly Savings Challenge',
        description: 'Save at least $50 this week by reducing unnecessary expenses.',
        type: 'savings',
        targetAmount: 50,
        startDate: now,
        endDate: nextWeek,
        rewardPoints: 150,
        isSystem: true,
        status: 'active'
      },
      {
        title: 'Monthly Budget Hero',
        description: 'Stay within 80% of your monthly budget limit.',
        type: 'budget',
        targetAmount: 0.8, // 80% of budget
        startDate: now,
        endDate: nextMonth,
        rewardPoints: 300,
        isSystem: true,
        status: 'active'
      }
    ];

    for (const challengeData of systemChallenges) {
      const existing = await Challenge.findOne({
        title: challengeData.title,
        startDate: challengeData.startDate
      });
      if (!existing) {
        const challenge = new Challenge(challengeData);
        await challenge.save();
      }
    }
  }
}

module.exports = new GamificationService();
