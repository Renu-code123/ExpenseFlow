# Predictive "Burn Rate" Intelligence & AI-Driven Financial Forecasting

## Overview

This feature transforms ExpenseFlow from a passive expense tracker into a proactive financial guidance system. Using machine learning algorithms and predictive analytics, the system calculates daily/weekly spending velocity ("burn rate") and forecasts when users will hit budget limits or run out of funds based on historical patterns.

## Features

### 1. **Burn Rate Calculation**
- Daily and weekly spending velocity analysis
- Trend detection (increasing, decreasing, stable)
- Confidence scoring based on data quality
- Category-specific burn rate tracking

### 2. **Predictive Forecasting**
- Linear regression ML algorithm for expense prediction
- 30-day, 60-day, and 90-day forecasts
- Confidence intervals and accuracy metrics
- Category-specific predictions

### 3. **Budget Exhaustion Prediction**
- Predict exact date when budgets will be exceeded
- Early warning alerts (critical, warning, caution)
- Days until exhaustion calculations
- Projected end-of-period amounts

### 4. **Weighted Moving Average (WMA)**
- Smoothed predictions for volatile spending
- Configurable time periods (7, 14, 30 days)
- Reduces noise in prediction models

### 5. **Intelligent Insights**
- Auto-generated insights and recommendations
- Priority-based alert system (critical → low)
- Category-specific trend analysis
- Positive reinforcement for good behavior

### 6. **Offline Support**
- Forecast caching in IndexedDB
- 24-hour cache validity
- Offline viewing of historical predictions

## Architecture

### Backend Components

#### IntelligenceService (`services/intelligenceService.js`)

Core analytics engine with the following methods:

**Burn Rate Analysis**
```javascript
await intelligenceService.calculateBurnRate(userId, {
  startDate,
  endDate,
  categoryId,
  workspaceId
});
```

Returns:
- dailyBurnRate: Average daily spending
- weeklyBurnRate: Projected weekly spending
- trend: 'increasing', 'decreasing', or 'stable'
- trendPercentage: Rate of change
- confidence: Prediction confidence (0-100%)

**Expense Prediction**
```javascript
await intelligenceService.predictExpenses(userId, {
  categoryId,
  daysToPredict: 30,
  workspaceId
});
```

Returns:
- predictions: Daily predicted amounts
- cumulativePredictions: Running total
- model: { slope, intercept, rSquared, accuracy }
- historicalData: Last 30 days for comparison

**Budget Exhaustion**
```javascript
await intelligenceService.predictBudgetExhaustion(userId, budgetId);
```

Returns:
- status: 'safe', 'caution', 'warning', 'critical', 'exhausted'
- severity: 'low', 'medium', 'high'
- predictedExhaustionDate: Date when budget will be exceeded
- daysUntilExhaustion: Days remaining
- dailyBurnRate: Current spending velocity
- projectedEndAmount: Predicted total at period end

**Category Patterns**
```javascript
await intelligenceService.analyzeCategoryPatterns(userId, {
  workspaceId,
  daysToAnalyze: 30
});
```

Returns category-by-category analysis with:
- Total spent
- Transaction count
- Average transaction
- Burn rate metrics
- 30-day predictions

**Insights Generation**
```javascript
await intelligenceService.generateInsights(userId);
```

Returns prioritized insights including:
- Budget alerts (critical/warning)
- Spending trend warnings
- Category-specific concerns
- Positive achievements

#### Service Integration

**BudgetService** (`services/budgetService.js`)
- Integrated predictive burn rate alerts
- Early warning system when budgets will be exceeded
- Automatic alert generation on budget checks

**ExpenseService** (`services/expenseService.js`)
- Triggers intelligence analysis after expense creation
- Emits real-time burn rate alerts via Socket.IO
- Non-blocking async intelligence updates

**CronJobs** (`services/cronJobs.js`)
- Daily intelligence analysis at 8 AM
- Auto-generation of insights for all users
- Email alerts for critical/high priority insights
- Scheduled analysis based on user preferences

#### API Routes (`routes/analytics.js`)

