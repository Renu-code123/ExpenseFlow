// Local Analytics Implementation for ExpenseFlow
// Works with localStorage data instead of API

// Get transactions from localStorage
function getLocalTransactions() {
    const stored = localStorage.getItem('transactions');
    return stored ? JSON.parse(stored) : [];
}

// Calculate spending velocity from local data
function calculateLocalVelocity() {
    const transactions = getLocalTransactions();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const dayOfMonth = now.getDate();
    
    // Get current month expenses
    const currentMonthExpenses = transactions.filter(t => {
        const tDate = new Date(t.date);
        return tDate.getMonth() === currentMonth && 
               tDate.getFullYear() === currentYear && 
               t.amount < 0;
    });
    
    const currentSpent = Math.abs(currentMonthExpenses.reduce((sum, t) => sum + t.amount, 0));
    const dailyAverage = currentSpent / dayOfMonth;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysRemaining = daysInMonth - dayOfMonth;
    const projectedMonthEnd = currentSpent + (dailyAverage * daysRemaining);
    
    return {
        currentSpent,
        dailyAverage,
        projectedMonthEnd,
        dayOfMonth,
        daysRemaining
    };
}

// Calculate category breakdown from local data
function calculateLocalCategoryBreakdown() {
    const transactions = getLocalTransactions();
    const expenses = transactions.filter(t => t.amount < 0);
    
    if (expenses.length === 0) {
        return { categories: [], grandTotal: 0 };
    }
    
    const categoryTotals = {};
    let grandTotal = 0;
    
    expenses.forEach(expense => {
        const category = expense.category || 'other';
        const amount = Math.abs(expense.amount);
        categoryTotals[category] = (categoryTotals[category] || 0) + amount;
        grandTotal += amount;
    });
    
    const categories = Object.entries(categoryTotals)
        .map(([category, total]) => ({
            category,
            total,
            percentage: Math.round((total / grandTotal) * 100)
        }))
        .sort((a, b) => b.total - a.total);
    
    return { categories, grandTotal };
}

// Calculate spending trends from local data
function calculateLocalTrends() {
    const transactions = getLocalTransactions();
    const now = new Date();
    const months = [];
    
    // Get last 6 months of data
    for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const month = date.getMonth();
        const year = date.getFullYear();
        
        const monthTransactions = transactions.filter(t => {
            const tDate = new Date(t.date);
            return tDate.getMonth() === month && tDate.getFullYear() === year;
        });
        
        const income = monthTransactions
            .filter(t => t.amount > 0)
            .reduce((sum, t) => sum + t.amount, 0);
        
        const expense = Math.abs(monthTransactions
            .filter(t => t.amount < 0)
            .reduce((sum, t) => sum + t.amount, 0));
        
        months.push({
            period: `${year}-${String(month + 1).padStart(2, '0')}`,
            income: Math.round(income),
            expense: Math.round(expense)
        });
    }
    
    // Calculate summary
    const avgMonthlyExpense = Math.round(
        months.reduce((sum, m) => sum + m.expense, 0) / months.length
    );
    
    const avgSavingsRate = Math.round(
        months.reduce((sum, m) => {
            const savings = m.income - m.expense;
            return sum + (m.income > 0 ? (savings / m.income) * 100 : 0);
        }, 0) / months.length
    );
    
    // Determine trend
    const recentExpenses = months.slice(-3).map(m => m.expense);
    const earlierExpenses = months.slice(0, 3).map(m => m.expense);
    const recentAvg = recentExpenses.reduce((a, b) => a + b, 0) / recentExpenses.length;
    const earlierAvg = earlierExpenses.reduce((a, b) => a + b, 0) / earlierExpenses.length;
    
    const spendingTrend = recentAvg < earlierAvg ? 'decreasing' : 'increasing';
    
    return {
        data: months,
        summary: {
            avgMonthlyExpense,
            avgSavingsRate,
            spendingTrend
        }
    };
}

