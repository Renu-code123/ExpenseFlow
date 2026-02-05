# Predictive Cash Flow & Financial Forecasting Engine

An advanced financial forecasting system that predicts future cash flows, identifies potential shortfalls, and provides actionable recommendations using time-series analysis, seasonal patterns, and intelligent alerts.

## Overview

The Cash Flow & Financial Forecasting Engine uses historical transaction data, income patterns, and seasonal trends to predict future financial positions. It provides scenario planning, risk assessment, and proactive alerts to help users make informed financial decisions.

## Key Features

- 📈 **Predictive Forecasting**: ML-powered cash flow predictions with confidence scoring
- 💰 **Income Tracking**: Monitor multiple income sources with variability analysis
- 📊 **Seasonal Patterns**: Detect and apply seasonal spending patterns
- 🎯 **Scenario Planning**: Create and compare optimistic, baseline, and pessimistic scenarios
- 🚨 **Smart Alerts**: Proactive notifications for low balance, high spend, and goal risks
- 🔮 **What-If Analysis**: Test financial decisions before committing
- 📉 **Risk Assessment**: Identify and mitigate financial risks
- 💡 **Recommendations**: AI-generated actionable advice
- 📅 **Multi-Period Forecasts**: Daily, weekly, monthly, quarterly, and annual predictions
- 🎨 **Confidence Metrics**: Transparency in prediction accuracy

## Architecture

### Components

1. **CashFlowForecast** - Predicted financial positions with scenario analysis
2. **IncomeSource** - Recurring income tracking with reliability scoring
3. **SeasonalPattern** - Historical spending patterns and trends
4. **ForecastScenario** - What-if scenarios with custom assumptions
5. **FinancialAlert** - Proactive warnings and recommendations

## Models

### CashFlowForecast Model

Predicts future cash flow with confidence scoring:

```javascript
{
  user: ObjectId,
  forecastDate: '2024-02-15T00:00:00Z',
  forecastPeriod: {
    start: '2024-02-01',
    end: '2024-02-29'
  },
  periodType: 'monthly',
  predictedIncome: 5000,
  predictedExpenses: 3500,
  predictedBalance: 1500,
  confidence: {
    overall: 0.87,
    income: 0.92,
    expenses: 0.85,
    balance: 0.84
  },
  scenarios: {
    optimistic: { income: 5500, expenses: 3200, balance: 2300 },
    baseline: { income: 5000, expenses: 3500, balance: 1500 },
    pessimistic: { income: 4500, expenses: 3800, balance: 700 }
  },
  risks: [
    {
      type: 'low_balance',
      severity: 'medium',
      probability: 0.3,
      mitigation: 'Reduce discretionary spending by 15%'
    }
  ],
  recommendations: [
    {
      type: 'save',
      priority: 'high',
      title: 'Build Emergency Fund',
      expectedImpact: 500
    }
  ]
}
```

### IncomeSource Model

Tracks recurring income with reliability metrics:

```javascript
{
  user: ObjectId,
  name: 'Primary Salary',
  type: 'salary',
  amount: 5000,
  frequency: 'monthly',
  nextExpectedDate: '2024-02-01',
  variability: 'fixed',
  confidence: 0.95,
  reliability: 0.98,
  onTimeRate: 1.0,
  historicalPayments: [
    { date: '2024-01-01', actualAmount: 5000, variance: 0 }
  ]
}
```

### SeasonalPattern Model

Captures spending patterns and trends:

```javascript
{
  user: ObjectId,
  category: 'shopping',
  monthlyFactors: [
    1.0, 1.0, 1.0, 1.1, 1.1, 1.2,  // Jan-Jun
    1.3, 1.2, 1.1, 1.0, 1.5, 2.0   // Jul-Dec (holiday spike)
  ],
  dayOfWeekFactors: [1.0, 0.8, 0.8, 0.9, 1.1, 1.3, 1.2], // Sun-Sat
  holidayImpact: [
    {
      holiday: 'black_friday',
      factor: 3.0,
      daysBefore: 1,
      daysAfter: 2
    }
  ],
  confidence: 0.82,
  dataPoints: 24
}
```

### ForecastScenario Model

Custom scenarios with assumptions:

```javascript
{
  user: ObjectId,
  name: 'Job Change Scenario',
  scenarioType: 'what_if',
  startDate: '2024-02-01',
  endDate: '2024-12-31',
  assumptions: [
    {
      category: 'income',
      name: 'New Job',
      description: '20% salary increase',
      value: 1.2,
      impact: 'positive',
      likelihood: 0.7
    }
  ],
  adjustments: {
    income: [
      {
        source: 'Primary Salary',
        changeType: 'percentage',
        value: 20,
        effectiveDate: '2024-03-01'
      }
    ]
  },
  results: {
    totalIncome: 66000,
    totalExpenses: 42000,
    netCashFlow: 24000,
    endingBalance: 30000,
    savingsRate: 36.4
  }
}
```