New endpoints:

```
GET  /api/analytics/burn-rate
     ?categoryId=...&workspaceId=...&startDate=...&endDate=...
     
GET  /api/analytics/forecast
     ?categoryId=...&workspaceId=...&daysToPredict=30
     
GET  /api/analytics/forecast/moving-average
     ?categoryId=...&workspaceId=...&period=7
     
GET  /api/analytics/budget/:budgetId/exhaustion
     
GET  /api/analytics/category-patterns
     ?workspaceId=...&daysToAnalyze=30
     
GET  /api/analytics/insights
     
GET  /api/analytics/forecast/complete
     Combined endpoint returning all forecast data
```

### Data Model

#### User Model Updates (`models/User.js`)

New `intelligencePreferences` schema:

```javascript
{
  enablePredictiveAnalysis: Boolean (default: true),
  emailAlerts: Boolean (default: true),
  alertThresholds: {
    burnRateIncrease: Number (default: 20%), // Trigger alert threshold
    budgetExhaustionDays: Number (default: 7) // Days until exhaustion
  },
  forecastPeriod: Number (default: 30), // Days to forecast
  analysisFrequency: 'daily' | 'weekly' | 'monthly',
  cacheForecasts: Boolean (default: true),
  lastAnalysisRun: Date
}
```

### Frontend Components

#### Analytics Dashboard (`public/analytics-dashboard.js`)

**New Methods:**

- `loadForecastData()`: Fetch complete forecast data from API
- `renderForecastDashboard()`: Chart.js visualization of predictions
- `renderBurnRateMetrics()`: Display burn rate cards
- `renderInsights()`: Priority-sorted intelligent insights
- `renderCategoryPatterns()`: Category-by-category analysis
- `cacheForecastData()`: Save to IndexedDB for offline
- `loadCachedForecast()`: Load cached data when offline

**Chart Visualization:**

Uses Chart.js to display:
- Historical spending (blue line, filled)
- Predicted spending (orange dashed line)
- Hover tooltips with exact amounts
- Responsive design

**UI Components:**

1. **Forecast Summary Cards**
   - Predicted Spending (30 days)
   - Daily Burn Rate with trend
   - Trend Percentage (positive/negative)

2. **Burn Rate Metrics Grid**
   - Daily burn rate with confidence
   - Weekly burn rate projection
   - Spending trend indicator
   - Confidence score

3. **Insights Cards**
   - Priority-based color coding (red → green)
   - Icon indicators (🚨⚠️ℹ️✅)
   - Categorized insights
   - Actionable messages

4. **Category Patterns Grid**
   - Top 5 spending categories
   - Total spent and transaction count
   - Daily burn rate per category
   - 30-day forecast with accuracy
   - Trend indicators

#### DB Manager (`public/db-manager.js`)

**New Store:**
- `forecasts` object store with timestamp index
- Stores complete forecast data including:
  - burnRate
  - forecast predictions
  - categoryPatterns
  - insights

**New Methods:**
```javascript
await DBManager.saveForecast(forecastData);
const cached = await DBManager.getForecast();
await DBManager.clearForecast();
```

**Cache Strategy:**
- 24-hour cache validity
- Automatic cache on successful API load
- Fallback to cached data when offline
- Age indicator for stale data

#### HTML Updates (`public/index.html`)

**New Containers:**
```html
<div id="forecast-container"></div>
<div id="burn-rate-metrics"></div>
<div id="insights-container"></div>
<div id="category-patterns-container"></div>
```

These are populated dynamically by analytics-dashboard.js.

## ML Algorithm Details

### Linear Regression

**Formula:**
```
y = mx + b

Where:
- y = predicted expense
- m = slope (rate of change)
- x = day index
- b = intercept (baseline)
```

**Calculation:**
```javascript
slope = (n*ΣXY - ΣX*ΣY) / (n*ΣX² - (ΣX)²)
intercept = (ΣY - slope*ΣX) / n
```