// Generate insights from local data
function generateLocalInsights() {
    const transactions = getLocalTransactions();
    const insights = [];
    
    if (transactions.length === 0) {
        return { insights: [] };
    }
    
    // Category analysis
    const breakdown = calculateLocalCategoryBreakdown();
    if (breakdown.categories.length > 0) {
        const topCategory = breakdown.categories[0];
        if (topCategory.percentage > 40) {
            insights.push({
                type: 'category',
                status: 'warning',
                title: 'High Category Spending',
                message: `${topCategory.percentage}% of your expenses are in ${topCategory.category}`,
                suggestion: 'Consider setting a budget limit for this category'
            });
        }
    }
    
    // Spending frequency
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentTransactions = transactions.filter(t => new Date(t.date) > lastWeek);
    
    if (recentTransactions.length > 10) {
        insights.push({
            type: 'trend',
            status: 'warning',
            title: 'High Transaction Frequency',
            message: `You've made ${recentTransactions.length} transactions in the last week`,
            suggestion: 'Consider consolidating purchases to reduce impulse spending'
        });
    }
    
    // Balance analysis
    const balance = transactions.reduce((sum, t) => sum + t.amount, 0);
    if (balance > 0) {
        insights.push({
            type: 'savings',
            status: 'good',
            title: 'Positive Balance',
            message: `You have a positive balance of ₹${balance.toFixed(2)}`,
            suggestion: 'Great job! Consider investing your surplus'
        });
    }
    
    return { insights };
}

// Generate predictions from local data
function generateLocalPredictions() {
    const transactions = getLocalTransactions();
    
    if (transactions.length < 10) {
        return null;
    }
    
    // Calculate monthly averages
    const monthlyExpenses = [];
    const now = new Date();
    
    for (let i = 2; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const month = date.getMonth();
        const year = date.getFullYear();
        
        const monthExpenses = transactions
            .filter(t => {
                const tDate = new Date(t.date);
                return tDate.getMonth() === month && 
                       tDate.getFullYear() === year && 
                       t.amount < 0;
            })
            .reduce((sum, t) => sum + Math.abs(t.amount), 0);
        
        monthlyExpenses.push(monthExpenses);
    }
    
    const historicalAverage = Math.round(
        monthlyExpenses.reduce((a, b) => a + b, 0) / monthlyExpenses.length
    );
    
    const movingAverage = Math.round(
        monthlyExpenses.slice(-2).reduce((a, b) => a + b, 0) / 2
    );
    
    // Simple prediction based on trend
    const trend = monthlyExpenses[2] > monthlyExpenses[1] ? 'increasing' : 'decreasing';
    const nextMonthPrediction = Math.round(movingAverage * (trend === 'increasing' ? 1.1 : 0.9));
    
    return {
        nextMonthPrediction,
        historicalAverage,
        movingAverage,
        trend,
        confidence: 75,
        basedOnMonths: monthlyExpenses.length
    };
}