### FinancialAlert Model

Proactive warnings and recommendations:

```javascript
{
  user: ObjectId,
  title: 'Low Balance Warning',
  type: 'low_balance',
  severity: 'high',
  predictedDate: '2024-02-20',
  amount: 150,
  recommendation: {
    action: 'Reduce discretionary spending',
    steps: [
      'Postpone non-essential purchases',
      'Review subscriptions',
      'Identify cost-cutting opportunities'
    ],
    expectedBenefit: 500,
    urgency: 'this_week'
  },
  acknowledged: false,
  resolved: false
}
```

## API Reference

### Cash Flow Forecasts

#### Generate Forecast
```http
POST /api/forecasts/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "periodType": "monthly",
  "periods": 6,
  "includeScenarios": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef0",
    "forecastDate": "2024-02-01",
    "predictedIncome": 5000,
    "predictedExpenses": 3500,
    "predictedBalance": 1500,
    "confidence": { "overall": 0.87 },
    "scenarios": {...},
    "generatedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### Get User Forecasts
```http
GET /api/forecasts
Authorization: Bearer <token>

?start_date=2024-02-01&end_date=2024-12-31&period_type=monthly
```

#### Get Forecast Details
```http
GET /api/forecasts/:id
Authorization: Bearer <token>
```

#### Update Forecast with Actuals
```http
PUT /api/forecasts/:id/actuals
Authorization: Bearer <token>
Content-Type: application/json

{
  "actualIncome": 5100,
  "actualExpenses": 3400,
  "actualBalance": 1700
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accuracy": {
      "incomeError": 2.0,
      "expenseError": 2.9,
      "overallAccuracy": 0.95
    },
    "isVerified": true
  }
}
```

#### Get Forecast Accuracy
```http
GET /api/forecasts/accuracy
Authorization: Bearer <token>

?months=6
```

### Income Sources

#### Create Income Source
```http
POST /api/income-sources
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Freelance Work",
  "type": "freelance",
  "amount": 2000,
  "frequency": "monthly",
  "startDate": "2024-01-01",
  "variability": "variable"
}
```

#### Get Income Sources
```http
GET /api/income-sources
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789abcdef0",
      "name": "Primary Salary",
      "type": "salary",
      "amount": 5000,
      "frequency": "monthly",
      "nextExpectedDate": "2024-02-01",
      "confidence": 0.95,
      "reliability": 0.98,
      "isPrimary": true
    }
  ]
}
```

#### Update Income Source
```http
PUT /api/income-sources/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 5500,
  "notes": "Annual raise"
}
```

#### Record Payment
```http
POST /api/income-sources/:id/payments
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 5000,
  "date": "2024-02-01",
  "notes": "Regular monthly payment"
}
```

#### Get Total Monthly Income
```http
GET /api/income-sources/monthly-total
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalMonthlyIncome": 7000,
    "breakdown": [
      { "source": "Primary Salary", "amount": 5000 },
      { "source": "Freelance", "amount": 2000 }
    ]
  }
}
```

### Seasonal Patterns

#### Get User Patterns
```http
GET /api/seasonal-patterns
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789abcdef0",
      "category": "shopping",
      "confidence": 0.82,
      "dataPoints": 24,
      "peakMonths": [11, 12],
      "trend": {
        "direction": "increasing",
        "slope": 0.05
      }
    }
  ]
}
```

#### Get Pattern for Category
```http
GET /api/seasonal-patterns/:category
Authorization: Bearer <token>
```

#### Apply Pattern to Amount
```http
POST /api/seasonal-patterns/:id/apply
Authorization: Bearer <token>
Content-Type: application/json

{
  "baseAmount": 500,
  "dates": ["2024-02-01", "2024-03-01", "2024-04-01"]
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    { "date": "2024-02-01", "amount": 500, "factor": 1.0 },
    { "date": "2024-03-01", "amount": 550, "factor": 1.1 },
    { "date": "2024-04-01", "amount": 525, "factor": 1.05 }
  ]
}
```

### Forecast Scenarios

#### Create Scenario
```http
POST /api/scenarios
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "New Car Purchase",
  "scenarioType": "what_if",
  "startDate": "2024-02-01",
  "endDate": "2024-12-31",
  "assumptions": [
    {
      "category": "expense",
      "name": "Car Payment",
      "description": "Monthly car loan payment",
      "value": 400,
      "impact": "negative"
    }
  ],
  "adjustments": {
    "expenses": [
      {
        "category": "transport",
        "changeType": "fixed_amount",
        "value": 400
      }
    ]
  }
}
```

#### Get User Scenarios
```http
GET /api/scenarios
Authorization: Bearer <token>
```

#### Compare Scenarios
```http
POST /api/scenarios/:id/compare
Authorization: Bearer <token>
Content-Type: application/json