**R-Squared (Accuracy):**
```javascript
R² = 1 - (SS_residual / SS_total)

Where:
- SS_total = Σ(y_actual - y_mean)²
- SS_residual = Σ(y_actual - y_predicted)²
```

R² ranges from 0 to 1:
- 0.9-1.0: Excellent prediction
- 0.7-0.9: Good prediction
- 0.5-0.7: Moderate prediction
- <0.5: Poor prediction

### Weighted Moving Average

**Formula:**
```
WMA = (w₁*v₁ + w₂*v₂ + ... + wₙ*vₙ) / (w₁ + w₂ + ... + wₙ)

Where:
- wᵢ = weight (1, 2, 3, ..., n for linear weights)
- vᵢ = value at position i
```

This gives more weight to recent data points, smoothing out volatility.

## User Workflows

### 1. View Burn Rate

1. Navigate to Analytics section
2. System automatically calculates burn rate
3. View daily/weekly spending velocity
4. Check trend (increasing/decreasing/stable)
5. Review confidence score

### 2. View Forecast

1. Open Forecast tab
2. View 30-day prediction chart
3. Compare historical vs. predicted spending
4. Check model accuracy percentage
5. Download chart or forecast data

### 3. Receive Early Warning

**Automatic:**
1. System runs daily at 8 AM
2. Calculates burn rate for all budgets
3. Detects budgets on track to exceed
4. Sends email alert if critical/warning
5. Socket.IO notification in real-time

**Manual:**
1. Add expense
2. System triggers burn rate analysis
3. If trend increasing >15%, socket alert
4. View insight in dashboard

### 4. Review Insights

1. Navigate to Insights section
2. View prioritized alerts (critical → low)
3. Click insight for detailed data
4. Take recommended action
5. Mark as resolved (future feature)

### 5. Analyze Category Patterns

1. Open Category Patterns view
2. See top 5 spending categories
3. Review burn rate per category
4. Check 30-day forecast
5. Identify concerning trends

## Configuration

### User Settings

Users can configure via intelligencePreferences:

```javascript
// Enable/disable predictive analysis
intelligencePreferences.enablePredictiveAnalysis = true;

// Email alerts for critical insights
intelligencePreferences.emailAlerts = true;

// Burn rate increase threshold (%)
intelligencePreferences.alertThresholds.burnRateIncrease = 20;

// Days until exhaustion alert
intelligencePreferences.alertThresholds.budgetExhaustionDays = 7;

// Forecast period (7-90 days)
intelligencePreferences.forecastPeriod = 30;

// Analysis frequency
intelligencePreferences.analysisFrequency = 'daily';

// Cache forecasts
intelligencePreferences.cacheForecasts = true;
```

### System Configuration

**Cron Schedule:**
```javascript
// Daily at 8 AM
cron.schedule('0 8 * * *', async () => {
  await this.runIntelligenceAnalysis();
});
```

**Cache Settings:**
- Max age: 24 hours
- Store: IndexedDB 'forecasts' store
- Auto-cleanup: On next load

## Performance Optimization

### Caching Strategy

1. **API Response Caching**
   - Cache complete forecast data
   - 24-hour validity
   - Reduce server load

2. **Async Processing**
   - Non-blocking intelligence analysis
   - `setImmediate` for background processing
   - Socket.IO for real-time updates

3. **Batch Operations**
   - Combined `/forecast/complete` endpoint
   - Parallel Promise.all execution
   - Single round trip for all data

### Database Optimization

**Indexes:**
```javascript
// Expense queries
Expense.index({ user: 1, date: 1, category: 1 });

// Budget queries
Budget.index({ user: 1, 'period.end': 1 });
```

**Query Optimization:**
- Date range filters
- Category-specific queries
- Workspace isolation
- Limit to necessary fields

## Testing

### Unit Tests

