const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  messageType: {
    type: String,
    enum: ['text', 'voice', 'action'],
    default: 'text'
  },
  // For action messages (e.g., expense added, budget recommendation)
  action: {
    type: String,
    enum: ['add_expense', 'set_budget', 'generate_insight', 'voice_input', null],
    default: null
  },
  // Context data for the message
  context: {
    intent: String, // user_intent identified (add_expense, ask_budget, etc.)
    entities: {
      amount: Number,
      category: String,
      date: Date,
      merchant: String,
      description: String,
      currency: String
    },
    confidence: Number // confidence score for intent detection (0-1)
  },
  // Response metadata
  response: {
    // If this is an assistant message, store what action was taken
    actionPerformed: String,
    actionResult: mongoose.Schema.Types.Mixed,
    suggestions: [String], // Follow-up suggestions
    dataUsed: {
      recentExpenses: Number, // count of recent expenses used
      budgetData: Boolean,
      analyticsData: Boolean
    }
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  isError: {
    type: Boolean,
    default: false
  },
  errorMessage: String
});

const chatSessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  messages: [chatMessageSchema],
  
  // Session metadata
  sessionStarted: {
    type: Date,
    default: Date.now
  },
  sessionEnded: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Session statistics
  statistics: {
    totalMessages: {
      type: Number,
      default: 0
    },
    userMessages: {
      type: Number,
      default: 0
    },
    assistantMessages: {
      type: Number,
      default: 0
    },
    actionsPerformed: {
      expenses_added: { type: Number, default: 0 },
      budgets_set: { type: Number, default: 0 },
      insights_generated: { type: Number, default: 0 },
      questions_answered: { type: Number, default: 0 }
    },
    averageResponseTime: Number // in milliseconds
  },
  
  // Voice settings
  voiceSettings: {
    voiceEnabled: {
      type: Boolean,
      default: false
    },
    speechRecognitionLanguage: {
      type: String,
      default: 'en-US'
    },
    textToSpeechLanguage: {
      type: String,
      default: 'en-US'
    }
  },
  
  // User preferences
  preferences: {
    showSuggestions: {
      type: Boolean,
      default: true
    },
    detailedResponses: {
      type: Boolean,
      default: true
    },
    showDataContext: {
      type: Boolean,
      default: true
    }
  },
  
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient querying
chatSessionSchema.index({ user: 1, createdAt: -1 });
chatSessionSchema.index({ user: 1, isActive: 1 });

// Methods
chatSessionSchema.methods.addMessage = async function(sender, content, options = {}) {
  const message = {
    sender,
    content,
    messageType: options.messageType || 'text',
    action: options.action || null,
    context: options.context || {},
    response: options.response || {},
    isError: options.isError || false,
    errorMessage: options.errorMessage || null
  };
  
  this.messages.push(message);
  
  // Update statistics
  this.statistics.totalMessages += 1;
  if (sender === 'user') {
    this.statistics.userMessages += 1;
  } else {
    this.statistics.assistantMessages += 1;
  }
  
  if (options.action && options.response?.actionPerformed) {
    const actionKey = options.action.replace('-', '_') + 's';
    if (this.statistics.actionsPerformed[actionKey] !== undefined) {
      this.statistics.actionsPerformed[actionKey] += 1;
    }
  }
  
  this.updatedAt = new Date();
  return this.save();
};

chatSessionSchema.methods.closeSession = function() {
  this.isActive = false;
  this.sessionEnded = new Date();
  this.updatedAt = new Date();
  return this.save();
};

chatSessionSchema.statics.createNewSession = function(userId, options = {}) {
  return this.create({
    user: userId,
    voiceSettings: options.voiceSettings || {},
    preferences: options.preferences || {}
  });
};

chatSessionSchema.statics.getActiveSession = function(userId) {
  return this.findOne({
    user: userId,
    isActive: true
  }).sort({ createdAt: -1 });
};

chatSessionSchema.statics.getSessionHistory = function(userId, limit = 50) {
  return this.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('messages sessionStarted sessionEnded statistics');
};

const ChatSession = mongoose.model('ChatSession', chatSessionSchema);
module.exports = ChatSession;


// const Expense = require('../models/Expense');
// const Budget = require('../models/Budget');
// const User = require('../models/User');

// class ChatAssistantService {

//   async processMessage(userId, message) {
//     try {
//       const user = await User.findById(userId);
//       if (!user) {
//         return { response: 'User not found.' };
//       }

//       const intent = this.detectIntent(message);
//       const entities = this.extractEntities(message);

//       switch (intent) {
//         case 'add_expense':
//           return await this.handleAddExpense(userId, entities, user);

//         default:
//           return {
//             response: '🤔 I can help you add expenses like: "I spent ₹500 on groceries"'
//           };
//       }

//     } catch (error) {
//       console.error('ChatAssistant fatal error:', error.message);
//       return {
//         response: '⚠️ I couldn’t process that right now. Please try again.'
//       };
//     }
//   }

//   /* ---------------- INTENT ---------------- */

//   detectIntent(message) {
//     if (/spent|paid|bought/i.test(message)) {
//       return 'add_expense';
//     }
//     return 'unknown';
//   }

//   /* ---------------- ENTITY EXTRACTION ---------------- */

//   extractEntities(message) {
//     const amountMatch = message.match(/₹?\s?(\d+)/);
//     const amount = amountMatch ? Number(amountMatch[1]) : null;

//     let category = 'other';
//     if (/grocery|food/i.test(message)) category = 'food';
//     if (/travel|uber|ola/i.test(message)) category = 'travel';

//     return {
//       amount,
//       category,
//       description: message
//     };
//   }

//   /* ---------------- ADD EXPENSE ---------------- */

//   async handleAddExpense(userId, entities, user) {
//     if (!entities.amount) {
//       return {
//         response: '❌ I couldn’t detect the amount. Try: "Spent ₹500 on groceries"'
//       };
//     }

//     /* ---- CORE FEATURE (MUST SUCCEED) ---- */
//     let expense;
//     try {
//       expense = await Expense.create({
//         user: userId,
//         description: entities.description || 'Expense',
//         amount: entities.amount,
//         category: entities.category,
//         currency: user.preferredCurrency || 'INR',
//         type: 'expense',
//         date: new Date()
//       });
//     } catch (err) {
//       console.error('Expense save failed:', err.message);
//       return {
//         response: '⚠️ Could not save the expense. Please try again.'
//       };
//     }

//     /* ---- OPTIONAL FEATURE (NEVER BLOCK) ---- */
//     let budgetWarning = '';
//     try {
//       const budget = await Budget.findOne({
//         user: userId,
//         category: entities.category
//       });

//       if (budget) {
//         const spent = await Expense.aggregate([
//           {
//             $match: {
//               user: userId,
//               category: entities.category,
//               date: {
//                 $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
//                 $lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
//               }
//             }
//           },
//           { $group: { _id: null, total: { $sum: '$amount' } } }
//         ]);

//         const totalSpent = spent[0]?.total || 0;
//         const percent = (totalSpent / budget.limit) * 100;

//         if (percent > 80) {
//           budgetWarning = ` ⚠️ You’ve used ${Math.round(percent)}% of your ${entities.category} budget.`;
//         }
//       }
//     } catch (err) {
//       console.warn('Budget check skipped:', err.message);
//     }

//     /* ---- ALWAYS SUCCESS RESPONSE ---- */
//     return {
//       response: `✅ Expense added!\n💰 ₹${entities.amount}\n📁 ${entities.category}${budgetWarning}`,
//       actionPerformed: true
//     };
//   }
// }

// module.exports = new ChatAssistantService();