{
  "compareWith": "baseline_scenario_id"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "incomeDifference": 0,
    "expenseDifference": 4800,
    "balanceDifference": -4800,
    "percentageChange": -16.0
  }
}
```

#### Get Baseline Scenario
```http
GET /api/scenarios/baseline
Authorization: Bearer <token>
```

### Financial Alerts

#### Get User Alerts
```http
GET /api/alerts
Authorization: Bearer <token>

?type=low_balance&severity=high&acknowledged=false
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789abcdef0",
      "title": "Low Balance Warning",
      "type": "low_balance",
      "severity": "high",
      "predictedDate": "2024-02-20",
      "amount": 150,
      "daysUntilEvent": 5,
      "recommendation": {
        "action": "Reduce spending",
        "urgency": "this_week"
      },
      "acknowledged": false
    }
  ]
}
```

#### Get Critical Alerts
```http
GET /api/alerts/critical
Authorization: Bearer <token>
```

#### Acknowledge Alert
```http
POST /api/alerts/:id/acknowledge
Authorization: Bearer <token>
```

#### Record Action Taken
```http
POST /api/alerts/:id/action
Authorization: Bearer <token>
Content-Type: application/json

{
  "action": "Reduced discretionary spending",
  "notes": "Cut subscription services"
}
```

#### Dismiss Alert
```http
POST /api/alerts/:id/dismiss
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Already addressed"
}
```

#### Provide Feedback
```http
POST /api/alerts/:id/feedback
Authorization: Bearer <token>
Content-Type: application/json

{
  "useful": true,
  "accurate": true,
  "comment": "Very helpful alert"
}
```

#### Get Alert Statistics
```http
GET /api/alerts/stats
Authorization: Bearer <token>

?days=30
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 15,
    "byType": {
      "low_balance": 5,
      "high_spend": 4,
      "goal_risk": 3
    },
    "bySeverity": {
      "critical": 2,
      "high": 5,
      "medium": 8
    },
    "acknowledged": 12,
    "resolved": 10,
    "actionTaken": 8
  }
}
```

## Usage Examples

### 1. Generate Monthly Cash Flow Forecast

```javascript
// Generate 6-month forecast
const forecastResponse = await fetch('/api/forecasts/generate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    periodType: 'monthly',
    periods: 6,
    includeScenarios: true
  })
});

const { data: forecasts } = await forecastResponse.json();
forecasts.forEach(forecast => {
  console.log(`${forecast.forecastDate}: $${forecast.predictedBalance}`);
  console.log(`Confidence: ${(forecast.confidence.overall * 100).toFixed(0)}%`);
  
  if (forecast.risks.length > 0) {
    console.log('Risks detected:', forecast.risks.length);
  }
});
```

### 2. Set Up Income Sources

```javascript
// Add primary salary
const salaryResponse = await fetch('/api/income-sources', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Primary Salary',
    type: 'salary',
    amount: 5000,
    frequency: 'monthly',
    startDate: '2024-01-01',
    variability: 'fixed',
    isPrimary: true
  })
});

// Add freelance income
const freelanceResponse = await fetch('/api/income-sources', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Freelance Projects',
    type: 'freelance',
    amount: 2000,
    frequency: 'monthly',
    variability: 'variable'
  })
});
```

### 3. Create What-If Scenario

```javascript
// Create scenario for job change
const scenarioResponse = await fetch('/api/scenarios', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'New Job Opportunity',
    scenarioType: 'what_if',
    startDate: '2024-03-01',
    endDate: '2024-12-31',
    assumptions: [
      {
        category: 'income',
        name: 'Higher Salary',
        description: '25% increase',
        value: 1.25,
        impact: 'positive',
        likelihood: 0.8
      },
      {
        category: 'expense',
        name: 'Relocation',
        description: 'One-time moving cost',
        value: 3000,
        impact: 'negative',
        likelihood: 1.0
      }
    ],
    adjustments: {
      income: [
        {
          source: 'Primary Salary',
          changeType: 'percentage',
          value: 25,
          effectiveDate: '2024-03-01'
        }
      ]
    },
    goals: [
      {
        name: 'Save $10,000',
        targetAmount: 10000,
        targetDate: '2024-12-31'
      }
    ]
  })
});

