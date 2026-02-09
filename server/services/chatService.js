const Expense = require('../models/Expense');
const Budget = require('../models/Budget');
const Goal = require('../models/Goal');
const RecurringExpense = require('../models/RecurringExpense');
const User = require('../models/User');
const analyticsService = require('./analyticsService');
const budgetService = require('./budgetService');
const categorizationService = require('./categorizationService');
const currencyService = require('./currencyService');

class ChatAssistantService {
  constructor() {
    // Intent patterns for NLP
    this.intentPatterns = {
      add_expense: [
        /(?:spent|spent money on|spent.*on|paid|paid for|charged)\s*(?:₹|Rs\.?|rupees?)?\s*(\d+(?:\.?\d+)?)\s*(?:on|for)?\s*(.+)/i,
        /(?:I spent|I paid|expense of)\s*(?:₹|Rs\.?|rupees?)?\s*(\d+(?:\.?\d+)?)\s*(?:on|for)?\s*(.+)/i,
        /add (?:an?|the)?\s*expense?(?:\s+of)?\s*(?:₹|Rs\.?|rupees?)?\s*(\d+(?:\.?\d+)?)\s*(?:on|for)?\s*(.+)/i
      ],
      ask_budget: [
        /what'?s? my budget/i,
        /how much.*budget/i,
        /show me.*budget/i,
        /budget (?:for|on)\s*(.+)/i,
        /what'?s? my (?:spending|spend) limit/i
      ],
      ask_spending: [
        /how much have i spent|what'?s my spending|total spent|show spending/i,
        /how much did i spend\s*(?:on|in)\s*(.+)/i,
        /spending on\s*(.+)/i,
        /expense (?:report|summary|analysis)/i
      ],
      ask_trends: [
        /what.*trend|show trend|spending trend|expense trend/i,
        /how'?s? my (?:spending|financial) trend/i,
        /am i spending more|spending pattern/i
      ],
      ask_savings: [
        /how much.*sav|savings|savings rate/i,
        /am i saving enough|saving money/i,
        /potential savings|can i save/i
      ],
      ask_category_breakdown: [
        /breakdown by category|category breakdown|spending by category/i,
        /where.*spending|which category/i,
        /category distribution/i
      ],
      set_budget: [
        /set budget\s*(?:for|on)\s*(.+)\s*(?:to|at|as)?\s*(?:₹|Rs\.?|rupees?)?\s*(\d+(?:\.?\d+)?)/i,
        /create budget\s*(?:for)?\s*(.+)\s*(?:₹|Rs\.?|rupees?)?\s*(\d+(?:\.?\d+)?)/i
      ],
      get_recommendation: [
        /(?:give me|what'?s?)\s*(?:a )?recommendation|suggest|advise|tip/i,
        /financial advice|money advice|spend advice/i,
        /should i|what should i do/i
      ],
      ask_recurring: [
        /recurring expense|recurring payment|subscription|fixed expense/i,
        /what recurring expenses/i,
        /my subscriptions/i
      ],
      ask_goals: [
        /my goals|financial goal|savings goal/i,
        /progress on goals|goal progress/i
      ]
    };

    // Category mapping
    this.categories = ['food', 'transport', 'entertainment', 'utilities', 'healthcare', 'shopping', 'other'];
    
    // Currency symbols
    this.currencySymbols = {
      '₹': 'INR',
      'Rs': 'INR',
      '$': 'USD',
      '€': 'EUR',
      '£': 'GBP'
    };
  }

  /**
   * Process user message and generate response
   */
  async processMessage(userId, userMessage, userContext = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      // Step 1: Detect intent
      const { intent, entities, confidence } = this.detectIntent(userMessage);
      
      console.log(`Detected intent: ${intent} (confidence: ${confidence})`);

      // Step 2: Generate response based on intent
      let response = {
        text: '',
        action: null,
        actionPerformed: null,
        actionResult: null,
        suggestions: [],
        dataUsed: {
          recentExpenses: 0,
          budgetData: false,
          analyticsData: false
        }
      };

      const context = {
        intent,
        entities,
        confidence
      };

      switch (intent) {
        case 'add_expense':
          response = await this.handleAddExpense(userId, entities, user);
          break;
        case 'ask_budget':
          response = await this.handleAskBudget(userId, entities, user);
          break;
        case 'ask_spending':
          response = await this.handleAskSpending(userId, entities, user);
          break;
        case 'ask_trends':
          response = await this.handleAskTrends(userId, user);
          break;
        case 'ask_savings':
          response = await this.handleAskSavings(userId, user);
          break;
        case 'ask_category_breakdown':
          response = await this.handleAskCategoryBreakdown(userId, user);
          break;
        case 'set_budget':
          response = await this.handleSetBudget(userId, entities, user);
          break;
        case 'get_recommendation':
          response = await this.handleGetRecommendation(userId, user);
          break;
        case 'ask_recurring':
          response = await this.handleAskRecurring(userId, user);
          break;
        case 'ask_goals':
          response = await this.handleAskGoals(userId, user);
          break;
        default:
          response = this.handleGeneralQuery(userMessage);
      }

      return {
        response: response.text,
        intent,
        context,
        action: response.action,
        actionPerformed: response.actionPerformed,
        actionResult: response.actionResult,
        suggestions: response.suggestions,
        dataUsed: response.dataUsed
      };
    } catch (error) {
      console.error('Error processing message:', error);
      return {
        response: `I encountered an error: ${error.message}. Please try again.`,
        intent: 'error',
        error: true,
        isError: true
      };
    }
  }

