/**
 * AI-Driven Budget Intelligence Dashboard
 * Z-Score Anomaly Detection & Self-Healing Budgeting
 * Issue #339
 * 
 * Subscription Detection & Cashflow Runway - Issue #444
 */

class IntelligenceDashboard {
  constructor() {
    this.dashboardData = null;
    this.anomalies = [];
    this.volatilityData = [];
    this.reallocations = [];
    this.charts = {};
    this.refreshInterval = null;
    this.API_BASE = '/api/analytics';
    
    // Issue #444: Subscription detection state
    this.detectedSubscriptions = [];
    this.runwayData = null;
    this.burnRateData = null;
    
    // Issue #470: Predictive burn rate intelligence
    this.forecastData = null;
    this.categoryPatterns = null;
    this.insights = null;
    this.forecastChart = null;
  }

  async init() {
    this.bindEvents();
    await this.loadDashboard();
    await this.loadSubscriptionData(); // Issue #444
    await this.loadForecastData(); // Issue #470
    this.startAutoRefresh();
  }

  bindEvents() {
    // Tab navigation
    document.querySelectorAll('.intelligence-tab').forEach(tab => {
      tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // Refresh button
    const refreshBtn = document.getElementById('refresh-intelligence');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refreshIntelligence());
    }

    // Apply reallocation buttons
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('apply-reallocation-btn')) {
        const { from, to, amount } = e.target.dataset;
        this.applyReallocation(from, to, parseFloat(amount));
      }
      if (e.target.classList.contains('reject-reallocation-btn')) {
        const { budgetId, toCategory } = e.target.dataset;
        this.rejectReallocation(budgetId, toCategory);
      }
      // Issue #444: Subscription confirmation buttons
      if (e.target.classList.contains('confirm-subscription-btn')) {
        const { merchantKey } = e.target.dataset;
        this.confirmSubscription(merchantKey);
      }
      if (e.target.classList.contains('dismiss-subscription-btn')) {
        const { merchantKey } = e.target.dataset;
        this.dismissSubscription(merchantKey);
      }
      if (e.target.classList.contains('confirm-all-subscriptions-btn')) {
        this.confirmAllSubscriptions();
      }
    });

    // Analyze transaction form
    const analyzeForm = document.getElementById('analyze-transaction-form');
    if (analyzeForm) {
      analyzeForm.addEventListener('submit', (e) => this.handleAnalyzeTransaction(e));
    }

    // Issue #444: Scan for subscriptions button
    const scanBtn = document.getElementById('scan-subscriptions-btn');
    if (scanBtn) {
      scanBtn.addEventListener('click', () => this.scanForSubscriptions());
    }
  }

  // ========================
  // Issue #444: Subscription Detection & Runway Methods
  // ========================

  async loadSubscriptionData() {
    try {
      const [runway, burnRate, upcoming] = await Promise.all([
        this.fetchAPI('/runway/summary'),
        this.fetchAPI('/subscriptions/burn-rate'),
        this.fetchAPI('/subscriptions/upcoming')
      ]);

      this.runwayData = runway.data;
      this.burnRateData = burnRate.data;
      this.upcomingCharges = upcoming.data;

      this.renderRunwayWidget();
      this.renderBurnRateWidget();
      this.renderUpcomingCharges();
    } catch (error) {
      console.error('Failed to load subscription data:', error);
    }
  }

  async scanForSubscriptions() {
    try {
      this.showLoading();
      const discoveries = await this.fetchAPI('/subscriptions/discover');
      this.detectedSubscriptions = discoveries.data.detected || [];
      
      this.renderDetectedSubscriptions();
      this.showNotification(
        `Found ${this.detectedSubscriptions.length} potential subscriptions`,
        this.detectedSubscriptions.length > 0 ? 'success' : 'info'
      );
    } catch (error) {
      console.error('Failed to scan for subscriptions:', error);
      this.showError('Failed to scan for subscriptions');
    } finally {
      this.hideLoading();
    }
  }

  async confirmSubscription(merchantKey) {
    try {
      await this.fetchAPI('/subscriptions/confirm', {
        method: 'POST',
        body: JSON.stringify({ merchantKey })
      });

      // Remove from detected list
      this.detectedSubscriptions = this.detectedSubscriptions.filter(
        s => s.merchantKey !== merchantKey
      );
      
      this.renderDetectedSubscriptions();
      await this.loadSubscriptionData(); // Refresh burn rate
      this.showNotification('Subscription confirmed and tracked', 'success');
    } catch (error) {
      console.error('Failed to confirm subscription:', error);
      this.showError('Failed to confirm subscription');
    }
  }

  dismissSubscription(merchantKey) {
    // Just remove from local list (doesn't persist)
    this.detectedSubscriptions = this.detectedSubscriptions.filter(
      s => s.merchantKey !== merchantKey
    );
    this.renderDetectedSubscriptions();
    this.showNotification('Subscription dismissed', 'info');
  }

  async confirmAllSubscriptions() {
    if (this.detectedSubscriptions.length === 0) return;

    try {
      const merchantKeys = this.detectedSubscriptions.map(s => s.merchantKey);
      
      await this.fetchAPI('/subscriptions/confirm-multiple', {
        method: 'POST',
        body: JSON.stringify({ merchantKeys })
      });

      this.detectedSubscriptions = [];
      this.renderDetectedSubscriptions();
      await this.loadSubscriptionData();
      this.showNotification('All subscriptions confirmed', 'success');
    } catch (error) {
      console.error('Failed to confirm all subscriptions:', error);
      this.showError('Failed to confirm subscriptions');
    }
  }

  renderRunwayWidget() {
    const container = document.getElementById('runway-widget');
    if (!container || !this.runwayData) return;

    const { days, status, message, progressPercent, burnRate, currentBalance, isPositiveCashFlow } = this.runwayData;
    
    const statusColors = {
      positive: '#22c55e',
      comfortable: '#22c55e',
      moderate: '#eab308',
      warning: '#f59e0b',
      critical: '#ef4444',
      depleted: '#dc2626'
    };

    const statusIcons = {
      positive: 'fa-rocket',
      comfortable: 'fa-smile',
      moderate: 'fa-meh',
      warning: 'fa-exclamation-triangle',
      critical: 'fa-exclamation-circle',
      depleted: 'fa-times-circle'
    };

    const displayDays = isPositiveCashFlow ? '∞' : (days || 0);

    container.innerHTML = `
      <div class="runway-card ${status}">
        <div class="runway-header">
          <div class="runway-icon" style="background: ${statusColors[status]}20; color: ${statusColors[status]}">
            <i class="fas ${statusIcons[status]}"></i>
          </div>
          <div class="runway-title">
            <h3>Financial Runway</h3>
            <span class="runway-status-badge ${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
          </div>
        </div>
        
        <div class="runway-main">
          <div class="runway-days">
            <span class="days-number">${displayDays}</span>
            <span class="days-label">${isPositiveCashFlow ? 'Positive Cash Flow' : 'Days'}</span>
          </div>
          
          <div class="runway-progress-container">
            <div class="runway-progress-bar">
              <div class="runway-progress-fill" 
                   style="width: ${progressPercent}%; background: ${statusColors[status]}">
              </div>
            </div>
            <div class="runway-progress-labels">
              <span>0</span>
              <span>30</span>
              <span>60+</span>
            </div>
          </div>
        </div>
        
        <div class="runway-stats">
          <div class="runway-stat">
            <span class="stat-label">Current Balance</span>
            <span class="stat-value">${this.formatCurrency(currentBalance)}</span>
          </div>
          <div class="runway-stat">
            <span class="stat-label">Daily Burn Rate</span>
            <span class="stat-value ${burnRate > 0 ? 'negative' : 'positive'}">
              ${burnRate > 0 ? '-' : '+'}${this.formatCurrency(Math.abs(burnRate))}
            </span>
          </div>
        </div>
        
        <div class="runway-message">
          <i class="fas fa-info-circle"></i>
          <span>${message}</span>
        </div>
      </div>
    `;
  }

  renderBurnRateWidget() {
    const container = document.getElementById('burn-rate-widget');
    if (!container || !this.burnRateData) return;

    const { monthlyBurnRate, weeklyBurnRate, dailyBurnRate, annualProjection, totalSubscriptions, breakdown } = this.burnRateData;

    container.innerHTML = `
      <div class="burn-rate-card">
        <div class="burn-rate-header">
          <h3><i class="fas fa-fire"></i> Subscription Burn Rate</h3>
          <span class="subscription-count">${totalSubscriptions} active subscriptions</span>
        </div>
        
        <div class="burn-rate-totals">
          <div class="burn-total">
            <span class="burn-amount">${this.formatCurrency(dailyBurnRate)}</span>
            <span class="burn-period">/ day</span>
          </div>
          <div class="burn-total">
            <span class="burn-amount">${this.formatCurrency(weeklyBurnRate)}</span>
            <span class="burn-period">/ week</span>
          </div>
          <div class="burn-total primary">
            <span class="burn-amount">${this.formatCurrency(monthlyBurnRate)}</span>
            <span class="burn-period">/ month</span>
          </div>
          <div class="burn-total">
            <span class="burn-amount">${this.formatCurrency(annualProjection)}</span>
            <span class="burn-period">/ year</span>
          </div>
        </div>
        
        ${breakdown && breakdown.length > 0 ? `
          <div class="burn-breakdown">
            <h4>Top Subscriptions</h4>
            <div class="breakdown-list">
              ${breakdown.slice(0, 5).map(item => `
                <div class="breakdown-item">
                  <div class="breakdown-info">
                    <span class="breakdown-name">${item.description}</span>
                    <span class="breakdown-freq">${item.frequency}</span>
                  </div>
                  <div class="breakdown-amount">
                    ${this.formatCurrency(item.monthlyEquivalent)}/mo
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderUpcomingCharges() {
    const container = document.getElementById('upcoming-charges-widget');
    if (!container || !this.upcomingCharges) return;

    const { charges, totalAmount, count, period } = this.upcomingCharges;

    container.innerHTML = `
      <div class="upcoming-charges-card">
        <div class="upcoming-header">
          <h3><i class="fas fa-calendar-alt"></i> Upcoming Charges</h3>
          <span class="upcoming-period">${period}</span>
        </div>
        
        <div class="upcoming-total">
          <span class="total-label">Total Expected</span>
          <span class="total-amount">${this.formatCurrency(totalAmount)}</span>
          <span class="total-count">${count} charges</span>
        </div>
        
        ${charges && charges.length > 0 ? `
          <div class="upcoming-list">
            ${charges.slice(0, 6).map(charge => `
              <div class="upcoming-item ${charge.daysUntilDue <= 3 ? 'due-soon' : ''}">
                <div class="upcoming-info">
                  <span class="upcoming-name">${charge.description}</span>
                  <span class="upcoming-date">
                    ${charge.daysUntilDue === 0 ? 'Today' : 
                      charge.daysUntilDue === 1 ? 'Tomorrow' : 
                      `In ${charge.daysUntilDue} days`}
                  </span>
                </div>
                <span class="upcoming-amount">${this.formatCurrency(charge.amount)}</span>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="empty-state small">
            <i class="fas fa-check-circle"></i>
            <p>No upcoming charges</p>
          </div>
        `}
      </div>
    `;
  }

  renderDetectedSubscriptions() {
    const container = document.getElementById('detected-subscriptions');
    if (!container) return;

    if (this.detectedSubscriptions.length === 0) {
      container.innerHTML = `
        <div class="detected-subs-card">
          <div class="detected-header">
            <h3><i class="fas fa-search-dollar"></i> Detected Subscriptions</h3>
            <button class="btn btn-outline scan-subscriptions-btn" id="scan-subscriptions-btn">
              <i class="fas fa-sync"></i> Scan
            </button>
          </div>
          <div class="empty-state">
            <i class="fas fa-check-circle"></i>
            <p>No new subscriptions detected</p>
            <small>Click "Scan" to search for recurring patterns in your transactions</small>
          </div>
        </div>
      `;
      // Re-bind the scan button
      document.getElementById('scan-subscriptions-btn')?.addEventListener('click', () => this.scanForSubscriptions());
      return;
    }

    container.innerHTML = `
      <div class="detected-subs-card">
        <div class="detected-header">
          <h3><i class="fas fa-search-dollar"></i> Detected Subscriptions</h3>
          <div class="detected-actions">
            <button class="btn btn-outline scan-subscriptions-btn" id="scan-subscriptions-btn">
              <i class="fas fa-sync"></i> Scan
            </button>
            <button class="btn btn-primary confirm-all-subscriptions-btn">
              <i class="fas fa-check-double"></i> Confirm All
            </button>
          </div>
        </div>
        
        <div class="detected-list">
          ${this.detectedSubscriptions.map(sub => `
            <div class="detected-item">
              <div class="detected-main">
                <div class="detected-icon ${sub.isLikelySubscription ? 'subscription' : ''}">
                  <i class="fas ${sub.isLikelySubscription ? 'fa-credit-card' : 'fa-redo'}"></i>
                </div>
                <div class="detected-info">
                  <span class="detected-name">${sub.merchantName}</span>
                  <div class="detected-meta">
                    <span class="detected-amount">${this.formatCurrency(sub.averageAmount)}</span>
                    <span class="detected-freq">${sub.frequency}</span>
                    <span class="detected-occurrences">${sub.occurrences} occurrences</span>
                  </div>
                </div>
                <div class="detected-confidence">
                  <div class="confidence-bar">
                    <div class="confidence-fill" style="width: ${sub.confidence * 100}%"></div>
                  </div>
                  <span class="confidence-label">${Math.round(sub.confidence * 100)}% match</span>
                </div>
              </div>
              <div class="detected-actions-row">
                <button class="btn btn-sm btn-success confirm-subscription-btn" 
                        data-merchant-key="${sub.merchantKey}">
                  <i class="fas fa-check"></i> Confirm
                </button>
                <button class="btn btn-sm btn-outline dismiss-subscription-btn"
                        data-merchant-key="${sub.merchantKey}">
                  <i class="fas fa-times"></i> Dismiss
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Re-bind the scan button
    document.getElementById('scan-subscriptions-btn')?.addEventListener('click', () => this.scanForSubscriptions());
  }

  // ========================
  // Original Dashboard Methods
  // ========================

  async loadDashboard() {
    try {
      this.showLoading();
      
      const [dashboard, anomalies, volatility, reallocations, alerts] = await Promise.all([
        this.fetchAPI('/intelligence/dashboard'),
        this.fetchAPI('/intelligence/anomalies'),
        this.fetchAPI('/intelligence/volatility'),
        this.fetchAPI('/intelligence/reallocations'),
        this.fetchAPI('/intelligence/alerts')
      ]);

      this.dashboardData = dashboard.data;
      this.anomalies = anomalies.data;
      this.volatilityData = volatility.data;
      this.reallocations = reallocations.data;
      this.alertsData = alerts.data;

      this.renderDashboard();
      this.hideLoading();
    } catch (error) {
      console.error('Failed to load intelligence dashboard:', error);
      this.showError('Failed to load intelligence data');
      this.hideLoading();
    }
  }

  async fetchAPI(endpoint, options = {}) {
    const response = await fetch(`${this.API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  }

  renderDashboard() {
    this.renderSummaryCards();
    this.renderAnomalyTimeline();
    this.renderVolatilityChart();
    this.renderReallocationSuggestions();
    this.renderAlerts();
    this.renderBudgetIntelligence();
  }

  renderSummaryCards() {
    const container = document.getElementById('intelligence-summary');
    if (!container) return;

    const { summary } = this.dashboardData;
    
    container.innerHTML = `
      <div class="intelligence-cards">
        <div class="intel-card">
          <div class="intel-card-icon anomaly">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <div class="intel-card-content">
            <span class="intel-card-value">${summary?.totalAnomalies || 0}</span>
            <span class="intel-card-label">Anomalies Detected</span>
          </div>
        </div>
        
        <div class="intel-card">
          <div class="intel-card-icon volatility ${this.getVolatilityColorClass(summary?.averageVolatility)}">
            <i class="fas fa-chart-line"></i>
          </div>
          <div class="intel-card-content">
            <span class="intel-card-value">${(summary?.averageVolatility || 0).toFixed(1)}%</span>
            <span class="intel-card-label">Avg Volatility</span>
          </div>
        </div>
        
        <div class="intel-card">
          <div class="intel-card-icon reallocation">
            <i class="fas fa-exchange-alt"></i>
          </div>
          <div class="intel-card-content">
            <span class="intel-card-value">${summary?.pendingReallocations || 0}</span>
            <span class="intel-card-label">Pending Reallocations</span>
          </div>
        </div>
        
        <div class="intel-card">
          <div class="intel-card-icon health ${this.getHealthColorClass(summary?.healthScore)}">
            <i class="fas fa-heartbeat"></i>
          </div>
          <div class="intel-card-content">
            <span class="intel-card-value">${(summary?.healthScore || 0).toFixed(0)}</span>
            <span class="intel-card-label">Budget Health Score</span>
          </div>
        </div>
      </div>
    `;
  }

  renderAnomalyTimeline() {
    const container = document.getElementById('anomaly-timeline');
    if (!container) return;

    const { anomalies } = this.anomalies;
    
    if (!anomalies || anomalies.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-check-circle"></i>
          <p>No anomalies detected in your spending patterns</p>
        </div>
      `;
      return;
    }

    const sortedAnomalies = [...anomalies].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    ).slice(0, 10);

    container.innerHTML = `
      <div class="anomaly-list">
        ${sortedAnomalies.map(anomaly => `
          <div class="anomaly-item ${this.getSeverityClass(anomaly.zScore)}">
            <div class="anomaly-indicator"></div>
            <div class="anomaly-content">
              <div class="anomaly-header">
                <span class="anomaly-category">${anomaly.category}</span>
                <span class="anomaly-zscore">Z-Score: ${anomaly.zScore.toFixed(2)}</span>
              </div>
              <div class="anomaly-details">
                <span class="anomaly-amount">${this.formatCurrency(anomaly.amount)}</span>
                <span class="anomaly-deviation">
                  ${anomaly.deviationPercent > 0 ? '+' : ''}${anomaly.deviationPercent.toFixed(0)}% from average
                </span>
              </div>
              <div class="anomaly-meta">
                <span class="anomaly-date">${this.formatDate(anomaly.date)}</span>
                <span class="anomaly-description">${anomaly.description || 'Transaction'}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderVolatilityChart() {
    const container = document.getElementById('volatility-chart');
    if (!container) return;

    const { categories } = this.volatilityData;
    
    if (!categories || categories.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-chart-bar"></i>
          <p>Not enough data to calculate volatility</p>
        </div>
      `;
      return;
    }

    // Sort by volatility descending
    const sortedCategories = [...categories].sort((a, b) => b.volatilityIndex - a.volatilityIndex);

    container.innerHTML = `
      <div class="volatility-bars">
        ${sortedCategories.map(cat => `
          <div class="volatility-bar-item">
            <div class="volatility-bar-label">
              <span class="category-name">${cat.category}</span>
              <span class="risk-badge ${cat.riskLevel}">${cat.riskLevel}</span>
            </div>
            <div class="volatility-bar-container">
              <div class="volatility-bar" 
                   style="width: ${Math.min(cat.volatilityIndex, 100)}%; 
                          background: ${this.getVolatilityColor(cat.volatilityIndex)}">
              </div>
              <span class="volatility-value">${cat.volatilityIndex.toFixed(1)}%</span>
            </div>
            <div class="volatility-stats">
              <span>Avg: ${this.formatCurrency(cat.meanSpending)}</span>
              <span>σ: ${this.formatCurrency(cat.standardDeviation)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderReallocationSuggestions() {
    const container = document.getElementById('reallocation-suggestions');
    if (!container) return;

    const { suggestions } = this.reallocations;
    
    if (!suggestions || suggestions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-balance-scale"></i>
          <p>No reallocation suggestions at this time</p>
          <small>Suggestions appear when some budgets have surplus while others are over-budget</small>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="reallocation-list">
        ${suggestions.map(suggestion => `
          <div class="reallocation-item">
            <div class="reallocation-flow">
              <div class="reallocation-from">
                <span class="category-badge surplus">${suggestion.fromCategory}</span>
                <span class="surplus-amount">+${this.formatCurrency(suggestion.fromBudgetSurplus)}</span>
              </div>
              <div class="reallocation-arrow">
                <i class="fas fa-arrow-right"></i>
                <span class="transfer-amount">${this.formatCurrency(suggestion.suggestedAmount)}</span>
              </div>
              <div class="reallocation-to">
                <span class="category-badge deficit">${suggestion.toCategory}</span>
              </div>
            </div>
            <div class="reallocation-reason">
              <i class="fas fa-info-circle"></i>
              ${suggestion.reason}
            </div>
            <div class="reallocation-actions">
              <button class="btn btn-primary apply-reallocation-btn"
                      data-from="${suggestion.fromBudgetId}"
                      data-to="${suggestion.toCategory}"
                      data-amount="${suggestion.suggestedAmount}">
                <i class="fas fa-check"></i> Apply
              </button>
              <button class="btn btn-secondary reject-reallocation-btn"
                      data-budget-id="${suggestion.fromBudgetId}"
                      data-to-category="${suggestion.toCategory}">
                <i class="fas fa-times"></i> Dismiss
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderAlerts() {
    const container = document.getElementById('intelligence-alerts');
    if (!container) return;

    const allAlerts = [
      ...(this.alertsData?.standard || []),
      ...(this.alertsData?.anomaly || []),
      ...(this.alertsData?.prediction || []),
      ...(this.alertsData?.reallocation || [])
    ];

    if (allAlerts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-bell-slash"></i>
          <p>No alerts at this time</p>
        </div>
      `;
      return;
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    allAlerts.sort((a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3));

    container.innerHTML = `
      <div class="alerts-list">
        ${allAlerts.slice(0, 8).map(alert => `
          <div class="alert-item ${alert.type} ${alert.priority}">
            <div class="alert-icon">
              ${this.getAlertIcon(alert.type)}
            </div>
            <div class="alert-content">
              <div class="alert-message">${alert.message}</div>
              <div class="alert-meta">
                <span class="alert-type">${alert.type}</span>
                <span class="alert-priority ${alert.priority}">${alert.priority}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderBudgetIntelligence() {
    const container = document.getElementById('budget-intelligence-list');
    if (!container) return;

    const { budgets } = this.dashboardData;
    
    if (!budgets || budgets.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-wallet"></i>
          <p>No budgets with intelligence data</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="budget-intel-grid">
        ${budgets.map(budget => `
          <div class="budget-intel-card">
            <div class="budget-intel-header">
              <span class="budget-name">${budget.name || budget.category}</span>
              <span class="trend-indicator ${budget.intelligence?.trendDirection || 'stable'}">
                ${this.getTrendIcon(budget.intelligence?.trendDirection)}
              </span>
            </div>
            
            <div class="budget-intel-progress">
              <div class="progress-bar">
                <div class="progress-fill ${this.getUsageClass(budget.usagePercent)}" 
                     style="width: ${Math.min(budget.usagePercent || 0, 100)}%">
                </div>
              </div>
              <div class="progress-labels">
                <span>${this.formatCurrency(budget.spent || 0)}</span>
                <span>${this.formatCurrency(budget.limit)}</span>
              </div>
            </div>
            
            <div class="budget-intel-stats">
              <div class="stat-item">
                <span class="stat-label">Volatility</span>
                <span class="stat-value ${this.getVolatilityColorClass(budget.intelligence?.volatilityIndex)}">
                  ${(budget.intelligence?.volatilityIndex || 0).toFixed(1)}%
                </span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Predicted</span>
                <span class="stat-value">
                  ${this.formatCurrency(budget.intelligence?.predictedSpend || 0)}
                </span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Confidence</span>
                <span class="stat-value">
                  ${((budget.intelligence?.predictionConfidence || 0) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            
            ${budget.intelligence?.anomalies?.length > 0 ? `
              <div class="budget-anomaly-badge">
                <i class="fas fa-exclamation-triangle"></i>
                ${budget.intelligence.anomalies.filter(a => !a.isResolved).length} active anomalies
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  switchTab(tabName) {
    document.querySelectorAll('.intelligence-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.intelligence-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `${tabName}-panel`);
    });
  }

  async refreshIntelligence() {
    try {
      this.showLoading();
      
      await this.fetchAPI('/intelligence/update', { method: 'POST' });
      await this.loadDashboard();
      
      this.showNotification('Intelligence data updated successfully', 'success');
    } catch (error) {
      console.error('Failed to refresh intelligence:', error);
      this.showError('Failed to refresh intelligence data');
    } finally {
      this.hideLoading();
    }
  }

  async applyReallocation(fromBudgetId, toCategory, amount) {
    try {
      // First, find the target budget by category
      const budgets = await this.fetchAPI('/intelligence/budgets');
      const toBudget = budgets.data.find(b => b.category === toCategory);
      
      if (!toBudget) {
        this.showError(`No budget found for category: ${toCategory}`);
        return;
      }

      await this.fetchAPI('/intelligence/reallocations/apply', {
        method: 'POST',
        body: JSON.stringify({
          fromBudgetId,
          toBudgetId: toBudget._id,
          amount
        })
      });

      this.showNotification('Funds reallocated successfully', 'success');
      await this.loadDashboard();
    } catch (error) {
      console.error('Failed to apply reallocation:', error);
      this.showError('Failed to apply reallocation');
    }
  }

  async rejectReallocation(budgetId, toCategory) {
    try {
      await this.fetchAPI('/intelligence/reallocations/reject', {
        method: 'POST',
        body: JSON.stringify({ budgetId, toCategory })
      });

      this.showNotification('Suggestion dismissed', 'info');
      await this.loadDashboard();
    } catch (error) {
      console.error('Failed to reject reallocation:', error);
      this.showError('Failed to dismiss suggestion');
    }
  }

  async handleAnalyzeTransaction(e) {
    e.preventDefault();
    
    const form = e.target;
    const amount = parseFloat(form.querySelector('[name="amount"]').value);
    const category = form.querySelector('[name="category"]').value;
    const description = form.querySelector('[name="description"]').value;

    try {
      const result = await this.fetchAPI('/intelligence/analyze-transaction', {
        method: 'POST',
        body: JSON.stringify({ amount, category, description })
      });

      this.showAnalysisResult(result.data);
    } catch (error) {
      console.error('Failed to analyze transaction:', error);
      this.showError('Failed to analyze transaction');
    }
  }

  showAnalysisResult(analysis) {
    const container = document.getElementById('analysis-result');
    if (!container) return;

    container.innerHTML = `
      <div class="analysis-result ${analysis.isAnomaly ? 'anomaly' : 'normal'}">
        <div class="analysis-header">
          <i class="fas ${analysis.isAnomaly ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i>
          <span>${analysis.isAnomaly ? 'Anomaly Detected' : 'Normal Transaction'}</span>
        </div>
        <div class="analysis-details">
          <div class="detail-row">
            <span>Z-Score:</span>
            <span class="${this.getSeverityClass(analysis.zScore)}">${analysis.zScore.toFixed(2)}</span>
          </div>
          <div class="detail-row">
            <span>Deviation:</span>
            <span>${analysis.deviationPercent > 0 ? '+' : ''}${analysis.deviationPercent.toFixed(0)}%</span>
          </div>
          <div class="detail-row">
            <span>Category Average:</span>
            <span>${this.formatCurrency(analysis.categoryMean)}</span>
          </div>
          <div class="detail-row">
            <span>Standard Deviation:</span>
            <span>${this.formatCurrency(analysis.categoryStdDev)}</span>
          </div>
        </div>
        ${analysis.suggestion ? `
          <div class="analysis-suggestion">
            <i class="fas fa-lightbulb"></i>
            ${analysis.suggestion}
          </div>
        ` : ''}
      </div>
    `;
  }

  startAutoRefresh() {
    // Refresh every 5 minutes
    this.refreshInterval = setInterval(() => {
      this.loadDashboard();
    }, 5 * 60 * 1000);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  // Utility methods
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  }

  formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  }

  getSeverityClass(zScore) {
    if (zScore >= 3) return 'critical';
    if (zScore >= 2.5) return 'high';
    if (zScore >= 2) return 'medium';
    return 'low';
  }

  getVolatilityColor(volatility) {
    if (volatility >= 50) return '#ef4444';
    if (volatility >= 30) return '#f59e0b';
    if (volatility >= 15) return '#eab308';
    return '#22c55e';
  }

  getVolatilityColorClass(volatility) {
    if (volatility >= 50) return 'high';
    if (volatility >= 30) return 'medium';
    return 'low';
  }

  getHealthColorClass(score) {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  getUsageClass(percent) {
    if (percent >= 100) return 'over';
    if (percent >= 90) return 'warning';
    if (percent >= 75) return 'caution';
    return 'normal';
  }

  getTrendIcon(trend) {
    switch (trend) {
      case 'increasing': return '<i class="fas fa-arrow-up"></i>';
      case 'decreasing': return '<i class="fas fa-arrow-down"></i>';
      default: return '<i class="fas fa-minus"></i>';
    }
  }

  getAlertIcon(type) {
    switch (type) {
      case 'anomaly': return '<i class="fas fa-exclamation-triangle"></i>';
      case 'prediction': return '<i class="fas fa-chart-line"></i>';
      case 'reallocation': return '<i class="fas fa-exchange-alt"></i>';
      default: return '<i class="fas fa-bell"></i>';
    }
  }

  showLoading() {
    const loader = document.getElementById('intelligence-loader');
    if (loader) loader.classList.add('active');
  }

  hideLoading() {
    const loader = document.getElementById('intelligence-loader');
    if (loader) loader.classList.remove('active');
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  showNotification(message, type = 'info') {
    const container = document.getElementById('notifications') || document.body;
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i>
      <span>${message}</span>
    `;
    
    container.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('intelligence-dashboard')) {
    window.intelligenceDashboard = new IntelligenceDashboard();
    window.intelligenceDashboard.init();
  }
});

// ========================
// PREDICTIVE BURN RATE INTELLIGENCE (Issue #470)
// ========================

IntelligenceDashboard.prototype.loadForecastData = async function() {
  try {
    const response = await fetch(`${this.API_BASE}/forecast/complete`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to load forecast data');
    
    const result = await response.json();
    
    if (result.success) {
      this.forecastData = result.data.forecast;
      this.burnRateData = result.data.burnRate;
      this.categoryPatterns = result.data.categoryPatterns;
      this.insights = result.data.insights;
      
      this.renderForecastDashboard();
      this.renderBurnRateMetrics();
      this.renderInsights();
      this.renderCategoryPatterns();
    }
  } catch (error) {
    console.error('Error loading forecast data:', error);
  }
};

IntelligenceDashboard.prototype.renderForecastDashboard = function() {
  if (!this.forecastData || !this.forecastData.success) return;
  
  const forecastContainer = document.getElementById('forecast-container');
  if (!forecastContainer) return;
  
  // Create forecast chart
  const chartCanvas = document.createElement('canvas');
  chartCanvas.id = 'forecast-chart';
  chartCanvas.style.maxHeight = '400px';
  
  forecastContainer.innerHTML = `
    <div class="forecast-header">
      <h3>30-Day Expense Forecast</h3>
      <div class="forecast-accuracy">
        <span class="accuracy-label">Model Accuracy:</span>
        <span class="accuracy-value">${this.forecastData.model.accuracy.toFixed(1)}%</span>
      </div>
    </div>
    <div class="chart-container"></div>
    <div class="forecast-summary">
      <div class="summary-card">
        <h4>Predicted Spending</h4>
        <p class="amount">$${this.forecastData.cumulativePredictions[29]?.cumulativeAmount.toFixed(2) || 0}</p>
        <span class="period">Next 30 days</span>
      </div>
      <div class="summary-card">
        <h4>Daily Burn Rate</h4>
        <p class="amount">$${this.burnRateData?.dailyBurnRate.toFixed(2) || 0}</p>
        <span class="trend ${this.burnRateData?.trend}">${this.burnRateData?.trend || 'stable'}</span>
      </div>
      <div class="summary-card">
        <h4>Trend</h4>
        <p class="percentage ${this.burnRateData?.trendPercentage >= 0 ? 'negative' : 'positive'}">
          ${this.burnRateData?.trendPercentage >= 0 ? '+' : ''}${this.burnRateData?.trendPercentage.toFixed(1) || 0}%
        </p>
        <span class="period">vs. previous period</span>
      </div>
    </div>
  `;
  
  const chartContainer = forecastContainer.querySelector('.chart-container');
  chartContainer.appendChild(chartCanvas);
  
  // Prepare chart data
  const historicalDates = this.forecastData.historicalData.map(d => d.date);
  const historicalAmounts = this.forecastData.historicalData.map(d => d.amount);
  const forecastDates = this.forecastData.predictions.map(p => p.date);
  const forecastAmounts = this.forecastData.predictions.map(p => p.predictedAmount);
  
  // Create chart
  const ctx = chartCanvas.getContext('2d');
  this.forecastChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [...historicalDates, ...forecastDates],
      datasets: [
        {
          label: 'Historical Spending',
          data: [...historicalAmounts, ...Array(forecastDates.length).fill(null)],
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'Predicted Spending',
          data: [...Array(historicalDates.length).fill(null), ...forecastAmounts],
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderDash: [5, 5],
          fill: true,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              return `${context.dataset.label}: $${context.parsed.y.toFixed(2)}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => `$${value}`
          }
        }
      }
    }
  });
};

IntelligenceDashboard.prototype.renderBurnRateMetrics = function() {
  if (!this.burnRateData) return;
  
  const metricsContainer = document.getElementById('burn-rate-metrics');
  if (!metricsContainer) return;
  
  metricsContainer.innerHTML = `
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-icon">🔥</div>
        <div class="metric-content">
          <h4>Daily Burn Rate</h4>
          <p class="metric-value">$${this.burnRateData.dailyBurnRate.toFixed(2)}</p>
          <span class="metric-subtitle">${this.burnRateData.daysAnalyzed} days analyzed</span>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-icon">📊</div>
        <div class="metric-content">
          <h4>Weekly Burn Rate</h4>
          <p class="metric-value">$${this.burnRateData.weeklyBurnRate.toFixed(2)}</p>
          <span class="metric-subtitle">Projected weekly spend</span>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-icon">${this.burnRateData.trend === 'increasing' ? '📈' : this.burnRateData.trend === 'decreasing' ? '📉' : '➡️'}</div>
        <div class="metric-content">
          <h4>Spending Trend</h4>
          <p class="metric-value ${this.burnRateData.trend}">${this.burnRateData.trend}</p>
          <span class="metric-subtitle">${this.burnRateData.trendPercentage >= 0 ? '+' : ''}${this.burnRateData.trendPercentage.toFixed(1)}%</span>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-icon">🎯</div>
        <div class="metric-content">
          <h4>Confidence Score</h4>
          <p class="metric-value">${this.burnRateData.confidence.toFixed(0)}%</p>
          <span class="metric-subtitle">Based on ${this.burnRateData.dataPoints} transactions</span>
        </div>
      </div>
    </div>
  `;
};

IntelligenceDashboard.prototype.renderInsights = function() {
  if (!this.insights || !this.insights.insights) return;
  
  const insightsContainer = document.getElementById('insights-container');
  if (!insightsContainer) return;
  
  const insights = this.insights.insights;
  
  if (insights.length === 0) {
    insightsContainer.innerHTML = `
      <div class="no-insights">
        <div class="icon">✨</div>
        <p>All looking good! No concerns at the moment.</p>
      </div>
    `;
    return;
  }
  
  const insightIcons = {
    alert: '🚨',
    warning: '⚠️',
    info: 'ℹ️',
    success: '✅'
  };
  
  const insightHTML = insights.map(insight => `
    <div class="insight-card ${insight.type} priority-${insight.priority}">
      <div class="insight-header">
        <span class="insight-icon">${insightIcons[insight.type] || 'ℹ️'}</span>
        <h4>${insight.title}</h4>
        <span class="insight-priority">${insight.priority}</span>
      </div>
      <p class="insight-message">${insight.message}</p>
      <span class="insight-category">${insight.category.replace('_', ' ')}</span>
    </div>
  `).join('');
  
  insightsContainer.innerHTML = `
    <div class="insights-header">
      <h3>Intelligent Insights</h3>
      <span class="insights-count">${insights.length} insight${insights.length !== 1 ? 's' : ''}</span>
    </div>
    <div class="insights-list">${insightHTML}</div>
  `;
};

IntelligenceDashboard.prototype.renderCategoryPatterns = function() {
  if (!this.categoryPatterns || !this.categoryPatterns.categories) return;
  
  const patternsContainer = document.getElementById('category-patterns-container');
  if (!patternsContainer) return;
  
  const topCategories = this.categoryPatterns.categories.slice(0, 5);
  
  const patternsHTML = topCategories.map(category => {
    const hasPrediction = category.prediction && category.prediction.accuracy > 0;
    const trendIcon = category.burnRate.trend === 'increasing' ? '📈' : 
                       category.burnRate.trend === 'decreasing' ? '📉' : '➡️';
    
    return `
      <div class="category-pattern-card">
        <div class="pattern-header">
          <h4>${category.categoryName}</h4>
          <span class="trend-icon">${trendIcon}</span>
        </div>
        <div class="pattern-stats">
          <div class="stat">
            <span class="stat-label">Total Spent</span>
            <span class="stat-value">$${category.totalSpent.toFixed(2)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Transactions</span>
            <span class="stat-value">${category.transactionCount}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Daily Rate</span>
            <span class="stat-value">$${category.burnRate.dailyBurnRate.toFixed(2)}</span>
          </div>
        </div>
        ${hasPrediction ? `
          <div class="pattern-prediction">
            <span class="prediction-label">30-Day Forecast:</span>
            <span class="prediction-value">$${category.prediction.next30Days.toFixed(2)}</span>
            <span class="prediction-accuracy">${category.prediction.accuracy.toFixed(0)}% accuracy</span>
          </div>
        ` : ''}
        <div class="pattern-trend ${category.burnRate.trend}">
          ${category.burnRate.trend} ${category.burnRate.trendPercentage >= 0 ? '+' : ''}${category.burnRate.trendPercentage.toFixed(1)}%
        </div>
      </div>
    `;
  }).join('');
  
  patternsContainer.innerHTML = `
    <div class="patterns-header">
      <h3>Category Spending Patterns</h3>
      <span class="patterns-period">Last 30 days</span>
    </div>
    <div class="patterns-grid">${patternsHTML}</div>
  `;
};

// Cache forecast data in IndexedDB
IntelligenceDashboard.prototype.cacheForecastData = async function() {
  if (!this.forecastData || typeof DBManager === 'undefined') return;
  
  try {
    await DBManager.saveForecast({
      timestamp: new Date(),
      burnRate: this.burnRateData,
      forecast: this.forecastData,
      categoryPatterns: this.categoryPatterns,
      insights: this.insights
    });
  } catch (error) {
    console.error('Error caching forecast data:', error);
  }
};

// Load cached forecast for offline viewing
IntelligenceDashboard.prototype.loadCachedForecast = async function() {
  if (typeof DBManager === 'undefined') return null;
  
  try {
    const cached = await DBManager.getForecast();
    if (cached && cached.timestamp) {
      const age = Date.now() - new Date(cached.timestamp).getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (age < maxAge) {
        this.forecastData = cached.forecast;
        this.burnRateData = cached.burnRate;
        this.categoryPatterns = cached.categoryPatterns;
        this.insights = cached.insights;
        return cached;
      }
    }
  } catch (error) {
    console.error('Error loading cached forecast:', error);
  }
  
  return null;
};

// ========================
// Financial Health Score & Wellness (Issue #481)
// ========================

class WellnessWidget {
  constructor() {
    this.healthScore = null;
    this.insights = [];
    this.activeInsights = [];
  }

  async init() {
    await this.loadHealthScore();
    await this.loadInsights();
    this.renderHealthGauge();
    this.renderInsights();
    this.bindInsightActions();
  }

  async loadHealthScore() {
    try {
      const response = await fetch('/api/analytics/wellness/health-score', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (data.success) {
        this.healthScore = data.data;
        return this.healthScore;
      }
    } catch (error) {
      console.error('Error loading health score:', error);
    }
    return null;
  }

  async loadInsights() {
    try {
      const response = await fetch('/api/analytics/wellness/insights?limit=10', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (data.success) {
        this.activeInsights = data.data.insights;
        return this.activeInsights;
      }
    } catch (error) {
      console.error('Error loading insights:', error);
    }
    return [];
  }

  renderHealthGauge() {
    if (!this.healthScore) return;

    const container = document.getElementById('health-gauge-container');
    if (!container) return;

    const { score, grade, status, color, trend, scoreChange, components, strengths, weaknesses } = this.healthScore;

    container.innerHTML = `
      <div class="health-gauge-widget">
        <div class="health-gauge-header">
          <h3>Financial Health Score</h3>
          <span class="health-trend health-trend-${trend}">
            ${trend === 'improving' ? '📈' : trend === 'declining' ? '📉' : '➡️'}
            ${Math.abs(scoreChange)} points
          </span>
        </div>
        
        <div class="health-gauge">
          <svg viewBox="0 0 200 120" class="gauge-svg">
            <defs>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:#ff855e;stop-opacity:1" />
                <stop offset="33%" style="stop-color:#ffc107;stop-opacity:1" />
                <stop offset="66%" style="stop-color:#4facfe;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#00b75e;stop-opacity:1" />
              </linearGradient>
            </defs>
            <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#2a2a3e" stroke-width="20" stroke-linecap="round"/>
            <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#gaugeGradient)" stroke-width="20" 
                  stroke-linecap="round" stroke-dasharray="${score * 2.51} 251" />
            <text x="100" y="80" text-anchor="middle" class="gauge-score" fill="${color}">${score}</text>
            <text x="100" y="105" text-anchor="middle" class="gauge-grade" fill="#888">${grade} - ${status}</text>
          </svg>
        </div>

        <div class="health-components">
          <div class="component-section">
            <h4>💪 Strengths</h4>
            ${strengths.map(s => `
              <div class="component-item strength">
                <span class="component-label">${s.label}</span>
                <span class="component-score">${s.score}</span>
              </div>
            `).join('')}
          </div>
          
          ${weaknesses.length > 0 ? `
            <div class="component-section">
              <h4>⚠️ Areas to Improve</h4>
              ${weaknesses.map(w => `
                <div class="component-item weakness">
                  <span class="component-label">${w.label}</span>
                  <span class="component-score">${w.score}</span>
                  <span class="priority-badge priority-${w.priority}">${w.priority}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <div class="health-actions">
          <button class="btn btn-primary" onclick="wellnessWidget.refreshScore()">
            <i class="fas fa-sync-alt"></i> Refresh Score
          </button>
          <button class="btn btn-secondary" onclick="wellnessWidget.viewDetails()">
            <i class="fas fa-chart-line"></i> View Details
          </button>
        </div>
      </div>
    `;
  }

  renderInsights() {
    const container = document.getElementById('smart-insights-container');
    if (!container || !this.activeInsights) return;

    if (this.activeInsights.length === 0) {
      container.innerHTML = `
        <div class="insights-empty">
          <i class="fas fa-lightbulb" style="font-size: 3rem; color: #888; margin-bottom: 1rem;"></i>
          <p>No insights yet. Keep tracking your expenses!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="smart-insights">
        <div class="insights-header">
          <h3>💡 Smart Insights</h3>
          <button class="btn btn-sm" onclick="wellnessWidget.loadInsights().then(() => wellnessWidget.renderInsights())">
            <i class="fas fa-sync"></i> Refresh
          </button>
        </div>
        <div class="insights-list">
          ${this.activeInsights.map(insight => this.renderInsightCard(insight)).join('')}
        </div>
      </div>
    `;
  }

  renderInsightCard(insight) {
    const priorityIcons = {
      critical: '🚨',
      high: '⚠️',
      medium: '⚡',
      low: 'ℹ️',
      info: '💡'
    };

    const icon = priorityIcons[insight.priority] || '💡';

    return `
      <div class="insight-card insight-${insight.priority}" data-insight-id="${insight._id}">
        <div class="insight-header">
          <span class="insight-icon">${icon}</span>
          <div class="insight-title-section">
            <h4>${insight.title}</h4>
            <span class="insight-type">${insight.type.replace(/_/g, ' ')}</span>
          </div>
          <span class="insight-confidence">${insight.confidence}% confident</span>
        </div>
        
        <p class="insight-message">${insight.message}</p>
        
        ${insight.metrics ? `
          <div class="insight-metrics">
            ${insight.metrics.current_velocity ? `<span>📊 Velocity: ₹${insight.metrics.current_velocity}/day</span>` : ''}
            ${insight.metrics.budget_utilization ? `<span>📈 Budget: ${insight.metrics.budget_utilization}%</span>` : ''}
            ${insight.metrics.days_until_budget_exhausted ? `<span>⏰ ${insight.metrics.days_until_budget_exhausted} days left</span>` : ''}
            ${insight.metrics.potential_savings ? `<span>💰 Save: ₹${insight.metrics.potential_savings}</span>` : ''}
          </div>
        ` : ''}
        
        ${insight.actions && insight.actions.length > 0 ? `
          <div class="insight-actions">
            ${insight.actions.map((action, idx) => `
              <button class="btn btn-sm btn-action" onclick="wellnessWidget.executeAction('${insight._id}', ${idx})">
                ${action.label}
              </button>
            `).join('')}
          </div>
        ` : ''}
        
        <div class="insight-footer">
          <span class="insight-age">${this.getRelativeTime(insight.createdAt)}</span>
          <div class="insight-controls">
            <button class="btn-text" onclick="wellnessWidget.acknowledgeInsight('${insight._id}')">Acknowledge</button>
            <button class="btn-text" onclick="wellnessWidget.dismissInsight('${insight._id}')">Dismiss</button>
          </div>
        </div>
      </div>
    `;
  }

  getRelativeTime(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  async acknowledgeInsight(insightId) {
    try {
      const response = await fetch(`/api/analytics/wellness/insights/${insightId}/acknowledge`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (response.ok) {
        await this.loadInsights();
        this.renderInsights();
        this.showToast('Insight acknowledged', 'success');
      }
    } catch (error) {
      console.error('Error acknowledging insight:', error);
      this.showToast('Failed to acknowledge insight', 'error');
    }
  }

  async dismissInsight(insightId) {
    try {
      const response = await fetch(`/api/analytics/wellness/insights/${insightId}/dismiss`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (response.ok) {
        await this.loadInsights();
        this.renderInsights();
        this.showToast('Insight dismissed', 'success');
      }
    } catch (error) {
      console.error('Error dismissing insight:', error);
      this.showToast('Failed to dismiss insight', 'error');
    }
  }

  async refreshScore() {
    const btn = event.target.closest('button');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating...';
    
    await this.loadHealthScore();
    this.renderHealthGauge();
    
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Score';
    this.showToast('Health score updated!', 'success');
  }

  viewDetails() {
    // Show detailed breakdown modal
    if (this.healthScore && this.healthScore.components) {
      alert('Detailed component breakdown:\n\n' + 
        Object.entries(this.healthScore.components)
          .map(([key, val]) => `${key}: ${val.score}/100`)
          .join('\n'));
    }
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
  }

  bindInsightActions() {
    // Socket listener for real-time health score updates
    if (typeof io !== 'undefined' && socket) {
      socket.on('health_score_update', (data) => {
        this.healthScore.score = data.score;
        this.healthScore.grade = data.grade;
        this.healthScore.scoreChange = data.change;
        this.healthScore.trend = data.trend;
        this.renderHealthGauge();
        this.showToast(`Health score updated: ${data.score} (${data.change > 0 ? '+' : ''}${data.change})`, 
          data.trend === 'improving' ? 'success' : data.trend === 'declining' ? 'warning' : 'info');
      });
    }
  }

  async executeAction(insightId, actionIndex) {
    const insight = this.activeInsights.find(i => i._id === insightId);
    if (!insight || !insight.actions[actionIndex]) return;

    const action = insight.actions[actionIndex];
    // Handle action based on type
    this.showToast(`Action "${action.label}" executed`, 'info');
    await this.acknowledgeInsight(insightId);
  }
}

// Initialize wellness widget if containers exist
let wellnessWidget;
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('health-gauge-container') || document.getElementById('smart-insights-container')) {
    wellnessWidget = new WellnessWidget();
    wellnessWidget.init();
  }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IntelligenceDashboard;
  module.exports.WellnessWidget = WellnessWidget;
}
