/**
 * Budget Analytics Controller
 * Handles all budget variance and forecasting UI logic
 */

let forecastChart = null;
let utilizationTrendChart = null;
let categoryDistChart = null;
let currentBudgetId = null;
let currentVariance = null;
let selectedRecommendations = [];

document.addEventListener('DOMContentLoaded', () => {
    loadBudgets();
    loadDashboard();
    setupForms();
});

async function loadBudgets() {
    try {
        const res = await fetch('/api/budgets', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { budgets } = await res.json();

        const select = document.getElementById('budget-selector');
        select.innerHTML = '<option value="">Select Budget...</option>' +
            budgets.map(b => `<option value="${b._id}">${b.name}</option>`).join('');
    } catch (err) {
        console.error('Failed to load budgets:', err);
    }
}

async function loadDashboard() {
    try {
        const res = await fetch('/api/budget-analytics/variance/dashboard', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        updateDashboardStats(data);
        renderCriticalAlerts(data.criticalAlerts);
    } catch (err) {
        console.error('Failed to load dashboard:', err);
    }
}

function updateDashboardStats(data) {
    const { summary, latestVariances } = data;

    document.getElementById('anomalies-count').textContent = summary.totalAnomalies;
    document.getElementById('critical-alerts').textContent = summary.criticalAlerts;

    if (latestVariances.length > 0) {
        const latest = latestVariances[0];
        document.getElementById('utilization-rate').textContent =
            `${latest.summary.utilizationRate.toFixed(1)}%`;

        const variance = latest.summary.totalVariance;
        const varianceEl = document.getElementById('total-variance');
        varianceEl.textContent = `₹${Math.abs(variance).toLocaleString()}`;
        varianceEl.style.color = variance >= 0 ? '#ff6b6b' : '#64ffda';
    }
}

async function loadBudgetAnalytics() {
    const budgetId = document.getElementById('budget-selector').value;
    if (!budgetId) return;

    currentBudgetId = budgetId;

    // Load latest variance
    await loadLatestVariance(budgetId);

    // Load forecast
    await loadLatestForecast(budgetId);

    // Load optimization recommendations
    await loadOptimizationRecommendations(budgetId);

    // Load trend
    await loadUtilizationTrend(budgetId);
}

async function loadLatestVariance(budgetId) {
    try {
        const res = await fetch(`/api/budget-analytics/variances?budgetId=${budgetId}&limit=1`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        if (data.length > 0) {
            currentVariance = data[0];
            renderVarianceHeatmap(currentVariance.items);
            renderCategoryDistribution(currentVariance.items);
        }
    } catch (err) {
        console.error('Failed to load variance:', err);
    }
}

function renderVarianceHeatmap(items) {
    const container = document.getElementById('variance-heatmap');

    if (!items || items.length === 0) {
        container.innerHTML = '<div class="empty-state">No variance data available.</div>';
        return;
    }

    container.innerHTML = items.map(item => {
        const intensity = Math.min(Math.abs(item.variancePercentage) / 100, 1);
        const color = item.varianceType === 'unfavorable'
            ? `rgba(255, 107, 107, ${intensity})`
            : `rgba(100, 255, 218, ${intensity})`;

        return `
            <div class="variance-cell" style="background: ${color};">
                <div class="cell-header">
                    <strong>${item.category}</strong>
                    ${item.isAnomaly ? '<span class="anomaly-badge"><i class="fas fa-exclamation-circle"></i></span>' : ''}
                </div>
                <div class="cell-stats">
                    <div class="stat-item">
                        <label>Budgeted:</label>
                        <span>₹${item.budgetedAmount.toLocaleString()}</span>
                    </div>
                    <div class="stat-item">
                        <label>Actual:</label>
                        <span>₹${item.actualAmount.toLocaleString()}</span>
                    </div>
                    <div class="stat-item">
                        <label>Variance:</label>
                        <span class="${item.varianceType}">
                            ${item.variancePercentage > 0 ? '+' : ''}${item.variancePercentage.toFixed(1)}%
                        </span>
                    </div>
                    ${item.isAnomaly ? `
                        <div class="stat-item">
                            <label>Anomaly Score:</label>
                            <span class="anomaly-score">${item.anomalyScore.toFixed(0)}/100</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function filterVariances() {
    const filter = document.getElementById('variance-filter').value;

    if (!currentVariance) return;

    let filtered = currentVariance.items;

    if (filter === 'unfavorable') {
        filtered = currentVariance.items.filter(i => i.varianceType === 'unfavorable');
    } else if (filter === 'anomalies') {
        filtered = currentVariance.items.filter(i => i.isAnomaly);
    }

    renderVarianceHeatmap(filtered);
}

async function loadLatestForecast(budgetId) {
    try {
        const res = await fetch(`/api/budget-analytics/forecasts?budgetId=${budgetId}&limit=1`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        if (data.length > 0) {
            renderForecastChart(data[0]);
            renderForecastSummary(data[0]);
        }
    } catch (err) {
        console.error('Failed to load forecast:', err);
    }
}

function renderForecastChart(forecast) {
    const ctx = document.getElementById('forecastChart').getContext('2d');

    if (forecastChart) {
        forecastChart.destroy();
    }

    const labels = forecast.dataPoints.map(dp =>
        new Date(dp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    );

    forecastChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Predicted Spend',
                    data: forecast.dataPoints.map(dp => dp.predictedAmount),
                    borderColor: '#48dbfb',
                    backgroundColor: 'rgba(72, 219, 251, 0.1)',
                    fill: false,
                    tension: 0.4,
                    borderWidth: 2
                },
                {
                    label: 'Upper Bound (95% CI)',
                    data: forecast.dataPoints.map(dp => dp.upperBound),
                    borderColor: 'rgba(255, 159, 67, 0.5)',
                    backgroundColor: 'rgba(255, 159, 67, 0.05)',
                    fill: '+1',
                    tension: 0.4,
                    borderWidth: 1,
                    borderDash: [5, 5]
                },
                {
                    label: 'Lower Bound (95% CI)',
                    data: forecast.dataPoints.map(dp => dp.lowerBound),
                    borderColor: 'rgba(100, 255, 218, 0.5)',
                    backgroundColor: 'rgba(100, 255, 218, 0.05)',
                    fill: false,
                    tension: 0.4,
                    borderWidth: 1,
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#8892b0', font: { size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `${context.dataset.label}: ₹${context.parsed.y.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#8892b0', font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: {
                        color: '#8892b0',
                        callback: function (value) {
                            return '₹' + value.toLocaleString();
                        }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function renderForecastSummary(forecast) {
    const container = document.getElementById('forecast-summary');

    container.innerHTML = `
        <div class="forecast-stats">
            <div class="forecast-stat">
                <label>Total Predicted:</label>
                <span>₹${forecast.summary.totalPredicted.toLocaleString()}</span>
            </div>
            <div class="forecast-stat">
                <label>Average Daily:</label>
                <span>₹${forecast.summary.averageDaily.toLocaleString()}</span>
            </div>
            <div class="forecast-stat">
                <label>Trend:</label>
                <span class="trend-${forecast.summary.trend}">
                    ${forecast.summary.trend} 
                    ${forecast.summary.trendStrength ? `(${(forecast.summary.trendStrength * 100).toFixed(0)}%)` : ''}
                </span>
            </div>
            <div class="forecast-stat">
                <label>Method:</label>
                <span>${forecast.forecastMethod.replace('_', ' ')}</span>
            </div>
        </div>
        ${forecast.alerts.length > 0 ? `
            <div class="forecast-alerts">
                <strong>Forecast Alerts:</strong>
                ${forecast.alerts.map(a => `
                    <div class="forecast-alert ${a.severity}">
                        <i class="fas fa-exclamation-triangle"></i>
                        ${a.message}
                    </div>
                `).join('')}
            </div>
        ` : ''}
    `;
}

async function loadOptimizationRecommendations(budgetId) {
    try {
        const res = await fetch(`/api/budget-analytics/optimize/${budgetId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderRecommendations(data.recommendations, data.optimizationScore);
    } catch (err) {
        console.error('Failed to load recommendations:', err);
    }
}

function renderRecommendations(recommendations, score) {
    const container = document.getElementById('recommendations-list');

    if (!recommendations || recommendations.length === 0) {
        container.innerHTML = '<div class="empty-state">No optimization recommendations available.</div>';
        return;
    }

    container.innerHTML = `
        <div class="optimization-score">
            <label>Optimization Score:</label>
            <div class="score-bar">
                <div class="score-fill" style="width: ${score}%; background: ${score > 70 ? '#64ffda' : score > 40 ? '#ff9f43' : '#ff6b6b'};"></div>
            </div>
            <span>${score.toFixed(1)}%</span>
        </div>
        <div class="recommendations-grid">
            ${recommendations.map((rec, index) => `
                <div class="recommendation-card glass-card-sm priority-${rec.priority}">
                    <div class="rec-header">
                        <input type="checkbox" class="rec-checkbox" data-index="${index}">
                        <span class="priority-badge ${rec.priority}">${rec.priority}</span>
                        <span class="rec-type">${rec.type.replace('_', ' ')}</span>
                    </div>
                    <div class="rec-content">
                        <div class="rec-action">
                            <strong>${rec.action.replace('_', ' ')}</strong>
                            ${rec.category ? `<span class="category-tag">${rec.category}</span>` : ''}
                        </div>
                        ${rec.from && rec.to ? `
                            <div class="rec-transfer">
                                <span class="from">${rec.from}</span>
                                <i class="fas fa-arrow-right"></i>
                                <span class="to">${rec.to}</span>
                            </div>
                        ` : ''}
                        <div class="rec-amount">
                            Amount: <strong>₹${rec.amount.toLocaleString()}</strong>
                        </div>
                        <div class="rec-rationale">
                            ${rec.rationale}
                        </div>
                        <div class="rec-impact">
                            <i class="fas fa-lightbulb"></i> ${rec.expectedImpact}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // Add event listeners to checkboxes
    document.querySelectorAll('.rec-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            if (e.target.checked) {
                selectedRecommendations.push(index);
            } else {
                selectedRecommendations = selectedRecommendations.filter(i => i !== index);
            }
        });
    });
}

async function loadUtilizationTrend(budgetId) {
    try {
        const res = await fetch(`/api/budget-analytics/variance/trend/${budgetId}?months=6`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderUtilizationTrend(data);
    } catch (err) {
        console.error('Failed to load trend:', err);
    }
}

function renderUtilizationTrend(trend) {
    if (!trend || trend.length === 0) return;

    const ctx = document.getElementById('utilizationTrendChart').getContext('2d');

    if (utilizationTrendChart) {
        utilizationTrendChart.destroy();
    }

    utilizationTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trend.map(t => new Date(t.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })),
            datasets: [{
                label: 'Utilization Rate (%)',
                data: trend.map(t => t.utilizationRate),
                borderColor: '#48dbfb',
                backgroundColor: 'rgba(72, 219, 251, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: '#8892b0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: { color: '#8892b0' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    min: 0,
                    max: 150
                }
            }
        }
    });
}

function renderCategoryDistribution(items) {
    if (!items || items.length === 0) return;

    const ctx = document.getElementById('categoryDistChart').getContext('2d');

    if (categoryDistChart) {
        categoryDistChart.destroy();
    }

    categoryDistChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: items.map(i => i.category),
            datasets: [{
                data: items.map(i => i.actualAmount),
                backgroundColor: [
                    '#64ffda', '#48dbfb', '#ff9f43', '#ff6b6b', '#a29bfe', '#fd79a8'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#8892b0', font: { size: 10 } }
                }
            }
        }
    });
}

function renderCriticalAlerts(alerts) {
    const container = document.getElementById('alerts-list');

    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<div class="empty-state">No critical alerts.</div>';
        return;
    }

    container.innerHTML = alerts.slice(0, 10).map(alert => `
        <div class="alert-card glass-card-sm ${alert.severity}">
            <div class="alert-icon">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <div class="alert-content">
                <div class="alert-header">
                    <strong>${alert.category}</strong>
                    <span class="severity-badge ${alert.severity}">${alert.severity}</span>
                </div>
                <p>${alert.message}</p>
                <div class="alert-action">
                    <i class="fas fa-lightbulb"></i> ${alert.recommendedAction}
                </div>
            </div>
        </div>
    `).join('');
}

function runVarianceAnalysis() {
    if (!currentBudgetId) {
        alert('Please select a budget first');
        return;
    }
    document.getElementById('variance-modal').classList.remove('hidden');
}

function closeVarianceModal() {
    document.getElementById('variance-modal').classList.add('hidden');
}

function generateForecast() {
    if (!currentBudgetId) {
        alert('Please select a budget first');
        return;
    }
    document.getElementById('forecast-modal').classList.remove('hidden');
}

function closeForecastModal() {
    document.getElementById('forecast-modal').classList.add('hidden');
}

async function applySelectedRecommendations() {
    if (!currentBudgetId || selectedRecommendations.length === 0) {
        alert('Please select recommendations to apply');
        return;
    }

    if (!confirm(`Apply ${selectedRecommendations.length} recommendation(s)?`)) return;

    try {
        const res = await fetch(`/api/budget-analytics/optimize/${currentBudgetId}/apply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ recommendationIds: selectedRecommendations })
        });

        const { data } = await res.json();

        alert(`Successfully applied ${data.appliedCount} recommendation(s)`);
        selectedRecommendations = [];
        loadBudgetAnalytics();
    } catch (err) {
        console.error('Failed to apply recommendations:', err);
        alert('Failed to apply recommendations');
    }
}

function setupForms() {
    document.getElementById('variance-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const startDate = document.getElementById('variance-start-date').value;
        const endDate = document.getElementById('variance-end-date').value;

        try {
            const res = await fetch('/api/budget-analytics/variance/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    budgetId: currentBudgetId,
                    startDate,
                    endDate
                })
            });

            const { data } = await res.json();

            alert('Variance analysis completed!');
            closeVarianceModal();
            loadBudgetAnalytics();
        } catch (err) {
            console.error('Failed to run analysis:', err);
            alert('Failed to run variance analysis');
        }
    });

    document.getElementById('forecast-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const category = document.getElementById('forecast-category').value;
        const forecastDays = document.getElementById('forecast-days').value;
        const historicalDays = document.getElementById('historical-days').value;
        const method = document.getElementById('forecast-method').value;

        try {
            const res = await fetch('/api/budget-analytics/forecast/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    budgetId: currentBudgetId,
                    category: category || undefined,
                    forecastDays: parseInt(forecastDays),
                    historicalDays: parseInt(historicalDays),
                    method
                })
            });

            const { data } = await res.json();

            alert('Forecast generated successfully!');
            closeForecastModal();
            loadBudgetAnalytics();
        } catch (err) {
            console.error('Failed to generate forecast:', err);
            alert('Failed to generate forecast: ' + err.message);
        }
    });
}
