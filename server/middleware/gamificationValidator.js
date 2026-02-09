const Joi = require('joi');

const challengeSchema = Joi.object({
  title: Joi.string().trim().min(3).max(100).required()
    .messages({
      'string.min': 'Title must be at least 3 characters',
      'string.max': 'Title cannot exceed 100 characters'
    }),
  description: Joi.string().trim().min(10).max(500).required()
    .messages({
      'string.min': 'Description must be at least 10 characters',
      'string.max': 'Description cannot exceed 500 characters'
    }),
  type: Joi.string().valid(
    'no_spend',
    'category_reduction',
    'savings_target',
    'streak',
    'budget_adherence',
    'custom'
  ).required()
    .messages({
      'any.only': 'Invalid challenge type'
    }),
  category: Joi.string().valid(
    'food', 'transport', 'entertainment', 'utilities',
    'healthcare', 'shopping', 'coffee', 'dining', 'other', 'all'
  ).default('all'),
  targetValue: Joi.number().min(1).required()
    .messages({
      'number.min': 'Target value must be at least 1'
    }),
  targetUnit: Joi.string().valid('days', 'amount', 'percentage', 'count').default('days'),
  startDate: Joi.date().iso().min('now').required()
    .messages({
      'date.min': 'Start date must be in the future'
    }),
  endDate: Joi.date().iso().greater(Joi.ref('startDate')).required()
    .messages({
      'date.greater': 'End date must be after start date'
    }),
  isPublic: Joi.boolean().default(true),
  difficulty: Joi.string().valid('easy', 'medium', 'hard', 'extreme').default('medium'),
  rewardPoints: Joi.number().min(10).max(1000).default(100),
  maxParticipants: Joi.number().min(0).max(1000).default(0),
  rules: Joi.string().trim().max(1000).optional(),
  icon: Joi.string().max(10).default('🎯')
});

const challengeUpdateSchema = Joi.object({
  title: Joi.string().trim().min(3).max(100),
  description: Joi.string().trim().min(10).max(500),
  isPublic: Joi.boolean(),
  rules: Joi.string().trim().max(1000),
  icon: Joi.string().max(10)
}).min(1);

const progressUpdateSchema = Joi.object({
  progress: Joi.number().min(0).max(100),
  currentStreak: Joi.number().min(0),
  savedAmount: Joi.number().min(0),
  completedDay: Joi.boolean(),
  dayValue: Joi.number()
});

const privacySettingsSchema = Joi.object({
  showOnLeaderboard: Joi.boolean(),
  showAchievements: Joi.boolean(),
  showChallenges: Joi.boolean(),
  showStats: Joi.boolean()
}).min(1);

const leaderboardQuerySchema = Joi.object({
  type: Joi.string().valid('all_time', 'weekly', 'monthly').default('all_time'),
  limit: Joi.number().min(1).max(100).default(50)
});

const challengeFiltersSchema = Joi.object({
  type: Joi.string().valid(
    'no_spend', 'category_reduction', 'savings_target',
    'streak', 'budget_adherence', 'custom'
  ),
  difficulty: Joi.string().valid('easy', 'medium', 'hard', 'extreme'),
  status: Joi.string().valid('upcoming', 'active', 'completed'),
  limit: Joi.number().min(1).max(50).default(20)
});

const validateChallenge = (req, res, next) => {
  const { error, value } = challengeSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }
  
  req.body = value;
  next();
};

const validateChallengeUpdate = (req, res, next) => {
  const { error, value } = challengeUpdateSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }
  
  req.body = value;
  next();
};

const validateProgressUpdate = (req, res, next) => {
  const { error, value } = progressUpdateSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }
  
  req.body = value;
  next();
};

const validatePrivacySettings = (req, res, next) => {
  const { error, value } = privacySettingsSchema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }
  
  req.body = value;
  next();
};

const validateLeaderboardQuery = (req, res, next) => {
  const { error, value } = leaderboardQuerySchema.validate(req.query, { abortEarly: false });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }
  
  req.query = value;
  next();
};

const validateChallengeFilters = (req, res, next) => {
  const { error, value } = challengeFiltersSchema.validate(req.query, { abortEarly: false });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }
  
  req.query = value;
  next();
};

module.exports = {
  validateChallenge,
  validateChallengeUpdate,
  validateProgressUpdate,
  validatePrivacySettings,
  validateLeaderboardQuery,
  validateChallengeFilters
};