```javascript
describe('IntelligenceService', () => {
  it('should calculate burn rate', async () => {
    const burnRate = await intelligenceService.calculateBurnRate(userId);
    expect(burnRate.dailyBurnRate).toBeGreaterThanOrEqual(0);
    expect(burnRate.trend).toMatch(/increasing|decreasing|stable/);
  });
  
  it('should predict expenses', async () => {
    const forecast = await intelligenceService.predictExpenses(userId, {
      daysToPredict: 30
    });
    expect(forecast.success).toBe(true);
    expect(forecast.predictions).toHaveLength(30);
  });
  
  it('should detect budget exhaustion', async () => {
    const exhaustion = await intelligenceService.predictBudgetExhaustion(
      userId,
      budgetId
    );
    expect(exhaustion.status).toBeDefined();
    expect(exhaustion.dailyBurnRate).toBeGreaterThanOrEqual(0);
  });
});
```

### Integration Tests

```javascript
describe('Analytics API', () => {
  it('should return burn rate data', async () => {
    const res = await request(app)
      .get('/api/analytics/burn-rate')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dailyBurnRate).toBeDefined();
  });
  
  it('should return complete forecast', async () => {
    const res = await request(app)
      .get('/api/analytics/forecast/complete')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.status).toBe(200);
    expect(res.body.data.burnRate).toBeDefined();
    expect(res.body.data.forecast).toBeDefined();
    expect(res.body.data.insights).toBeDefined();
  });
});
```

## Security Considerations

1. **Authentication**: All endpoints require valid JWT token
2. **Authorization**: Users can only access their own forecast data
3. **Rate Limiting**: Forecast endpoints limited to 100/hour
4. **Data Privacy**: No forecast data shared between users
5. **Input Validation**: All parameters validated and sanitized

## Troubleshooting

### Issue: Insufficient Data for Prediction

**Symptom:** API returns "Insufficient data" error

**Solution:**
- Minimum 7 days of expenses required
- Add more expenses or wait for data accumulation
- Check date range parameters

### Issue: Low Prediction Accuracy

**Symptom:** R² < 0.5, low confidence score

**Causes:**
- Irregular spending patterns
- Too few data points
- High spending volatility

**Solutions:**
- Use weighted moving average for smoother predictions
- Increase analysis period
- Category-specific analysis for better accuracy

### Issue: Forecast Cache Not Working

**Symptom:** Always loading from API, slow offline performance

**Solutions:**
- Check IndexedDB browser support
- Verify `cacheForecasts` preference enabled
- Clear browser data and reinitialize
- Check console for DBManager errors

## Future Enhancements

1. **Advanced ML Models**
   - ARIMA time series forecasting
   - Neural network predictions
   - Seasonal pattern detection

2. **Spending Recommendations**
   - AI-generated saving suggestions
   - Budget reallocation recommendations
   - Optimal spending timing

3. **Multi-Category Forecasting**
   - Cross-category predictions
   - Substitution effect analysis
   - Budget interdependencies

4. **Collaborative Intelligence**
   - Workspace-level forecasts
   - Team spending patterns
   - Shared insights

5. **Mobile Notifications**
   - Push notifications for critical alerts
   - Daily burn rate summaries
   - Weekly forecast reports

6. **Export & Reporting**
   - PDF forecast reports
   - Excel forecast export
   - Shareable forecast links

## API Examples

### Get Burn Rate

```bash
curl -H "Authorization: Bearer TOKEN" \
  "https://api.expenseflow.com/api/analytics/burn-rate?categoryId=123"
```

### Get 30-Day Forecast

```bash
curl -H "Authorization: Bearer TOKEN" \
  "https://api.expenseflow.com/api/analytics/forecast?daysToPredict=30"
```

### Check Budget Exhaustion

```bash
curl -H "Authorization: Bearer TOKEN" \
  "https://api.expenseflow.com/api/analytics/budget/456/exhaustion"
```

### Get Complete Forecast

```bash
curl -H "Authorization: Bearer TOKEN" \
  "https://api.expenseflow.com/api/analytics/forecast/complete"
```

## License

This feature is part of the ExpenseFlow project and follows the same license.

## Contributors

- Predictive Burn Rate Intelligence implementation (#470)
- ML-based expense forecasting
- Early warning alert system
- Offline forecast caching

## Support

For issues or questions, open a GitHub issue with the `burn-rate-intelligence` label.