// Render functions (using existing ones from analytics-dashboard.js but with local data)
function renderLocalVelocityWidget() {
    const velocity = calculateLocalVelocity();
    const container = document.getElementById('velocity-widget');
    if (!container) return;

    const progressPercent = Math.min(100, (velocity.dayOfMonth / 30) * 100);

    container.innerHTML = `
        <div class="widget-header">
            <h4 class="widget-title">
                <i class="fas fa-tachometer-alt widget-icon"></i>
                Spending Velocity
            </h4>
            <span class="velocity-date">Day ${velocity.dayOfMonth} of month</span>
        </div>
        <div class="velocity-stats">
            <div class="velocity-stat">
                <span class="stat-value">₹${velocity.currentSpent.toLocaleString()}</span>
                <span class="stat-label">Spent this month</span>
            </div>
            <div class="velocity-stat">
                <span class="stat-value">₹${velocity.dailyAverage.toLocaleString()}</span>
                <span class="stat-label">Daily average</span>
            </div>
            <div class="velocity-stat projected">
                <span class="stat-value">₹${velocity.projectedMonthEnd.toLocaleString()}</span>
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

function renderLocalCategoryChart() {
    const breakdown = calculateLocalCategoryBreakdown();
    const container = document.getElementById('category-chart');
    if (!container) return;

    if (!breakdown || breakdown.categories.length === 0) {
        container.innerHTML = `
            <div class="widget-header">
                <h4 class="widget-title">
                    <i class="fas fa-pie-chart widget-icon"></i>
                    Category Breakdown
                </h4>
            </div>
            <div class="no-data">No expense data available</div>
        `;
        return;
    }

    const categoryColors = {
        food: '#FF6B6B',
        transport: '#4ECDC4',
        entertainment: '#96CEB4',
        bills: '#FECA57',
        healthcare: '#FF9FF3',
        shopping: '#45B7D1',
        other: '#A55EEA'
    };

    const categoryIcons = {
        food: '🍽️',
        transport: '🚗',
        entertainment: '🎬',
        bills: '💡',
        healthcare: '🏥',
        shopping: '🛒',
        other: '📋'
    };

    container.innerHTML = `
        <div class="widget-header">
            <h4 class="widget-title">
                <i class="fas fa-pie-chart widget-icon"></i>
                Category Breakdown
            </h4>
            <span class="total-amount">Total: ₹${breakdown.grandTotal.toLocaleString()}</span>
        </div>
        <div class="category-bars">
            ${breakdown.categories.map(cat => `
                <div class="category-bar-item">
                    <div class="category-info">
                        <span class="category-icon">${categoryIcons[cat.category] || '📋'}</span>
                        <span class="category-name">${cat.category.charAt(0).toUpperCase() + cat.category.slice(1)}</span>
                    </div>
                    <div class="category-bar-wrapper">
                        <div class="category-bar" style="width: ${cat.percentage}%; background-color: ${categoryColors[cat.category] || '#999'}"></div>
                    </div>
                    <div class="category-stats">
                        <span class="category-amount">₹${cat.total.toLocaleString()}</span>
                        <span class="category-percent">${cat.percentage}%</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderLocalTrendsChart() {
    const trends = calculateLocalTrends();
    const container = document.getElementById('trends-chart');
    if (!container) return;

    if (!trends || trends.data.length === 0) {
        container.innerHTML = `
            <div class="widget-header">
                <h4 class="widget-title">
                    <i class="fas fa-chart-line widget-icon"></i>
                    Spending Trends
                </h4>
            </div>
            <div class="no-data">Not enough data for trends</div>
        `;
        return;
    }

    const maxAmount = Math.max(...trends.data.map(d => Math.max(d.income, d.expense)));

    container.innerHTML = `
        <div class="widget-header">
            <h4 class="widget-title">
                <i class="fas fa-chart-line widget-icon"></i>
                Spending Trends
            </h4>
            <div class="trends-legend">
                <span class="legend-item income"><span class="legend-dot"></span> Income</span>
                <span class="legend-item expense"><span class="legend-dot"></span> Expense</span>
            </div>
        </div>
        <div class="trends-chart-container">
            ${trends.data.map(item => {
                const incomeHeight = maxAmount > 0 ? (item.income / maxAmount) * 100 : 0;
                const expenseHeight = maxAmount > 0 ? (item.expense / maxAmount) * 100 : 0;
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const [year, month] = item.period.split('-');
                const monthName = monthNames[parseInt(month) - 1];
                
                return `
                    <div class="trend-bar-group">
                        <div class="trend-bars">
                            <div class="trend-bar income" style="height: ${incomeHeight}%" title="Income: ₹${item.income}"></div>
                            <div class="trend-bar expense" style="height: ${expenseHeight}%" title="Expense: ₹${item.expense}"></div>
                        </div>
                        <span class="trend-label">${monthName}</span>
                    </div>
                `;
            }).join('')}
        </div>
        ${trends.summary ? `
            <div class="trends-summary" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e2e8f0;">
                <div class="summary-item" style="text-align: center;">
                    <span class="summary-label" style="display: block; font-size: 0.75rem; color: #718096;">Avg Monthly Expense</span>
                    <span class="summary-value expense" style="font-weight: 600; color: #f56565;">₹${trends.summary.avgMonthlyExpense.toLocaleString()}</span>
                </div>
                <div class="summary-item" style="text-align: center;">
                    <span class="summary-label" style="display: block; font-size: 0.75rem; color: #718096;">Savings Rate</span>
                    <span class="summary-value ${trends.summary.avgSavingsRate >= 0 ? 'positive' : 'negative'}" style="font-weight: 600; color: ${trends.summary.avgSavingsRate >= 0 ? '#48bb78' : '#f56565'};">${trends.summary.avgSavingsRate}%</span>
                </div>
                <div class="summary-item" style="text-align: center;">
                    <span class="summary-label" style="display: block; font-size: 0.75rem; color: #718096;">Trend</span>
                    <span class="summary-value ${trends.summary.spendingTrend === 'decreasing' ? 'positive' : 'negative'}" style="font-weight: 600; color: ${trends.summary.spendingTrend === 'decreasing' ? '#48bb78' : '#f56565'};">
                        ${trends.summary.spendingTrend === 'decreasing' ? '↓' : '↑'} ${trends.summary.spendingTrend.charAt(0).toUpperCase() + trends.summary.spendingTrend.slice(1)}
                    </span>
                </div>
            </div>
        ` : ''}
    `;
}

function renderLocalInsights() {
    const insights = generateLocalInsights();
    const container = document.getElementById('insights-container');
    if (!container) return;

    if (!insights || insights.insights.length === 0) {
        container.innerHTML = `
            <div class="widget-header">
                <h4 class="widget-title">
                    <i class="fas fa-lightbulb widget-icon"></i>
                    Smart Insights
                </h4>
            </div>
            <div class="no-data">No insights available yet</div>
        `;
        return;
    }

    const insightIcons = {
        savings: 'piggy-bank',
        category: 'tags',
        trend: 'chart-line',
        anomaly: 'exclamation-triangle',
        info: 'info-circle'
    };

    container.innerHTML = `
        <div class="widget-header">
            <h4 class="widget-title">
                <i class="fas fa-lightbulb widget-icon"></i>
                Smart Insights
            </h4>
        </div>
        <div class="insights-list">
            ${insights.insights.map(insight => `
                <div class="insight-card ${insight.status}">
                    <div class="insight-icon">
                        <i class="fas fa-${insightIcons[insight.type] || 'info-circle'}"></i>
                    </div>
                    <div class="insight-content">
                        <h5>${insight.title}</h5>
                        <p>${insight.message}</p>
                        ${insight.suggestion ? `<span class="insight-suggestion">${insight.suggestion}</span>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderLocalPredictions() {
    const predictions = generateLocalPredictions();
    const container = document.getElementById('predictions-widget');
    if (!container) return;

    if (!predictions) {
        container.innerHTML = `
            <div class="widget-header">
                <h4 class="widget-title">
                    <i class="fas fa-crystal-ball widget-icon"></i>
                    Spending Predictions
                </h4>
            </div>
            <div class="no-data">Need more data for predictions</div>
        `;
        return;
    }

    const trendIcon = predictions.trend === 'increasing' ? 'arrow-up' :
        predictions.trend === 'decreasing' ? 'arrow-down' : 'minus';
    const trendClass = predictions.trend === 'decreasing' ? 'positive' : 'negative';

    container.innerHTML = `
        <div class="widget-header">
            <h4 class="widget-title">
                <i class="fas fa-crystal-ball widget-icon"></i>
                Spending Predictions
            </h4>
            <span class="confidence-badge" style="font-size: 0.75rem; background: #e2e8f0; padding: 0.25rem 0.5rem; border-radius: 4px;">Confidence: ${predictions.confidence}%</span>
        </div>
        <div class="prediction-main" style="text-align: center; margin: 1rem 0;">
            <span class="prediction-label" style="display: block; font-size: 0.875rem; color: #718096;">Next Month Forecast</span>
            <span class="prediction-value" style="display: block; font-size: 2rem; font-weight: 700; color: #2d3748; margin: 0.5rem 0;">₹${predictions.nextMonthPrediction.toLocaleString()}</span>
            <span class="prediction-trend ${trendClass}" style="font-weight: 600; color: ${trendClass === 'positive' ? '#48bb78' : '#f56565'};">
                <i class="fas fa-${trendIcon}"></i>
                ${predictions.trend.charAt(0).toUpperCase() + predictions.trend.slice(1)}
            </span>
        </div>
        <div class="prediction-details" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; padding-top: 1rem; border-top: 1px solid #e2e8f0;">
            <div class="detail-item" style="text-align: center;">
                <span class="detail-label" style="display: block; font-size: 0.75rem; color: #718096;">Historical Avg</span>
                <span class="detail-value" style="font-weight: 600; color: #2d3748;">₹${predictions.historicalAverage.toLocaleString()}</span>
            </div>
            <div class="detail-item" style="text-align: center;">
                <span class="detail-label" style="display: block; font-size: 0.75rem; color: #718096;">Moving Avg</span>
                <span class="detail-value" style="font-weight: 600; color: #2d3748;">₹${predictions.movingAverage.toLocaleString()}</span>
            </div>
            <div class="detail-item" style="text-align: center;">
                <span class="detail-label" style="display: block; font-size: 0.75rem; color: #718096;">Based on</span>
                <span class="detail-value" style="font-weight: 600; color: #2d3748;">${predictions.basedOnMonths} months</span>
            </div>
        </div>
    `;
}

// Load all analytics widgets
function loadLocalAnalytics() {
    try {
        renderLocalVelocityWidget();
        renderLocalCategoryChart();
        renderLocalTrendsChart();
        renderLocalInsights();
        renderLocalPredictions();
    } catch (error) {
        console.error('Error loading local analytics:', error);
    }
}

// Initialize analytics when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Load analytics data
    loadLocalAnalytics();
    
    // Add refresh functionality
    const refreshBtn = document.getElementById('refresh-analytics');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadLocalAnalytics);
    }
    
    // Mobile navigation
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');
    
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }
});