const express = require('express');
const Joi = require('joi');
const ChatSession = require('../models/Chat');
const chatService = require('../services/chatService');
const auth = require('../middleware/auth');
const { sanitizeInput } = require('../middleware/sanitization');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for chat messages (prevent abuse)
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: 'Too many messages. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false
});

// Message validation schema
const messageSchema = Joi.object({
  content: Joi.string().trim().required().max(1000),
  messageType: Joi.string().valid('text', 'voice').optional().default('text'),
  voiceText: Joi.string().optional().max(1000)
});

/**
 * POST /api/chat/send-message
 * Send a message to the AI assistant
 */
router.post('/send-message', auth, chatLimiter, sanitizeInput, async (req, res) => {
  try {
    const { error, value } = messageSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { content, messageType } = value;
    const userId = req.user._id;

    // Get or create active chat session
    let session = await ChatSession.getActiveSession(userId);
    if (!session) {
      session = await ChatSession.createNewSession(userId);
    }

    // Add user message to session
    await session.addMessage('user', content, {
      messageType,
      context: { intent: null }
    });

    // Process message with AI service
    const startTime = Date.now();
    const aiResponse = await chatService.processMessage(userId, content);
    const responseTime = Date.now() - startTime;

    // Add assistant response to session
    const assistantMessage = await session.addMessage('assistant', aiResponse.response, {
      messageType: 'text',
      action: aiResponse.action,
      context: {
        intent: aiResponse.intent,
        entities: aiResponse.context?.entities || {},
        confidence: aiResponse.context?.confidence || 0
      },
      response: {
        actionPerformed: aiResponse.actionPerformed,
        actionResult: aiResponse.actionResult,
        suggestions: aiResponse.suggestions,
        dataUsed: aiResponse.dataUsed
      },
      isError: aiResponse.error || false,
      errorMessage: aiResponse.isError ? aiResponse.response : null
    });

    // Update session response time statistics
    const totalMessages = session.statistics.totalMessages;
    session.statistics.averageResponseTime = 
      (session.statistics.averageResponseTime * (totalMessages - 1) + responseTime) / totalMessages;
    
    await session.save();

    res.json({
      success: true,
      message: {
        id: assistantMessage._id,
        content: aiResponse.response,
        intent: aiResponse.intent,
        action: aiResponse.action,
        actionPerformed: aiResponse.actionPerformed,
        actionResult: aiResponse.actionResult,
        suggestions: aiResponse.suggestions,
        confidence: aiResponse.context?.confidence || 0,
        timestamp: new Date()
      },
      session: {
        sessionId: session._id,
        totalMessages: session.statistics.totalMessages,
        actionsPerformed: session.statistics.actionsPerformed
      }
    });
  } catch (error) {
    console.error('Error in send-message:', error);
    res.status(500).json({
      error: 'Failed to process message',
      message: error.message
    });
  }
});

/**
 * GET /api/chat/session
 * Get current active chat session
 */
router.get('/session', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    let session = await ChatSession.getActiveSession(userId);

    if (!session) {
      session = await ChatSession.createNewSession(userId);
    }

    res.json({
      success: true,
      session: {
        sessionId: session._id,
        isActive: session.isActive,
        totalMessages: session.statistics.totalMessages,
        startedAt: session.sessionStarted,
        statistics: session.statistics,
        preferences: session.preferences,
        voiceSettings: session.voiceSettings
      }
    });
  } catch (error) {
    console.error('Error in get session:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

/**
 * GET /api/chat/history
 * Get chat history for the user
 */
router.get('/history', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const page = parseInt(req.query.page) || 1;

    const sessions = await ChatSession.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .select('sessionStarted sessionEnded statistics messages');

    const total = await ChatSession.countDocuments({ user: userId });

    res.json({
      success: true,
      data: sessions,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error in get history:', error);
    res.status(500).json({ error: 'Failed to get chat history' });
  }
});

/**
 * GET /api/chat/messages/:sessionId
 * Get messages from a specific session
 */
router.get('/messages/:sessionId', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id;

    const session = await ChatSession.findOne({
      _id: sessionId,
      user: userId
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      session: {
        sessionId: session._id,
        startedAt: session.sessionStarted,
        endedAt: session.sessionEnded,
        statistics: session.statistics
      },
      messages: session.messages
    });
  } catch (error) {
    console.error('Error in get messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * POST /api/chat/preferences
 * Update chat preferences and voice settings
 */
router.post('/preferences', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { preferences, voiceSettings } = req.body;

    let session = await ChatSession.getActiveSession(userId);
    if (!session) {
      session = await ChatSession.createNewSession(userId);
    }

    if (preferences) {
      session.preferences = { ...session.preferences, ...preferences };
    }

    if (voiceSettings) {
      session.voiceSettings = { ...session.voiceSettings, ...voiceSettings };
    }

    await session.save();

    res.json({
      success: true,
      preferences: session.preferences,
      voiceSettings: session.voiceSettings
    });
  } catch (error) {
    console.error('Error in preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * POST /api/chat/end-session
 * End current chat session
 */
router.post('/end-session', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    let session = await ChatSession.getActiveSession(userId);
    if (session) {
      await session.closeSession();
    }

    res.json({
      success: true,
      message: 'Session ended successfully'
    });
  } catch (error) {
    console.error('Error in end-session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

/**
 * GET /api/chat/suggestions
 * Get AI suggestions based on current financial state
 */
router.get('/suggestions', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    // Generate suggestions based on user's financial data
    const suggestions = [];

    // Check if user has any expenses
    const expenseCount = await require('../models/Expense').countDocuments({ user: userId });
    if (expenseCount === 0) {
      suggestions.push({
        type: 'onboarding',
        text: 'Try adding an expense to get started!',
        action: 'add_expense',
        icon: '💰'
      });
    }

    // Check if user has budgets
    const budgetCount = await require('../models/Budget').countDocuments({ user: userId });
    if (budgetCount === 0 && expenseCount > 0) {
      suggestions.push({
        type: 'budget',
        text: 'Set up budgets to track spending by category',
        action: 'set_budget',
        icon: '📊'
      });
    }

    // Check savings rate
    const currentMonth = new Date();
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);

    const income = await require('../models/Expense').aggregate([
      {
        $match: {
          user: userId,
          type: 'income',
          date: { $gte: monthStart, $lt: monthEnd }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const expenses = await require('../models/Expense').aggregate([
      {
        $match: {
          user: userId,
          type: 'expense',
          date: { $gte: monthStart, $lt: monthEnd }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalIncome = income[0]?.total || 0;
    const totalExpenses = expenses[0]?.total || 0;

    if (totalIncome > 0 && totalExpenses / totalIncome > 0.9) {
      suggestions.push({
        type: 'savings',
        text: 'Your spending is very high. Get recommendations to improve',
        action: 'get_recommendation',
        icon: '⚠️'
      });
    }

    // Check goals
    const goalCount = await require('../models/Goal').countDocuments({ user: userId });
    if (goalCount === 0 && expenseCount > 0) {
      suggestions.push({
        type: 'goals',
        text: 'Set financial goals to track your progress',
        action: 'ask_goals',
        icon: '🎯'
      });
    }

    res.json({
      success: true,
      suggestions
    });
  } catch (error) {
    console.error('Error in suggestions:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

/**
 * DELETE /api/chat/session/:sessionId
 * Delete a chat session
 */
router.delete('/session/:sessionId', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id;

    const result = await ChatSession.deleteOne({
      _id: sessionId,
      user: userId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      message: 'Session deleted successfully'
    });
  } catch (error) {
    console.error('Error in delete session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

module.exports = router;
