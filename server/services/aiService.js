// Simple AI service without tensorflow
const statistics = require('simple-statistics');

class AIService {
  constructor() {
    this.categories = {
      'food': ['restaurant', 'grocery', 'cafe', 'food', 'dining'],
      'transport': ['uber', 'taxi', 'bus', 'train', 'fuel', 'gas'],
      'shopping': ['amazon', 'store', 'mall', 'shop', 'retail'],
      'entertainment': ['movie', 'game', 'music', 'netflix', 'spotify'],
      'utilities': ['electricity', 'water', 'internet', 'phone', 'bill']
    };
  }

  init() {
    console.log('AI Service initialized (simplified version)');
  }

  categorizeExpense(description, amount) {
    const desc = description.toLowerCase();
    
    for (const [category, keywords] of Object.entries(this.categories)) {
      if (keywords.some(keyword => desc.includes(keyword))) {
        return {
          category,
          confidence: 0.8
        };
      }
    }
    
    return {
      category: 'other',
      confidence: 0.5
    };
  }

  detectAnomalies(expenses) {
    if (expenses.length < 5) return [];
    
    const amounts = expenses.map(e => e.amount);
    const mean = statistics.mean(amounts);
    const stdDev = statistics.standardDeviation(amounts);
    
    return expenses.filter(expense => {
      const zScore = Math.abs((expense.amount - mean) / stdDev);
      return zScore > 2; // Anomaly if more than 2 standard deviations
    });
  }

  predictSpending(historicalData) {
    if (historicalData.length < 3) {
      return { prediction: 0, confidence: 0 };
    }
    
    const amounts = historicalData.map(d => d.amount);
    const trend = statistics.linearRegression(amounts.map((amount, index) => [index, amount]));
    
    return {
      prediction: trend.m * amounts.length + trend.b,
      confidence: 0.7
    };
  }
}

module.exports = new AIService();