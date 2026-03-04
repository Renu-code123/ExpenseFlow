// Analytics Dashboard Feature for ExpenseFlow
var ANALYTICS_API_URL = '/api/analytics';

// State management
let analyticsData = {
  trends: null,
  categoryBreakdown: null,
  insights: null,
  predictions: null,
  velocity: null,
  forecast: null
};

const getAnalyticsLocale = () => (window.i18n?.getLocale?.() && window.i18n.getLocale()) || 'en-US';
const getAnalyticsCurrency = () => (window.i18n?.getCurrency?.() && window.i18n.getCurrency()) || 'INR';

function formatAnalyticsCurrency(value, options = {}) {
  const currency = options.currency || getAnalyticsCurrency();
  if (window.i18n?.formatCurrency) {
    return window.i18n.formatCurrency(value, {
      currency,
      locale: getAnalyticsLocale(),
      minimumFractionDigits: options.minimumFractionDigits ?? 0,
      maximumFractionDigits: options.maximumFractionDigits ?? 0
    });
  }

  const amount = Number(value || 0);
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// ========================
// API Functions
// ========================

async function getAuthHeaders() {
  // Accept either 'token' or legacy 'authToken' key used by auth integration
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * Fetch spending trends
 */
async function fetchSpendingTrends(period = 'monthly', months = 6) {
  try {
    const token = localStorage.getItem('token');
    if (!token) return { data: [] };

    const response = await fetch(
      `${ANALYTICS_API_URL}/spending-trends?period=${period}&months=${months}`,
      { headers: await getAuthHeaders() }
    );
    if (!response.ok) throw new Error('Failed to fetch trends');
    const data = await response.json();
    analyticsData.trends = data.data;
    return data.data;
  } catch (error) {
    console.error('Error fetching spending trends:', error);
    throw error;
  }
}

/**
 * Fetch category breakdown
 */
async function fetchCategoryBreakdown(type = 'expense', startDate = null, endDate = null) {
  try {
    let url = `${ANALYTICS_API_URL}/category-breakdown?type=${type}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;

    const response = await fetch(url, { headers: await getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch category breakdown');
    const data = await response.json();
    analyticsData.categoryBreakdown = data.data;
    return data.data;
  } catch (error) {
    console.error('Error fetching category breakdown:', error);
    throw error;
  }
}

/**
 * Fetch insights
 */
async function fetchInsights() {
  try {
    const response = await fetch(`${ANALYTICS_API_URL}/insights`, {
      headers: await getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch insights');
    const data = await response.json();
    analyticsData.insights = data.data;
    return data.data;
  } catch (error) {
    console.error('Error fetching insights:', error);
    throw error;
  }
}

/**
 * Fetch predictions
 */
async function fetchPredictions() {
  try {
    const response = await fetch(`${ANALYTICS_API_URL}/predictions`, {
      headers: await getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch predictions');
    const data = await response.json();
    analyticsData.predictions = data.data;
    return data.data;
  } catch (error) {
    console.error('Error fetching predictions:', error);
    throw error;
  }
}

/**
 * Fetch spending velocity
 */
async function fetchSpendingVelocity() {
  try {
    const response = await fetch(`${ANALYTICS_API_URL}/velocity`, {
      headers: await getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch velocity');
    const data = await response.json();
    analyticsData.velocity = data.data;
    return data.data;
  } catch (error) {
    console.error('Error fetching velocity:', error);
    throw error;
  }
}

/**
 * Fetch financial forecast
 */
async function fetchForecast() {
  try {
    const response = await fetch(`${ANALYTICS_API_URL}/forecast`, {
      headers: await getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch forecast');
    const data = await response.json();
    analyticsData.forecast = data.data;
    return data.data;
  } catch (error) {
    console.error('Error fetching forecast:', error);
    throw error;
  }
}

/**
 * Fetch month-over-month comparison
 */
async function fetchComparison(months = 3) {
  try {
    const response = await fetch(`${ANALYTICS_API_URL}/comparison?months=${months}`, {
      headers: await getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch comparison');
    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error fetching comparison:', error);
    throw error;
  }
}

/**
 * Fetch complete analytics summary
 */
async function fetchAnalyticsSummary() {
  try {
    const response = await fetch(`${ANALYTICS_API_URL}/summary`, {
      headers: await getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch summary');
    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error fetching summary:', error);
    throw error;
  }
}

// ========================
// UI Rendering Functions
// ========================

/**
 * Render spending velocity widget
 */
function renderVelocityWidget(velocity) {
  const container = document.getElementById('velocity-widget');
  if (!container) return;

  const progressPercent = Math.min(100, (velocity.dayOfMonth / 30) * 100);

  container.innerHTML = `
    <div class="velocity-header">
      <h4><i class="fas fa-tachometer-alt"></i> Spending Velocity</h4>
      <span class="velocity-date">Day ${velocity.dayOfMonth} of month</span>
    </div>
    <div class="velocity-stats">
      <div class="velocity-stat">
        <span class="stat-value">${formatAnalyticsCurrency(velocity.currentSpent)}</span>
        <span class="stat-label">Spent this month</span>
      </div>
      <div class="velocity-stat">
        <span class="stat-value">${formatAnalyticsCurrency(velocity.dailyAverage)}</span>
        <span class="stat-label">Daily average</span>
      </div>
      <div class="velocity-stat projected">
        <span class="stat-value">${formatAnalyticsCurrency(velocity.projectedMonthEnd)}</span>
        <span class="stat-label">Projected month end</span>
      </div>
    </div>
    <div class="velocity-progress">
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progressPercent}%"></div>
      </div>
      <span class="progress-text">${velocity.daysRemaining} days remaining</span>
    </div>
  `;
}

/**
 * Render category breakdown chart
 */
function renderCategoryChart(breakdown) {
    const container = document.getElementById('category-chart');
    if (!container) return;

    if (!breakdown || breakdown.categories.length === 0) {
        container.innerHTML = '<div class="no-data">No expense data available</div>';
        return;
    }

    // Clear previous chart
    container.innerHTML = '';

    const categoryColors = {
        food: '#FF6B6B',
        transport: '#4ECDC4',
        entertainment: '#96CEB4',
        utilities: '#FECA57',
        healthcare: '#FF9FF3',
        shopping: '#45B7D1',
        other: '#A55EEA'
    };

    const categoryIcons = {
        food: '🍽️',
        transport: '🚗',
        entertainment: '🎬',
        utilities: '💡',
        healthcare: '🏥',
        shopping: '🛒',
        other: '📋'
    };

    // Create chart header
    const header = document.createElement('div');
    header.className = 'category-chart-header';
    header.innerHTML = `
      <h4><i class="fas fa-pie-chart"></i> Category Breakdown</h4>
      <span class="total-amount">Total: ₹${breakdown.grandTotal.toLocaleString()}</span>
    `;
    container.appendChild(header);

    // Create canvas for Chart.js
    const canvas = document.createElement('canvas');
    canvas.id = 'category-pie-chart';
    canvas.style.maxWidth = '100%';
    canvas.style.height = '300px';
    container.appendChild(canvas);

    // Prepare data for Chart.js
    const chartData = {
        labels: breakdown.categories.map(cat => `${categoryIcons[cat.category] || '📋'} ${capitalizeFirst(cat.category)}`),
        datasets: [{
            data: breakdown.categories.map(cat => cat.total),
            backgroundColor: breakdown.categories.map(cat => categoryColors[cat.category] || '#999'),
            borderColor: breakdown.categories.map(cat => categoryColors[cat.category] || '#999'),
            borderWidth: 2,
            hoverOffset: 10
        }]
    };

    // Create pie chart
    new Chart(canvas, {
        type: 'pie',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        font: {
                            size: 12,
                            family: 'Inter, sans-serif'
                        },
                        color: '#ffffff'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const percentage = breakdown.categories[context.dataIndex].percentage;
                            return `₹${value.toLocaleString()} (${percentage}%)`;
                        }
                    },
                    backgroundColor: 'rgba(15, 15, 35, 0.9)',
                    titleColor: '#64ffda',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(100, 255, 218, 0.3)',
                    borderWidth: 1
                }
            }
        }
    });
}

/**
 * Render spending trends chart
 */
function renderTrendsChart(trends) {
  const container = document.getElementById('trends-chart');
  if (!container) return;

  if (!trends || trends.data.length === 0) {
    container.innerHTML = '<div class="no-data">Not enough data for trends</div>';
    return;
  }

    // Clear previous chart
    container.innerHTML = '';

    // Create chart header
    const header = document.createElement('div');
    header.className = 'trends-header';
    header.innerHTML = `
      <h4><i class="fas fa-chart-line"></i> Spending Trends</h4>
    `;
    container.appendChild(header);

    // Create canvas for Chart.js
    const canvas = document.createElement('canvas');
    canvas.id = 'trends-line-chart';
    canvas.style.maxWidth = '100%';
    canvas.style.height = '300px';
    container.appendChild(canvas);

    // Prepare data for Chart.js
    const chartData = {
        labels: trends.data.map(item => formatPeriodLabel(item.period)),
        datasets: [
            {
                label: 'Income',
                data: trends.data.map(item => item.income),
                borderColor: '#00e676',
                backgroundColor: 'rgba(0, 230, 118, 0.1)',
                borderWidth: 3,
                fill: false,
                tension: 0.4,
                pointBackgroundColor: '#00e676',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8
            },
            {
                label: 'Expense',
                data: trends.data.map(item => item.expense),
                borderColor: '#ff5722',
                backgroundColor: 'rgba(255, 87, 34, 0.1)',
                borderWidth: 3,
                fill: false,
                tension: 0.4,
                pointBackgroundColor: '#ff5722',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8
            }
        ]
    };

    // Create line chart
    new Chart(canvas, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        font: {
                            size: 12,
                            family: 'Inter, sans-serif'
                        },
                        color: '#ffffff'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ₹${context.raw.toLocaleString()}`;
                        }
                    },
                    backgroundColor: 'rgba(15, 15, 35, 0.9)',
                    titleColor: '#64ffda',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(100, 255, 218, 0.3)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b4b4b4',
                        font: {
                            size: 11
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#b4b4b4',
                        font: {
                            size: 11
                        },
                        callback: function(value) {
                            return '₹' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });

    // Add summary section
    if (trends.summary) {
        const summary = document.createElement('div');
        summary.className = 'trends-summary';
        summary.innerHTML = `
          <div class="summary-item">
            <span class="summary-label">Avg Monthly Expense</span>
            <span class="summary-value expense">₹${trends.summary.avgMonthlyExpense.toLocaleString()}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Savings Rate</span>
            <span class="summary-value ${trends.summary.avgSavingsRate >= 0 ? 'positive' : 'negative'}">${trends.summary.avgSavingsRate}%</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Trend</span>
            <span class="summary-value ${trends.summary.spendingTrend === 'decreasing' ? 'positive' : 'negative'}">
              ${trends.summary.spendingTrend === 'decreasing' ? '↓' : '↑'} ${capitalizeFirst(trends.summary.spendingTrend)}
            </span>
          </div>
        `;
        container.appendChild(summary);
    }
}

