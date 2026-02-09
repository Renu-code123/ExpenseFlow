const express = require('express');
const auth = require('../middleware/auth');
const gamificationService = require('../services/gamificationService');
const Challenge = require('../models/Challenge');
const {
  validateChallenge,
  validateChallengeUpdate,
  validateProgressUpdate,
  validatePrivacySettings,
  validateLeaderboardQuery,
  validateChallengeFilters
} = require('../middleware/gamificationValidator');

const router = express.Router();

// ==================== PROFILE ROUTES ====================

/**
 * @route   GET /api/gamification/profile
 * @desc    Get user's gamification profile
 * @access  Private
 */
router.get('/profile', auth, async (req, res) => {
  try {
    const profile = await gamificationService.getOrCreateProfile(req.user._id);
    
    // Track login for streak
    await gamificationService.trackLogin(req.user._id);
    
    res.json({
      success: true,
      data: {
        totalPoints: profile.totalPoints,
        level: profile.level,
        experience: profile.experience,
        experienceToNextLevel: profile.experienceToNextLevel,
        rank: profile.rank,
        weeklyPoints: profile.weeklyPoints,
        monthlyPoints: profile.monthlyPoints,
        challengesCompleted: profile.challengesCompleted,
        challengesJoined: profile.challengesJoined,
        totalSavedFromChallenges: profile.totalSavedFromChallenges,
        achievementCount: profile.earnedAchievements.length,
        streaks: profile.streaks,
        stats: profile.stats,
        privacySettings: profile.privacySettings
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   PATCH /api/gamification/privacy
 * @desc    Update privacy settings
 * @access  Private
 */
router.patch('/privacy', auth, validatePrivacySettings, async (req, res) => {
  try {
    const profile = await gamificationService.getOrCreateProfile(req.user._id);
    
    Object.assign(profile.privacySettings, req.body);
    await profile.save();
    
    res.json({
      success: true,
      data: profile.privacySettings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ACHIEVEMENTS ROUTES ====================

/**
 * @route   GET /api/gamification/achievements
 * @desc    Get all achievements with user progress
 * @access  Private
 */
router.get('/achievements', auth, async (req, res) => {
  try {
    const achievements = await gamificationService.getUserAchievements(req.user._id);
    
    // Group by category
    const grouped = achievements.reduce((acc, achievement) => {
      if (!acc[achievement.category]) {
        acc[achievement.category] = [];
      }
      acc[achievement.category].push(achievement);
      return acc;
    }, {});
    
    const summary = {
      total: achievements.length,
      earned: achievements.filter(a => a.isEarned).length,
      inProgress: achievements.filter(a => !a.isEarned && a.progress > 0).length
    };
    
    res.json({
      success: true,
      data: {
        achievements: grouped,
        summary
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/gamification/achievements/recent
 * @desc    Get recently earned achievements
 * @access  Private
 */
router.get('/achievements/recent', auth, async (req, res) => {
  try {
    const profile = await gamificationService.getOrCreateProfile(req.user._id);
    
    const recentAchievements = await Promise.all(
      profile.earnedAchievements
        .sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt))
        .slice(0, 5)
        .map(async ea => {
          const Achievement = require('../models/Achievement');
          const achievement = await Achievement.findById(ea.achievement);
          return {
            ...achievement.toObject(),
            earnedAt: ea.earnedAt
          };
        })
    );
    
    res.json({
      success: true,
      data: recentAchievements
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== LEADERBOARD ROUTES ====================

/**
 * @route   GET /api/gamification/leaderboard
 * @desc    Get leaderboard
 * @access  Private
 */
router.get('/leaderboard', auth, validateLeaderboardQuery, async (req, res) => {
  try {
    const { type, limit } = req.query;
    const leaderboard = await gamificationService.getLeaderboard(type, limit, req.user._id);
    
    res.json({
      success: true,
      data: {
        type,
        entries: leaderboard
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/gamification/leaderboard/friends
 * @desc    Get leaderboard among friends (users in same workspace)
 * @access  Private
 */
router.get('/leaderboard/friends', auth, async (req, res) => {
  try {
    const Workspace = require('../models/Workspace');
    const UserGamification = require('../models/UserGamification');
    
    // Find workspaces user is part of
    const workspaces = await Workspace.find({
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id }
      ]
    });
    
    // Get all user IDs from those workspaces
    const userIds = new Set([req.user._id.toString()]);
    workspaces.forEach(ws => {
      userIds.add(ws.owner.toString());
      ws.members.forEach(m => userIds.add(m.user.toString()));
    });
    
    // Get gamification profiles for these users
    const profiles = await UserGamification.find({
      user: { $in: Array.from(userIds) },
      'privacySettings.showOnLeaderboard': true
    })
      .populate('user', 'name')
      .sort({ totalPoints: -1 });
    
    const leaderboard = profiles.map((p, index) => ({
      rank: index + 1,
      userId: p.user._id,
      name: p.user.name,
      points: p.totalPoints,
      level: p.level,
      rankTitle: p.rank,
      isCurrentUser: p.user._id.toString() === req.user._id.toString()
    }));
    
    res.json({
      success: true,
      data: leaderboard
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CHALLENGE ROUTES ====================

/**
 * @route   POST /api/gamification/challenges
 * @desc    Create a new challenge
 * @access  Private
 */
router.post('/challenges', auth, validateChallenge, async (req, res) => {
  try {
    const challenge = await gamificationService.createChallenge(req.user._id, req.body);
    
    res.status(201).json({
      success: true,
      data: challenge
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/gamification/challenges
 * @desc    Get user's challenges
 * @access  Private
 */
router.get('/challenges', auth, async (req, res) => {
  try {
    const { status } = req.query;
    const challenges = await gamificationService.getUserChallenges(req.user._id, status);
    
    res.json({
      success: true,
      data: challenges
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/gamification/challenges/discover
 * @desc    Get public challenges to join
 * @access  Private
 */
router.get('/challenges/discover', auth, validateChallengeFilters, async (req, res) => {
  try {
    const challenges = await gamificationService.getPublicChallenges(req.user._id, req.query);
    
    res.json({
      success: true,
      data: challenges
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/gamification/challenges/templates
 * @desc    Get challenge templates
 * @access  Private
 */
router.get('/challenges/templates', auth, async (req, res) => {
  try {
    const templates = [
      {
        title: 'No Spend Weekend',
        description: 'Challenge yourself to not spend anything for a weekend',
        type: 'no_spend',
        targetValue: 2,
        targetUnit: 'days',
        difficulty: 'easy',
        rewardPoints: 50,
        icon: '🚫💸',
        suggestedDuration: 2
      },
      {
        title: 'No Spend Week',
        description: 'Go a full week without any unnecessary spending',
        type: 'no_spend',
        targetValue: 7,
        targetUnit: 'days',
        difficulty: 'medium',
        rewardPoints: 150,
        icon: '🏆',
        suggestedDuration: 7
      },
      {
        title: 'Coffee Shop Savings',
        description: 'Reduce your coffee shop spending by 50% this month',
        type: 'category_reduction',
        category: 'coffee',
        targetValue: 50,
        targetUnit: 'percentage',
        difficulty: 'medium',
        rewardPoints: 100,
        icon: '☕',
        suggestedDuration: 30
      },
      {
        title: 'Meal Prep Month',
        description: 'Cut food delivery expenses by 75% this month',
        type: 'category_reduction',
        category: 'food',
        targetValue: 75,
        targetUnit: 'percentage',
        difficulty: 'hard',
        rewardPoints: 200,
        icon: '🍳',
        suggestedDuration: 30
      },
      {
        title: 'Entertainment Detox',
        description: 'Reduce entertainment spending by 60% for two weeks',
        type: 'category_reduction',
        category: 'entertainment',
        targetValue: 60,
        targetUnit: 'percentage',
        difficulty: 'medium',
        rewardPoints: 120,
        icon: '🎬',
        suggestedDuration: 14
      },
      {
        title: 'Savings Sprint',
        description: 'Save ₹5,000 in one month',
        type: 'savings_target',
        targetValue: 5000,
        targetUnit: 'amount',
        difficulty: 'medium',
        rewardPoints: 150,
        icon: '💰',
        suggestedDuration: 30
      },
      {
        title: 'Budget Warrior',
        description: 'Stay under budget for 30 consecutive days',
        type: 'budget_adherence',
        targetValue: 30,
        targetUnit: 'days',
        difficulty: 'hard',
        rewardPoints: 250,
        icon: '⚔️',
        suggestedDuration: 30
      },
      {
        title: 'Tracking Streak',
        description: 'Track expenses every day for 14 days',
        type: 'streak',
        targetValue: 14,
        targetUnit: 'days',
        difficulty: 'easy',
        rewardPoints: 75,
        icon: '📝',
        suggestedDuration: 14
      },
      {
        title: 'Shopping Fast',
        description: 'No shopping expenses for 10 days',
        type: 'no_spend',
        category: 'shopping',
        targetValue: 10,
        targetUnit: 'days',
        difficulty: 'medium',
        rewardPoints: 100,
        icon: '🛍️',
        suggestedDuration: 10
      },
      {
        title: 'Transport Saver',
        description: 'Reduce transport costs by 40% this month',
        type: 'category_reduction',
        category: 'transport',
        targetValue: 40,
        targetUnit: 'percentage',
        difficulty: 'medium',
        rewardPoints: 100,
        icon: '🚗',
        suggestedDuration: 30
      }
    ];
    
    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/gamification/challenges/:id
 * @desc    Get challenge details
 * @access  Private
 */
router.get('/challenges/:id', auth, async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.id)
      .populate('creator', 'name')
      .populate('participants.user', 'name');
    
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    
    // Check if user can view this challenge
    if (!challenge.isPublic && !challenge.isParticipant(req.user._id) && 
        challenge.creator._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const participant = challenge.getParticipant(req.user._id);
    
    // Calculate progress if user is participant
    let currentProgress = null;
    if (participant && challenge.status === 'active') {
      currentProgress = await gamificationService.calculateChallengeProgress(
        req.user._id, 
        challenge._id
      );
    }
    
    res.json({
      success: true,
      data: {
        ...challenge.toObject(),
        isParticipant: challenge.isParticipant(req.user._id),
        isCreator: challenge.creator._id.toString() === req.user._id.toString(),
        userProgress: participant?.progress || 0,
        userStatus: participant?.status || null,
        userStreak: participant?.currentStreak || 0,
        userSavedAmount: participant?.savedAmount || 0,
        currentProgress,
        daysRemaining: challenge.getDaysRemaining(),
        participantCount: challenge.participants.length,
        leaderboard: challenge.participants
          .filter(p => p.status !== 'withdrawn')
          .sort((a, b) => b.progress - a.progress)
          .slice(0, 10)
          .map((p, index) => ({
            rank: index + 1,
            userId: p.user._id,
            name: p.user.name,
            progress: p.progress,
            streak: p.currentStreak
          }))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/gamification/challenges/:id/join
 * @desc    Join a challenge
 * @access  Private
 */
router.post('/challenges/:id/join', auth, async (req, res) => {
  try {
    const challenge = await gamificationService.joinChallenge(req.user._id, req.params.id);
    
    res.json({
      success: true,
      message: 'Successfully joined the challenge',
      data: challenge
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @route   POST /api/gamification/challenges/:id/leave
 * @desc    Leave a challenge
 * @access  Private
 */
router.post('/challenges/:id/leave', auth, async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.id);
    
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    
    const participant = challenge.getParticipant(req.user._id);
    
    if (!participant) {
      return res.status(400).json({ error: 'Not a participant of this challenge' });
    }
    
    participant.status = 'withdrawn';
    await challenge.save();
    
    res.json({
      success: true,
      message: 'Successfully left the challenge'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   PATCH /api/gamification/challenges/:id/progress
 * @desc    Update challenge progress (for custom challenges)
 * @access  Private
 */
router.patch('/challenges/:id/progress', auth, validateProgressUpdate, async (req, res) => {
  try {
    const challenge = await gamificationService.updateChallengeProgress(
      req.user._id,
      req.params.id,
      req.body
    );
    
    res.json({
      success: true,
      data: challenge
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @route   PUT /api/gamification/challenges/:id
 * @desc    Update challenge (creator only)
 * @access  Private
 */
router.put('/challenges/:id', auth, validateChallengeUpdate, async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.id);
    
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    
    if (challenge.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the creator can update this challenge' });
    }
    
    // Can only update certain fields after creation
    const allowedUpdates = ['title', 'description', 'isPublic', 'rules', 'icon'];
    const updates = {};
    
    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }
    
    Object.assign(challenge, updates);
    await challenge.save();
    
    res.json({
      success: true,
      data: challenge
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   DELETE /api/gamification/challenges/:id
 * @desc    Delete/cancel a challenge (creator only, before it starts)
 * @access  Private
 */
router.delete('/challenges/:id', auth, async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.id);
    
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    
    if (challenge.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the creator can delete this challenge' });
    }
    
    if (challenge.status === 'active') {
      // Mark as cancelled instead of deleting
      challenge.status = 'cancelled';
      await challenge.save();
      
      return res.json({
        success: true,
        message: 'Challenge cancelled'
      });
    }
    
    await Challenge.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Challenge deleted'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/gamification/challenges/:id/invite
 * @desc    Invite users to a challenge
 * @access  Private
 */
router.post('/challenges/:id/invite', auth, async (req, res) => {
  try {
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array is required' });
    }
    
    const challenge = await Challenge.findById(req.params.id);
    
    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    
    if (challenge.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the creator can invite users' });
    }
    
    // Add invited users
    const newInvites = userIds.filter(id => 
      !challenge.invitedUsers.includes(id) && 
      !challenge.isParticipant(id)
    );
    
    challenge.invitedUsers.push(...newInvites);
    await challenge.save();
    
    // Send notifications to invited users
    if (global.io) {
      for (const userId of newInvites) {
        global.io.to(`user_${userId}`).emit('challenge_invitation', {
          challengeId: challenge._id,
          challengeTitle: challenge.title,
          invitedBy: req.user.name
        });
      }
    }
    
    res.json({
      success: true,
      message: `Invited ${newInvites.length} users`,
      data: { invitedCount: newInvites.length }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== STATS ROUTES ====================

/**
 * @route   GET /api/gamification/stats
 * @desc    Get detailed gamification stats
 * @access  Private
 */
router.get('/stats', auth, async (req, res) => {
  try {
    const profile = await gamificationService.getOrCreateProfile(req.user._id);
    const UserGamification = require('../models/UserGamification');
    
    // Get global rank
    const globalRank = await UserGamification.countDocuments({
      totalPoints: { $gt: profile.totalPoints }
    }) + 1;
    
    const totalUsers = await UserGamification.countDocuments();
    
    // Get challenge stats
    const challengeStats = await Challenge.aggregate([
      {
        $match: {
          'participants.user': profile.user
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const challenges = {
      active: 0,
      completed: 0,
      upcoming: 0
    };
    
    challengeStats.forEach(stat => {
      if (stat._id === 'active') challenges.active = stat.count;
      if (stat._id === 'completed') challenges.completed = stat.count;
      if (stat._id === 'upcoming') challenges.upcoming = stat.count;
    });
    
    res.json({
      success: true,
      data: {
        points: {
          total: profile.totalPoints,
          weekly: profile.weeklyPoints,
          monthly: profile.monthlyPoints
        },
        level: {
          current: profile.level,
          rank: profile.rank,
          experience: profile.experience,
          toNextLevel: profile.experienceToNextLevel
        },
        ranking: {
          global: globalRank,
          totalUsers,
          percentile: Math.round((1 - (globalRank / totalUsers)) * 100)
        },
        achievements: {
          earned: profile.earnedAchievements.length,
          inProgress: profile.achievementProgress.filter(ap => 
            ap.currentValue > 0 && ap.currentValue < ap.targetValue
          ).length
        },
        challenges,
        streaks: profile.streaks.map(s => ({
          type: s.type,
          current: s.currentStreak,
          longest: s.longestStreak
        })),
        stats: profile.stats
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/gamification/init
 * @desc    Initialize default achievements (admin only)
 * @access  Private
 */
router.post('/init', auth, async (req, res) => {
  try {
    await gamificationService.initializeDefaultAchievements();
    
    res.json({
      success: true,
      message: 'Default achievements initialized'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