  /**
   * Detect user intent from message
   */
  detectIntent(message) {
    const messageLower = message.toLowerCase();
    let detectedIntent = 'general_query';
    let maxConfidence = 0;
    let entities = {};

    // Check against all patterns
    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match) {
          const confidence = 0.9; // High confidence if pattern matches
          if (confidence > maxConfidence) {
            maxConfidence = confidence;
            detectedIntent = intent;
            
            // Extract entities based on intent
            if (intent === 'add_expense' && match[1] && match[2]) {
              entities = {
                amount: parseFloat(match[1]),
                description: match[2].trim(),
                category: this.categorizeDescription(match[2])
              };
            } else if (intent === 'set_budget' && match[1] && match[2]) {
              entities = {
                category: match[1].trim(),
                amount: parseFloat(match[2])
              };
            } else if ((intent === 'ask_spending' || intent === 'ask_budget') && match[1]) {
              entities = {
                category: match[1].trim()
              };
            }
          }
        }
      }
    }

    // If no pattern matched, return low confidence
    if (detectedIntent === 'general_query') {
      maxConfidence = 0.3;
    }

    return {
      intent: detectedIntent,
      entities,
      confidence: maxConfidence
    };
  }

  /**
   * Categorize expense description into category
   */
  categorizeDescription(description) {
    const descLower = description.toLowerCase();
    
    const categoryKeywords = {
      'food': ['food', 'lunch', 'dinner', 'breakfast', 'restaurant', 'cafe', 'pizza', 'burger', 'meal', 'snack', 'eating', 'groceries'],
      'transport': ['transport', 'uber', 'taxi', 'auto', 'bus', 'train', 'fuel', 'petrol', 'car', 'bike', 'travel', 'ride', 'flight', 'metro'],
      'entertainment': ['movie', 'game', 'entertainment', 'spotify', 'netflix', 'music', 'concert', 'event', 'ticket', 'party', 'outing'],
      'utilities': ['electric', 'water', 'bill', 'phone', 'internet', 'utility', 'rent', 'apartment', 'utilities', 'electricity', 'gas'],
      'healthcare': ['doctor', 'hospital', 'medicine', 'pharmacy', 'health', 'dental', 'clinic', 'medical', 'treatment', 'checkup'],
      'shopping': ['shop', 'buy', 'purchase', 'mall', 'store', 'clothing', 'clothes', 'dress', 'shoe', 'shoes', 'retail', 'shopping', 'amazon', 'flipkart'],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      for (const keyword of keywords) {
        if (descLower.includes(keyword)) {
          return category;
        }
      }
    }

    return 'other';
  }

  /**
   * Handle add expense intent
   */
  async handleAddExpense(userId, entities, user) {
    try {
      if (!entities.amount) {
        return {
          text: `I noticed you wanted to add an expense, but I couldn't extract the amount. Please try saying: "Spent ₹500 on groceries"`,
          suggestions: ['Try: Spent ₹500 on groceries', 'Try: I paid ₹1200 for dinner']
        };
      }

      const expenseData = {
        user: userId,
        description: entities.description || 'Expense',
        amount: entities.amount,
        currency: user.preferredCurrency,
        category: entities.category || 'other',
        type: 'expense',
        date: new Date(),
        originalAmount: entities.amount,
        originalCurrency: user.preferredCurrency
      };

      const expense = new Expense(expenseData);
      await expense.save();

      // Get category budget info
      const budget = await Budget.findOne({ user: userId, category: expenseData.category });
      let budgetWarning = '';
      
      if (budget) {
        const spent = await Expense.aggregate([
          {
            $match: {
              user: userId,
              category: expenseData.category,
              date: {
                $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                $lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
              }
            }
          },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const totalSpent = spent[0]?.total || 0;
        const percentageUsed = (totalSpent / budget.limit) * 100;

        if (percentageUsed > 80) {
          budgetWarning = ` ⚠️ Warning: You've used ${Math.round(percentageUsed)}% of your ₹${budget.limit} ${expenseData.category} budget.`;
        }
      }

      return {
        text: `✅ Expense added successfully!\n💰 Amount: ₹${entities.amount} for ${entities.description}\n📁 Category: ${expenseData.category}${budgetWarning}`,
        action: 'add_expense',
        actionPerformed: 'Expense Added',
        actionResult: {
          expenseId: expense._id,
          amount: entities.amount,
          category: expenseData.category,
          description: entities.description
        },
        suggestions: [
          'Add another expense',
          'Show my spending summary',
          'What\'s my budget?'
        ],
        dataUsed: {
          budgetData: !!budget
        }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle ask budget intent
   */
  async handleAskBudget(userId, entities, user) {
    try {
      const budgets = await Budget.find({ user: userId });
      
      if (budgets.length === 0) {
        return {
          text: `📊 You haven't set any budgets yet. Would you like me to help you create one?\n\nI can recommend budgets based on your spending patterns!`,
          suggestions: [
            'Set a budget for me',
            'Show my spending by category',
            'Get recommendations'
          ]
        };
      }

      // Get current spending for each category
      const currentMonth = new Date();
      const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);

      let budgetSummary = `📊 **Your Budgets:**\n\n`;
      const suggestions = [];

      for (const budget of budgets) {
        const spent = await Expense.aggregate([
          {
            $match: {
              user: userId,
              category: budget.category,
              date: { $gte: monthStart, $lt: monthEnd }
            }
          },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const totalSpent = spent[0]?.total || 0;
        const remaining = budget.limit - totalSpent;
        const percentageUsed = (totalSpent / budget.limit) * 100;

        const statusEmoji = percentageUsed > 90 ? '🔴' : percentageUsed > 70 ? '🟡' : '🟢';

        budgetSummary += `${statusEmoji} **${budget.category.toUpperCase()}**\n`;
        budgetSummary += `   Budget: ₹${budget.limit}\n`;
        budgetSummary += `   Spent: ₹${totalSpent.toFixed(2)}\n`;
        budgetSummary += `   Remaining: ₹${remaining.toFixed(2)}\n`;
        budgetSummary += `   Usage: ${percentageUsed.toFixed(1)}%\n\n`;

        if (percentageUsed > 90) {
          suggestions.push(`⚠️ Over budget on ${budget.category}`);
        }
      }

      return {
        text: budgetSummary,
        suggestions: suggestions.length > 0 ? suggestions : ['Show spending trends', 'Get recommendations'],
        dataUsed: {
          budgetData: true
        }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle ask spending intent
   */
  async handleAskSpending(userId, entities, user) {
    try {
      const currentMonth = new Date();
      const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);

      const spending = await Expense.aggregate([
        {
          $match: {
            user: userId,
            type: 'expense',
            date: { $gte: monthStart, $lt: monthEnd }
          }
        },
        {
          $group: {
            _id: '$category',
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);

      const totalSpent = spending.reduce((sum, item) => sum + item.total, 0);
      
      if (spending.length === 0) {
        return {
          text: `📈 No expenses recorded for this month yet. When you add expenses, I'll give you detailed insights!`
        };
      }

      let spendingText = `📈 **Your Spending This Month: ₹${totalSpent.toFixed(2)}**\n\n`;
      
      spending.sort((a, b) => b.total - a.total);
      
      for (const item of spending) {
        const percentage = (item.total / totalSpent) * 100;
        const barLength = Math.round(percentage / 5);
        const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
        
        spendingText += `${item._id.toUpperCase()}\n`;
        spendingText += `${bar} ${percentage.toFixed(1)}% (₹${item.total.toFixed(2)})\n\n`;
      }

      return {
        text: spendingText,
        suggestions: ['Show budgets', 'Spending trends', 'Category breakdown', 'Get insights'],
        dataUsed: { recentExpenses: spending.length }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle ask trends intent
   */
  async handleAskTrends(userId, user) {
    try {
      const trends = await analyticsService.getSpendingTrends(userId, { months: 3, useCache: true });
      
      let trendsText = `📊 **Your Spending Trends (Last 3 Months):**\n\n`;
      
      if (trends.data.length === 0) {
        return {
          text: `No spending data available yet. Start adding expenses to see trends!`
        };
      }

      for (const period of trends.data) {
        trendsText += `**${period.period}**: Spent ₹${period.expense.toFixed(2)}, Earned ₹${period.income.toFixed(2)}\n`;
        trendsText += `  Savings: ₹${period.net.toFixed(2)} (${period.savingsRate.toFixed(1)}%)\n\n`;
      }

      const latestPeriod = trends.data[trends.data.length - 1];
      const previousPeriod = trends.data[trends.data.length - 2];
      
      let insight = '';
      if (previousPeriod) {
        const change = ((latestPeriod.expense - previousPeriod.expense) / previousPeriod.expense) * 100;
        if (change > 10) {
          insight = `\n⚠️ Your spending increased by ${Math.abs(change.toFixed(1))}% this period.`;
        } else if (change < -10) {
          insight = `\n✅ Great! Your spending decreased by ${Math.abs(change.toFixed(1))}% this period.`;
        }
      }

      return {
        text: trendsText + insight,
        suggestions: ['Get recommendations', 'Show budget status', 'Savings insights'],
        dataUsed: { analyticsData: true }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle ask savings intent
   */
  async handleAskSavings(userId, user) {
    try {
      const currentMonth = new Date();
      const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);

      const income = await Expense.aggregate([
        {
          $match: {
            user: userId,
            type: 'income',
            date: { $gte: monthStart, $lt: monthEnd }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      const expenses = await Expense.aggregate([
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
      const totalSavings = totalIncome - totalExpenses;
      const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;

      let savingsText = `💰 **Your Savings Analysis:**\n\n`;
      savingsText += `📥 Income: ₹${totalIncome.toFixed(2)}\n`;
      savingsText += `📤 Expenses: ₹${totalExpenses.toFixed(2)}\n`;
      savingsText += `💚 Savings: ₹${totalSavings.toFixed(2)}\n`;
      savingsText += `📊 Savings Rate: ${savingsRate.toFixed(1)}%\n\n`;

      if (savingsRate >= 20) {
        savingsText += `✅ Excellent! You're saving ${savingsRate.toFixed(1)}% of your income.`;
      } else if (savingsRate >= 10) {
        savingsText += `👍 Good! You're saving ${savingsRate.toFixed(1)}% of your income.`;
      } else if (totalSavings > 0) {
        savingsText += `⚠️ You're saving ${savingsRate.toFixed(1)}% of your income. Try to increase this to at least 10-20%.`;
      } else {
        savingsText += `🔴 Warning! You're spending more than you earn. Review your expenses!`;
      }

      return {
        text: savingsText,
        suggestions: ['Get recommendations', 'Show spending areas', 'Set budgets'],
        dataUsed: {
          recentExpenses: totalExpenses > 0 ? 1 : 0,
          analyticsData: true
        }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle ask category breakdown
   */
  async handleAskCategoryBreakdown(userId, user) {
    try {
      const currentMonth = new Date();
      const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);

      const breakdown = await Expense.aggregate([
        {
          $match: {
            user: userId,
            type: 'expense',
            date: { $gte: monthStart, $lt: monthEnd }
          }
        },
        {
          $group: {
            _id: '$category',
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { total: -1 } }
      ]);

      const totalSpent = breakdown.reduce((sum, item) => sum + item.total, 0);

      let breakdownText = `📊 **Category Breakdown:**\n\n`;

      for (const item of breakdown) {
        const percentage = (item.total / totalSpent) * 100;
        breakdownText += `🏷️  ${item._id.toUpperCase()}: ₹${item.total.toFixed(2)} (${percentage.toFixed(1)}%, ${item.count} transactions)\n`;
      }

      const topCategory = breakdown[0];
      const suggestion = `Your top spending is in ${topCategory._id}. Consider setting a budget for this category.`;

      return {
        text: breakdownText + `\n${suggestion}`,
        suggestions: [`Set budget for ${topCategory._id}`, 'Show spending trends', 'Get recommendations'],
        dataUsed: { recentExpenses: breakdown.length }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle set budget intent
   */
  async handleSetBudget(userId, entities, user) {
    try {
      if (!entities.category || !entities.amount) {
        return {
          text: `To set a budget, please say something like: "Set budget for food to ₹5000"`
        };
      }

      const category = this.categories.find(c => c.toLowerCase() === entities.category.toLowerCase());
      
      if (!category) {
        return {
          text: `I don't recognize the category "${entities.category}". Valid categories are: ${this.categories.join(', ')}`
        };
      }

      let budget = await Budget.findOne({ user: userId, category });
      
      if (budget) {
        budget.limit = entities.amount;
      } else {
        budget = new Budget({
          user: userId,
          category,
          limit: entities.amount
        });
      }

      await budget.save();

      return {
        text: `✅ Budget set successfully!\n💰 Category: ${category.toUpperCase()}\n📊 Limit: ₹${entities.amount}`,
        action: 'set_budget',
        actionPerformed: 'Budget Created/Updated',
        actionResult: {
          budgetId: budget._id,
          category,
          limit: entities.amount
        },
        suggestions: ['Set another budget', 'Show all budgets', 'Track spending'],
        dataUsed: { budgetData: true }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle get recommendation intent
   */
  async handleGetRecommendation(userId, user) {
    try {
      const recommendations = [];

      // Check budgets
      const budgets = await Budget.find({ user: userId });
      const currentMonth = new Date();
      const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);

      for (const budget of budgets) {
        const spent = await Expense.aggregate([
          {
            $match: {
              user: userId,
              category: budget.category,
              type: 'expense',
              date: { $gte: monthStart, $lt: monthEnd }
            }
          },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const totalSpent = spent[0]?.total || 0;
        const percentageUsed = (totalSpent / budget.limit) * 100;

        if (percentageUsed > 90) {
          recommendations.push(`🔴 Reduce spending in ${budget.category} - you've used ${Math.round(percentageUsed)}% of your budget`);
        }
      }

      // Check savings rate
      const income = await Expense.aggregate([
        {
          $match: {
            user: userId,
            type: 'income',
            date: { $gte: monthStart, $lt: monthEnd }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      const expenses = await Expense.aggregate([
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
      const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

      if (savingsRate < 10) {
        recommendations.push(`💡 Try to increase your savings rate to at least 10-15% of your income`);
      } else if (savingsRate >= 20) {
        recommendations.push(`✅ Great job! Your savings rate of ${Math.round(savingsRate)}% is excellent`);
      }

      if (recommendations.length === 0) {
        recommendations.push(`💚 Your finances look great! Keep maintaining this discipline`);
      }

      let recommendationText = `💡 **Financial Recommendations:**\n\n`;
      for (const rec of recommendations) {
        recommendationText += `• ${rec}\n`;
      }

      return {
        text: recommendationText,
        suggestions: ['Show budgets', 'Show spending', 'Set a goal']
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle ask recurring expenses
   */
  async handleAskRecurring(userId, user) {
    try {
      const recurring = await RecurringExpense.find({ user: userId, isActive: true });

      if (recurring.length === 0) {
        return {
          text: `📋 You don't have any recurring expenses set up yet.\n\nRecurring expenses help you track subscriptions and fixed payments automatically!`,
          suggestions: ['Add a recurring expense', 'Show all expenses', 'Get recommendations']
        };
      }

      let recurringText = `📋 **Your Recurring Expenses:**\n\n`;
      let totalMonthly = 0;

      for (const expense of recurring) {
        recurringText += `💳 ${expense.description}\n`;
        recurringText += `   Amount: ₹${expense.amount}\n`;
        recurringText += `   Frequency: ${expense.frequency}\n`;
        recurringText += `   Next Due: ${expense.nextDate.toLocaleDateString()}\n\n`;
        
        totalMonthly += expense.frequency === 'monthly' ? expense.amount : expense.frequency === 'yearly' ? expense.amount / 12 : expense.amount * 4.33;
      }

      recurringText += `\n💰 Estimated Monthly Cost: ₹${totalMonthly.toFixed(2)}`;

      return {
        text: recurringText,
        suggestions: ['Add recurring expense', 'Show all expenses', 'Budget recommendations']
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle ask goals
   */
  async handleAskGoals(userId, user) {
    try {
      const goals = await Goal.find({ user: userId });

      if (goals.length === 0) {
        return {
          text: `🎯 You haven't set any financial goals yet.\n\nSetting goals helps you plan and save for what matters to you!`,
          suggestions: ['Create a savings goal', 'Show budgets', 'Get recommendations']
        };
      }

      let goalsText = `🎯 **Your Financial Goals:**\n\n`;

      for (const goal of goals) {
        const progress = (goal.currentAmount / goal.targetAmount) * 100;
        const remaining = goal.targetAmount - goal.currentAmount;
        const barLength = Math.round(progress / 5);
        const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);

        goalsText += `${goal.goalName}\n`;
        goalsText += `${bar} ${progress.toFixed(1)}% complete\n`;
        goalsText += `Progress: ₹${goal.currentAmount.toFixed(2)} / ₹${goal.targetAmount.toFixed(2)}\n`;
        goalsText += `Remaining: ₹${remaining.toFixed(2)}\n`;
        goalsText += `Target Date: ${goal.targetDate.toLocaleDateString()}\n\n`;
      }

      return {
        text: goalsText,
        suggestions: ['Create a new goal', 'Show budgets', 'Get recommendations']
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle general queries
   */
  handleGeneralQuery(message) {
    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
    const isGreeting = greetings.some(g => message.toLowerCase().includes(g));

    if (isGreeting) {
      return {
        text: `👋 Hello! I'm your AI Financial Assistant. I can help you:\n\n✅ Add expenses (e.g., "Spent ₹500 on groceries")\n📊 Show spending and budgets\n💡 Provide financial advice\n📈 Track trends and savings\n🎯 Manage financial goals\n\nWhat would you like to do?`,
        suggestions: ['Add expense', 'Show spending', 'Get recommendations', 'Set budget']
      };
    }

    const helpKeywords = ['help', 'what can you do', 'capabilities', 'features'];
    if (helpKeywords.some(k => message.toLowerCase().includes(k))) {
      return {
        text: `🤖 **Here's what I can help you with:**\n\n💰 **Add Expenses**: "Spent ₹1200 on dinner"\n📊 **View Spending**: "How much did I spend?"\n💼 **Manage Budgets**: "Set budget for food to ₹5000"\n📈 **See Trends**: "Show me spending trends"\n💡 **Get Advice**: "Give me recommendations"\n🎯 **Track Goals**: "Show my savings goals"\n📋 **Recurring Expenses**: "What's my subscriptions?"\n\nJust ask me anything about your finances!`,
        suggestions: ['Add expense', 'Show spending', 'Get recommendations']
      };
    }

    return {
      text: `I'm not sure I understood that. Could you rephrase your question?\n\nTry things like:\n• "I spent ₹500 on groceries"\n• "What's my budget?"\n• "Show my spending"\n• "Get me financial advice"`,
      suggestions: ['Add expense', 'Show spending', 'Get help']
    };
  }
}

module.exports = new ChatAssistantService();