/**
 * Render insights cards
 */
function renderInsights(insights) {
  const container = document.getElementById('insights-container');
  if (!container) return;

  if (!insights || insights.insights.length === 0) {
    container.innerHTML = '<div class="no-data">No insights available yet</div>';
    return;
  }

  const insightIcons = {
    savings: 'piggy-bank',
    category: 'tags',
    trend: 'chart-line',
    anomaly: 'exclamation-triangle',
    info: 'info-circle'
  };

  const statusClasses = {
    good: 'success',
    moderate: 'warning',
    warning: 'warning',
    critical: 'danger'
  };

  container.innerHTML = `
    <div class="insights-header">
      <h4><i class="fas fa-lightbulb"></i> Smart Insights</h4>
    </div>
    <div class="insights-list">
      ${insights.insights.map(insight => `
        <div class="insight-card ${statusClasses[insight.status] || ''}">
          <div class="insight-icon">
            <i class="fas fa-${insightIcons[insight.type] || 'info-circle'}"></i>
          </div>
          <div class="insight-content">
            <h5>${insight.title || capitalizeFirst(insight.type)}</h5>
            <p>${insight.message}</p>
            ${insight.suggestion ? `<span class="insight-suggestion">${insight.suggestion}</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Render predictions widget
 */
function renderPredictions(predictions) {
  const container = document.getElementById('predictions-widget');
  if (!container) return;

  if (!predictions || !predictions.nextMonthPrediction) {
    container.innerHTML = '<div class="no-data">Need more data for predictions</div>';
    return;
  }

  const trendIcon = predictions.trend === 'increasing' ? 'arrow-up' :
    predictions.trend === 'decreasing' ? 'arrow-down' : 'minus';
  const trendClass = predictions.trend === 'decreasing' ? 'positive' : 'negative';

  container.innerHTML = `
    <div class="predictions-header">
      <h4><i class="fas fa-crystal-ball"></i> Spending Predictions</h4>
      <span class="confidence-badge">Confidence: ${predictions.confidence}%</span>
    </div>
    <div class="prediction-main">
      <span class="prediction-label">Next Month Forecast</span>
      <span class="prediction-value">${formatAnalyticsCurrency(predictions.nextMonthPrediction)}</span>
      <span class="prediction-trend ${trendClass}">
        <i class="fas fa-${trendIcon}"></i>
        ${capitalizeFirst(predictions.trend)}
      </span>
    </div>
    <div class="prediction-details">
      <div class="detail-item">
        <span class="detail-label">Historical Avg</span>
        <span class="detail-value">${formatAnalyticsCurrency(predictions.historicalAverage)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Moving Avg</span>
        <span class="detail-value">${formatAnalyticsCurrency(predictions.movingAverage)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Based on</span>
        <span class="detail-value">${predictions.basedOnMonths} months</span>
      </div>
    </div>
  `;
}

/**
 * Render forecast widget (Safe-to-Spend)
 */
function renderForecastWidget(forecast) {
  const container = document.getElementById('forecast-widget');
  if (!container) return;

  const sts = forecast.safe_to_spend || forecast.safeToSpend;

  container.innerHTML = `
    <div class="forecast-header">
      <h4><i class="fas fa-shield-alt"></i> Safe-to-Spend</h4>
      <span class="forecast-days">${sts.remainingDays} days left in month</span>
    </div>
    <div class="sts-main">
      <div class="sts-daily">
        <span class="sts-label">Daily Limit</span>
        <span class="sts-value">₹${sts.daily.toLocaleString()}</span>
      </div>
      <div class="sts-total">
        <span class="sts-label">Total Available</span>
        <span class="sts-value">₹${sts.total.toLocaleString()}</span>
      </div>
    </div>
    <div class="sts-commitments">
      <div class="commitment-item shadow-none">
        <span class="comm-label">Recurring Bills</span>
        <span class="comm-value">₹${sts.commitments.recurring.toLocaleString()}</span>
      </div>
      <div class="commitment-item shadow-none">
        <span class="comm-label">Goal Targets</span>
        <span class="comm-value">₹${sts.commitments.goals.toLocaleString()}</span>
      </div>
    </div>
    <div class="anomalies-section" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed rgba(255,255,255,0.1);">
      ${forecast.anomalies && forecast.anomalies.length > 0 ? `
        <div class="anomaly-alert" style="color: #ffca28; display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem;">
          <i class="fas fa-exclamation-triangle"></i>
          <span class="anomaly-text">${forecast.anomalies[0].message}</span>
        </div>
      ` : `
        <div class="anomaly-ok" style="color: #64ffda; display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem;">
          <i class="fas fa-check-circle"></i>
          <span>No spending anomalies detected this week</span>
        </div>
      `}
    </div>
  `;
}

// ========================
// Helper Functions
// ========================

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatPeriodLabel(period) {
  // Format: 2024-01 to Jan
  if (period.includes('-W')) {
    return `W${period.split('-W')[1]}`;
  }
  const parts = period.split('-');
  if (parts.length === 2) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[parseInt(parts[1]) - 1] || period;
  }
  return period;
}

function showAnalyticsNotification(message, type = 'info') {
  if (typeof showNotification === 'function') {
    showNotification(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

// ========================
// Dashboard Loading
// ========================

async function loadAnalyticsDashboard() {
  const dashboardContainer = document.getElementById('analytics-dashboard');
  if (!dashboardContainer) return;

  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    // Show loading state
    dashboardContainer.classList.add('loading');

    // Fetch all analytics data in parallel
    const [velocity, breakdown, trends, insights, predictions, forecast] = await Promise.all([
      fetchSpendingVelocity().catch(() => null),
      fetchCategoryBreakdown().catch(() => null),
      fetchSpendingTrends().catch(() => null),
      fetchInsights().catch(() => null),
      fetchPredictions().catch(() => null),
      fetchForecast().catch(() => null)
    ]);

    // Render all widgets
    if (velocity) renderVelocityWidget(velocity);
    if (breakdown) renderCategoryChart(breakdown);
    if (trends) renderTrendsChart(trends);
    if (insights) renderInsights(insights);
    if (predictions) renderPredictions(predictions);
    if (forecast) renderForecastWidget(forecast);

    dashboardContainer.classList.remove('loading');
  } catch (error) {
    console.error('Error loading analytics dashboard:', error);
    showAnalyticsNotification('Failed to load analytics', 'error');
    dashboardContainer.classList.remove('loading');
  }
}

// ========================
// Initialization
// ========================

function initAnalyticsDashboard() {
  const dashboardContainer = document.getElementById('analytics-dashboard');
  if (!dashboardContainer) return;

  // Refresh button
  const refreshBtn = document.getElementById('refresh-analytics');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadAnalyticsDashboard);
  }

  // Period selector for trends
  const periodSelect = document.getElementById('trends-period');
  if (periodSelect) {
    periodSelect.addEventListener('change', async (e) => {
      const trends = await fetchSpendingTrends(e.target.value);
      renderTrendsChart(trends);
    });
  }

  // Load initial data
  loadAnalyticsDashboard();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAnalyticsDashboard);
} else {
  initAnalyticsDashboard();
}

// ========================
// Health Score & Gamification UI (Issue #421)
// ========================

let gamificationData = {
  healthScore: null,
  profile: null,
  badges: null,
  leaderboard: null
};

/**
 * Fetch complete health score data
 */
async function fetchHealthScore() {
  try {
    const response = await fetch(`${ANALYTICS_API_URL}/gamification/health-score`, {
      headers: await getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch health score');
    const data = await response.json();
    gamificationData.healthScore = data.data;
    return data.data;
  } catch (error) {
    console.error('Error fetching health score:', error);
    throw error;
  }
}

/**
 * Fetch gamification profile
 */
async function fetchGamificationProfile() {
  try {
    const response = await fetch(`${ANALYTICS_API_URL}/gamification/profile`, {
      headers: await getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch profile');
    const data = await response.json();
    gamificationData.profile = data.data;
    return data.data;
  } catch (error) {
    console.error('Error fetching gamification profile:', error);
    throw error;
  }
}

/**
 * Fetch all badges
 */
async function fetchBadges() {
  try {
    const response = await fetch(`${ANALYTICS_API_URL}/gamification/badges`, {
      headers: await getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch badges');
    const data = await response.json();
    gamificationData.badges = data.data;
    return data.data;
  } catch (error) {
    console.error('Error fetching badges:', error);
    throw error;
  }
}

/**
 * Fetch leaderboard
 */
async function fetchLeaderboard(type = 'health') {
  try {
    const response = await fetch(`${ANALYTICS_API_URL}/gamification/leaderboard?type=${type}&limit=10`, {
      headers: await getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch leaderboard');
    const data = await response.json();
    gamificationData.leaderboard = data.data;
    return data.data;
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    throw error;
  }
}

/**
 * Update financial profile
 */
async function updateFinancialProfile(profileData) {
  try {
    const response = await fetch(`${ANALYTICS_API_URL}/gamification/financial-profile`, {
      method: 'PUT',
      headers: await getAuthHeaders(),
      body: JSON.stringify(profileData)
    });
    if (!response.ok) throw new Error('Failed to update profile');
    const data = await response.json();
    showAnalyticsNotification('Financial profile updated!', 'success');
    return data.data;
  } catch (error) {
    console.error('Error updating financial profile:', error);
    showAnalyticsNotification('Failed to update profile', 'error');
    throw error;
  }
}

/**
 * Render Health Score Dashboard
 */
function renderHealthScoreDashboard(healthData) {
  const container = document.getElementById('health-score-dashboard');
  if (!container) return;

  const { score, grade, components, communityComparison, insights } = healthData;
  
  // Get score color based on grade
  const scoreColors = {
    'A+': '#00e676', 'A': '#00c853', 'B+': '#4caf50', 'B': '#8bc34a',
    'C+': '#ffc107', 'C': '#ff9800', 'D': '#ff5722', 'F': '#f44336'
  };
  const scoreColor = scoreColors[grade] || '#ffc107';

  container.innerHTML = `
    <div class="health-score-main">
      <!-- Big Score Circle -->
      <div class="score-circle-container">
        <div class="score-circle" style="--score-color: ${scoreColor}; --score-progress: ${score}%">
          <svg class="score-ring" viewBox="0 0 120 120">
            <circle class="score-ring-bg" cx="60" cy="60" r="54"/>
            <circle class="score-ring-progress" cx="60" cy="60" r="54" 
                    stroke-dasharray="${score * 3.39} 339" 
                    style="stroke: ${scoreColor}"/>
          </svg>
          <div class="score-value">
            <span class="score-number">${score}</span>
            <span class="score-grade">${grade}</span>
          </div>
        </div>
        <h3 class="score-title">Financial Health Score</h3>
        <p class="score-subtitle">
          <i class="fas fa-users"></i> 
          ${communityComparison.rank} of users
        </p>
      </div>

      <!-- Component Breakdown -->
      <div class="score-components">
        <h4><i class="fas fa-chart-bar"></i> Score Breakdown</h4>
        ${renderScoreComponent('Savings Rate', components.savingsRate, '💰', 20)}
        ${renderScoreComponent('Budget Discipline', components.budgetDiscipline, '📊', 25)}
        ${renderScoreComponent('Debt-to-Income', components.debtToIncome, '💳', 20)}
        ${renderScoreComponent('Emergency Fund', components.emergencyFund, '🛡️', 15)}
        ${renderScoreComponent('Investment', components.investmentConsistency, '📈', 20)}
      </div>
    </div>

    <!-- Community Comparison -->
    <div class="community-comparison">
      <h4><i class="fas fa-trophy"></i> Community Comparison</h4>
      <div class="comparison-cards">
        ${communityComparison.comparisons.map(comp => `
          <div class="comparison-card ${comp.positive ? 'positive' : 'negative'}">
            <span class="comparison-component">${comp.component}</span>
            <span class="comparison-message">${comp.message}</span>
          </div>
        `).join('')}
        ${communityComparison.comparisons.length === 0 ? `
          <div class="comparison-card neutral">
            <span>Keep improving to beat the average!</span>
          </div>
        ` : ''}
      </div>
    </div>

    <!-- Insights -->
    <div class="health-insights">
      <h4><i class="fas fa-lightbulb"></i> Personalized Insights</h4>
      
      ${insights.strengths.length > 0 ? `
        <div class="insights-section strengths">
          <h5>💪 Your Strengths</h5>
          ${insights.strengths.map(s => `
            <div class="insight-item strength">
              <span class="insight-icon">${s.icon}</span>
              <span class="insight-text">${s.message}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${insights.improvements.length > 0 ? `
        <div class="insights-section improvements">
          <h5>📈 Areas to Improve</h5>
          ${insights.improvements.map(i => `
            <div class="insight-item improvement priority-${i.priority}">
              <span class="insight-icon">${i.icon}</span>
              <div class="insight-content">
                <span class="insight-text">${i.message}</span>
                <span class="priority-badge ${i.priority}">${i.priority}</span>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>

    <!-- History Chart -->
    <div class="health-history">
      <h4><i class="fas fa-chart-line"></i> Score History</h4>
      <canvas id="health-history-chart"></canvas>
    </div>
  `;

  // Render history chart if data exists
  if (healthData.history && healthData.history.length > 0) {
    renderHealthHistoryChart(healthData.history);
  }
}

/**
 * Render individual score component bar
 */
function renderScoreComponent(name, data, icon, weight) {
  const score = data.score;
  const barColor = score >= 70 ? '#00e676' : score >= 50 ? '#ffc107' : '#ff5722';
  
  return `
    <div class="component-item">
      <div class="component-header">
        <span class="component-icon">${icon}</span>
        <span class="component-name">${name}</span>
        <span class="component-weight">${weight}%</span>
      </div>
      <div class="component-bar">
        <div class="component-progress" style="width: ${score}%; background: ${barColor}"></div>
      </div>
      <div class="component-footer">
        <span class="component-score">${score}/100</span>
        <span class="component-status">${data.details?.status || ''}</span>
      </div>
    </div>
  `;
}

/**
 * Render health history chart
 */
function renderHealthHistoryChart(history) {
  const canvas = document.getElementById('health-history-chart');
  if (!canvas || !history.length) return;

  const labels = history.map(h => {
    const d = new Date(h.date);
    return `${d.toLocaleString('default', { month: 'short' })}`;
  });

  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Health Score',
        data: history.map(h => h.score),
        borderColor: '#64ffda',
        backgroundColor: 'rgba(100, 255, 218, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#64ffda',
        pointBorderColor: '#fff',
        pointRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(255,255,255,0.1)' },
          ticks: { color: '#b4b4b4' }
        },
        x: {
          grid: { color: 'rgba(255,255,255,0.1)' },
          ticks: { color: '#b4b4b4' }
        }
      }
    }
  });
}

/**
 * Render Gamification Profile (Level, XP, Badges)
 */
function renderGamificationProfile(profile) {
  const container = document.getElementById('gamification-profile');
  if (!container) return;

  const xpProgress = profile.xpToNextLevel > 0 
    ? (profile.currentLevelXp / profile.xpToNextLevel) * 100 
    : 0;

  container.innerHTML = `
    <div class="profile-header">
      <div class="level-display">
        <div class="level-badge">
          <span class="level-number">Lv.${profile.level}</span>
        </div>
        <div class="level-info">
          <h3 class="level-name">${profile.levelName}</h3>
          <div class="xp-bar">
            <div class="xp-progress" style="width: ${xpProgress}%"></div>
          </div>
          <span class="xp-text">${profile.currentLevelXp} / ${profile.xpToNextLevel} XP</span>
        </div>
      </div>
      <div class="profile-stats">
        <div class="stat-item">
          <span class="stat-value">${profile.totalPoints.toLocaleString()}</span>
          <span class="stat-label">Total XP</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${profile.streakDays}</span>
          <span class="stat-label">Day Streak 🔥</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${profile.badgeCount}</span>
          <span class="stat-label">Badges</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Badges Grid
 */
function renderBadgesGrid(badges) {
  const container = document.getElementById('badges-grid');
  if (!container) return;

  // Separate earned and unearned
  const earned = badges.filter(b => b.earned);
  const unearned = badges.filter(b => !b.earned);

  const tierColors = {
    bronze: '#CD7F32',
    silver: '#C0C0C0',
    gold: '#FFD700',
    platinum: '#E5E4E2',
    diamond: '#B9F2FF'
  };

  container.innerHTML = `
    <div class="badges-section earned-badges">
      <h4><i class="fas fa-medal"></i> Earned Badges (${earned.length})</h4>
      <div class="badges-list">
        ${earned.map(badge => `
          <div class="badge-card earned" style="border-color: ${tierColors[badge.tier]}">
            <span class="badge-icon">${badge.icon}</span>
            <span class="badge-name">${badge.name}</span>
            <span class="badge-tier" style="color: ${tierColors[badge.tier]}">${badge.tier}</span>
            <small class="badge-date">${new Date(badge.earnedAt).toLocaleDateString()}</small>
          </div>
        `).join('')}
        ${earned.length === 0 ? '<p class="no-badges">Complete challenges to earn badges!</p>' : ''}
      </div>
    </div>

    <div class="badges-section locked-badges">
      <h4><i class="fas fa-lock"></i> Locked Badges (${unearned.length})</h4>
      <div class="badges-list">
        ${unearned.map(badge => `
          <div class="badge-card locked">
            <span class="badge-icon locked-icon">🔒</span>
            <span class="badge-name">${badge.name}</span>
            <span class="badge-tier">${badge.tier}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Render Leaderboard
 */
function renderLeaderboard(leaderboard) {
  const container = document.getElementById('leaderboard');
  if (!container) return;

  container.innerHTML = `
    <div class="leaderboard-header">
      <h4><i class="fas fa-trophy"></i> Community Leaderboard</h4>
      <div class="leaderboard-tabs">
        <button class="lb-tab active" onclick="switchLeaderboard('health')">Health Score</button>
        <button class="lb-tab" onclick="switchLeaderboard('points')">Total XP</button>
      </div>
    </div>
    <div class="leaderboard-list">
      ${leaderboard.map((user, idx) => `
        <div class="lb-item ${idx < 3 ? 'top-' + (idx + 1) : ''}">
          <span class="lb-rank">${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '#' + (idx + 1)}</span>
          <span class="lb-name">${user.name}</span>
          <span class="lb-score">${user.healthScore}</span>
          <span class="lb-grade">${user.healthGrade}</span>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Switch leaderboard type
 */
async function switchLeaderboard(type) {
  const tabs = document.querySelectorAll('.lb-tab');
  tabs.forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');

  const leaderboard = await fetchLeaderboard(type);
  renderLeaderboard(leaderboard);
}

/**
 * Render Financial Profile Form
 */
function renderFinancialProfileForm(currentProfile = {}) {
  const container = document.getElementById('financial-profile-form');
  if (!container) return;

  container.innerHTML = `
    <h4><i class="fas fa-user-cog"></i> Your Financial Profile</h4>
    <p class="form-subtitle">Update these values for accurate health score calculation</p>
    <form id="profile-update-form" class="profile-form">
      <div class="form-row">
        <div class="form-group">
          <label>Monthly Income</label>
          <input type="number" name="monthlyIncome" value="${currentProfile.monthlyIncome || ''}" placeholder="e.g., 50000">
        </div>
        <div class="form-group">
          <label>Monthly Debt Payments</label>
          <input type="number" name="monthlyDebtPayment" value="${currentProfile.monthlyDebtPayment || ''}" placeholder="e.g., 5000">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Emergency Fund (Current)</label>
          <input type="number" name="emergencyFundCurrent" value="${currentProfile.emergencyFundCurrent || ''}" placeholder="e.g., 100000">
        </div>
        <div class="form-group">
          <label>Emergency Fund (Target)</label>
          <input type="number" name="emergencyFundTarget" value="${currentProfile.emergencyFundTarget || ''}" placeholder="e.g., 300000">
        </div>
      </div>
      <button type="submit" class="btn-update-profile">
        <i class="fas fa-save"></i> Save Profile
      </button>
    </form>
  `;

  // Handle form submission
  container.querySelector('#profile-update-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {};
    for (const [key, value] of formData.entries()) {
      if (value) data[key] = parseFloat(value);
    }
    await updateFinancialProfile(data);
    await loadHealthDashboard(); // Refresh scores
  });
}

/**
 * Load complete Health & Achievements dashboard
 */
async function loadHealthDashboard() {
  const container = document.getElementById('health-achievements-section');
  if (!container) return;

  const token = localStorage.getItem('authToken');
  if (!token) return;

  try {
    container.classList.add('loading');

    // Fetch all gamification data in parallel
    const [healthScore, profile, badges, leaderboard] = await Promise.all([
      fetchHealthScore().catch(() => null),
      fetchGamificationProfile().catch(() => null),
      fetchBadges().catch(() => null),
      fetchLeaderboard().catch(() => null)
    ]);

    // Render all components
    if (healthScore) renderHealthScoreDashboard(healthScore);
    if (profile) renderGamificationProfile(profile);
    if (badges) renderBadgesGrid(badges);
    if (leaderboard) renderLeaderboard(leaderboard);
    
    // Render financial profile form with current values
    renderFinancialProfileForm(healthScore?.components?.debtToIncome?.details || {});

    container.classList.remove('loading');
  } catch (error) {
    console.error('Error loading health dashboard:', error);
    showAnalyticsNotification('Failed to load health dashboard', 'error');
    container.classList.remove('loading');
  }
}

/**
 * Generate social share preview
 */
function generateSharePreview(healthData, profile) {
  return {
    title: `My Financial Health Score: ${healthData.score} (${healthData.grade})`,
    description: `I'm Level ${profile.level} (${profile.levelName}) with ${profile.badgeCount} badges! Check your financial health on ExpenseFlow.`,
    image: null, // Could generate a canvas image
    url: window.location.origin
  };
}

/**
 * Share health score
 */
async function shareHealthScore() {
  if (!gamificationData.healthScore || !gamificationData.profile) {
    showAnalyticsNotification('Calculate your health score first!', 'warning');
    return;
  }

  const shareData = generateSharePreview(gamificationData.healthScore, gamificationData.profile);

  if (navigator.share) {
    try {
      await navigator.share({
        title: shareData.title,
        text: shareData.description,
        url: shareData.url
      });
    } catch (err) {
      console.log('Share cancelled');
    }
  } else {
    // Fallback: copy to clipboard
    const text = `${shareData.title}\n${shareData.description}\n${shareData.url}`;
    navigator.clipboard.writeText(text);
    showAnalyticsNotification('Copied to clipboard!', 'success');
  }
}

/**
 * Initialize Health & Achievements tab
 */
function initHealthAchievements() {
  const healthTab = document.getElementById('health-tab');
  if (healthTab) {
    healthTab.addEventListener('click', (e) => {
      e.preventDefault();
      showHealthSection();
      loadHealthDashboard();
    });
  }

  // Share button
  const shareBtn = document.getElementById('share-health-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', shareHealthScore);
  }

  // Refresh button
  const refreshBtn = document.getElementById('refresh-health-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadHealthDashboard);
  }
}

/**
 * Show health section and hide others
 */
function showHealthSection() {
  // Hide all main sections
  const sections = ['dashboard', 'analytics', 'goals', 'settings', 'health'];
  sections.forEach(id => {
    const section = document.getElementById(id);
    if (section) {
      section.style.display = id === 'health' ? 'block' : 'none';
    }
  });

  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === '#health') {
      link.classList.add('active');
    }
  });
}

// Initialize health achievements when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHealthAchievements);
} else {
  initHealthAchievements();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fetchSpendingTrends,
    fetchCategoryBreakdown,
    fetchInsights,
    fetchPredictions,
    fetchSpendingVelocity,
    fetchComparison,
    fetchAnalyticsSummary,
    loadAnalyticsDashboard,
    // Gamification exports
    fetchHealthScore,
    fetchGamificationProfile,
    fetchBadges,
    fetchLeaderboard,
    loadHealthDashboard,
    shareHealthScore
  };
}