const { data: scenario } = await scenarioResponse.json();
console.log('New Job Scenario Results:');
console.log(`Total Income: $${scenario.results.totalIncome}`);
console.log(`Net Cash Flow: $${scenario.results.netCashFlow}`);
console.log(`Ending Balance: $${scenario.results.endingBalance}`);
console.log(`Goal Achievement: ${scenario.getSuccessRate()}%`);
```

### 4. Monitor and Respond to Alerts

```javascript
// Get critical alerts
const alertsResponse = await fetch('/api/alerts/critical', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: alerts } = await alertsResponse.json();

alerts.forEach(async (alert) => {
  console.log(`⚠️ ${alert.title}`);
  console.log(`Severity: ${alert.severity}`);
  console.log(`Predicted: ${alert.predictedDate}`);
  console.log(`Action: ${alert.recommendation.action}`);
  
  // Acknowledge the alert
  await fetch(`/api/alerts/${alert._id}/acknowledge`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  // Take action if urgent
  if (alert.recommendation.urgency === 'immediate') {
    console.log('Taking immediate action...');
    await fetch(`/api/alerts/${alert._id}/action`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: alert.recommendation.action,
        notes: 'Following recommendation'
      })
    });
  }
});
```

### 5. Track Forecast Accuracy

```javascript
// Update forecast with actual values
const forecastId = 'forecast_id_here';
const actualsResponse = await fetch(`/api/forecasts/${forecastId}/actuals`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    actualIncome: 5100,
    actualExpenses: 3400,
    actualBalance: 1700
  })
});

// Get historical accuracy
const accuracyResponse = await fetch('/api/forecasts/accuracy?months=6', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: accuracy } = await accuracyResponse.json();
console.log('Forecast Accuracy (Last 6 Months):');
console.log(`Overall: ${(accuracy.averageAccuracy * 100).toFixed(1)}%`);
console.log(`Income Error: ${accuracy.averageIncomeError.toFixed(1)}%`);
console.log(`Expense Error: ${accuracy.averageExpenseError.toFixed(1)}%`);
```

## Forecasting Algorithms

### Time Series Analysis
- ARIMA (AutoRegressive Integrated Moving Average)
- Exponential Smoothing
- Prophet (Facebook's forecasting tool)

### Seasonal Decomposition
- Additive and multiplicative models
- Trend extraction
- Cyclical pattern detection

### Machine Learning
- LSTM (Long Short-Term Memory) networks
- Random Forest regression
- Gradient Boosting

### Ensemble Methods
- Combines multiple algorithms
- Weighted averaging based on historical accuracy
- Adaptive model selection

## Confidence Scoring

Confidence scores (0-1) indicate prediction reliability:

- **Very High (0.9-1.0)**: Historical data is consistent and predictable
- **High (0.7-0.89)**: Good historical data with minor variations
- **Medium (0.5-0.69)**: Moderate historical data or some volatility
- **Low (0.3-0.49)**: Limited data or high variability
- **Very Low (0-0.29)**: Insufficient data or extreme volatility

## Best Practices

1. **Income Sources**:
   - Add all recurring income sources
   - Update amounts when they change
   - Record actual payments to improve accuracy

2. **Forecast Generation**:
   - Generate forecasts regularly (weekly or monthly)
   - Review confidence scores
   - Update with actuals for continuous improvement

3. **Scenario Planning**:
   - Create baseline scenario first
   - Compare alternatives to baseline
   - Use realistic assumptions

4. **Alert Management**:
   - Review alerts daily
   - Acknowledge and take action promptly
   - Provide feedback to improve accuracy

5. **Seasonal Patterns**:
   - Let system detect patterns (requires 12+ months of data)
   - Review and adjust manually if needed
   - Update patterns after major life changes

## Limitations

- Requires 3+ months of historical data for basic forecasts
- Optimal accuracy achieved with 12+ months of data
- Cannot predict truly random events
- Assumes patterns will continue
- Confidence decreases with longer forecast horizons

## Future Enhancements

- External data integration (economic indicators, market data)
- Goal-based forecasting
- Automatic budget adjustments based on forecasts
- Collaborative forecasting for shared accounts
- Advanced ML models (deep learning, reinforcement learning)
- Mobile push notifications for critical alerts
- Voice assistant integration
- Retirement planning and long-term forecasts

## License

MIT License - see LICENSE file for details
