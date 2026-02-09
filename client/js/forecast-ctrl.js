/**
 * Forecast Controller
 * Issue #522: Intelligent Cash Flow Forecasting & Runway Analytics
 * Handles all frontend forecast logic and Chart.js visualization
 */

let forecastChart = null;
let currentForecast = null;
let showBounds = true;

// API Base URL
const API_BASE = window.location.origin + '/api';

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadLatestForecast();
    await checkAlerts();

    // Event listeners
    document.getElementById('generate-forecast-btn').addEventListener('click', generateNewForecast);
    document.getElementById('toggle-bounds').addEventListener('click', toggleConfidenceBounds);
    document.getElementById('custom-scenario-btn').addEventListener('click', openScenarioModal);
    document.getElementById('scenario-form').addEventListener('submit', handleScenarioSubmit);

    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('adjustment-date').valueAsDate = tomorrow;
});

/**
 * Load the latest forecast from the API
 */
async function loadLatestForecast() {
    try {
        showLoading();

        const response = await fetch(`${API_BASE}/forecast/latest`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success && data.data) {
            currentForecast = data.data;
            renderForecast(currentForecast);
            loadScenarios(currentForecast.scenarios || []);
        } else {
            showEmptyState();
        }
    } catch (error) {
        console.error('Error loading forecast:', error);
        showError('Failed to load forecast. Generate one to get started.');
    }
}

/**
 * Generate a new forecast
 */
async function generateNewForecast() {
    const btn = document.getElementById('generate-forecast-btn');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Generating...';

    try {
        const response = await fetch(`${API_BASE}/forecast/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                projectionDays: 180,
                includeScenarios: true
            })
        });

        const data = await response.json();

        if (data.success) {
            currentForecast = data.data;
            renderForecast(currentForecast);
            loadScenarios(currentForecast.scenarios || []);
            showSuccess('Forecast generated successfully!');
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('Error generating forecast:', error);
        showError('Failed to generate forecast. Please try again.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>🔮</span> Generate New Forecast';
    }
}

/**
 * Render the forecast data on the page
 */
function renderForecast(forecast) {
    // Update metrics
    updateMetrics(forecast);

    // Render chart
    renderChart(forecast);

    // Generate insights
    generateInsights(forecast);
}

/**
 * Update the metric cards
 */
function updateMetrics(forecast) {
    // Runway
    const runwayValue = document.getElementById('runway-value');
    const runwayLabel = document.getElementById('runway-label');

    if (forecast.predictedRunwayDays === null) {
        runwayValue.textContent = '∞';
        runwayValue.style.color = '#10b981';
        runwayLabel.textContent = 'Infinite runway (stable)';
    } else if (forecast.predictedRunwayDays <= 7) {
        runwayValue.textContent = `${forecast.predictedRunwayDays} days`;
        runwayValue.style.color = '#ef4444';
        runwayLabel.textContent = 'CRITICAL - Urgent action needed';
    } else if (forecast.predictedRunwayDays <= 30) {
        runwayValue.textContent = `${forecast.predictedRunwayDays} days`;
        runwayValue.style.color = '#f59e0b';
        runwayLabel.textContent = 'Warning - Monitor closely';
    } else {
        runwayValue.textContent = `${forecast.predictedRunwayDays} days`;
        runwayValue.style.color = '#10b981';
        runwayLabel.textContent = 'Healthy runway';
    }

    // Burn Rate
    document.getElementById('burn-value').textContent = `$${forecast.burnRate.toFixed(2)}`;

    // Confidence
    const confidenceValue = document.getElementById('confidence-value');
    confidenceValue.textContent = `${forecast.confidenceScore}%`;

    if (forecast.confidenceScore >= 70) {
        confidenceValue.style.color = '#10b981';
    } else if (forecast.confidenceScore >= 50) {
        confidenceValue.style.color = '#f59e0b';
    } else {
        confidenceValue.style.color = '#ef4444';
    }

    // Projected Balance
    const lastDataPoint = forecast.dataPoints[forecast.dataPoints.length - 1];
    const projectedValue = document.getElementById('projected-balance-value');
    projectedValue.textContent = `$${lastDataPoint.predictedBalance.toFixed(2)}`;

    if (lastDataPoint.predictedBalance >= forecast.startingBalance) {
        projectedValue.style.color = '#10b981';
    } else if (lastDataPoint.predictedBalance >= 0) {
        projectedValue.style.color = '#f59e0b';
    } else {
        projectedValue.style.color = '#ef4444';
    }
}

/**
 * Render the Chart.js forecast chart
 */
function renderChart(forecast) {
    const ctx = document.getElementById('forecast-chart').getContext('2d');

    // Destroy existing chart
    if (forecastChart) {
        forecastChart.destroy();
    }

    const labels = forecast.dataPoints.map(dp => {
        const date = new Date(dp.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const predictedData = forecast.dataPoints.map(dp => dp.predictedBalance);
    const upperBound = forecast.dataPoints.map(dp => dp.upperBound);
    const lowerBound = forecast.dataPoints.map(dp => dp.lowerBound);

    forecastChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Predicted Balance',
                    data: predictedData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 6
                },
                {
                    label: 'Upper Bound',
                    data: upperBound,
                    borderColor: 'rgba(59, 130, 246, 0.3)',
                    backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    tension: 0.4,
                    fill: '+1',
                    pointRadius: 0,
                    hidden: !showBounds
                },
                {
                    label: 'Lower Bound',
                    data: lowerBound,
                    borderColor: 'rgba(59, 130, 246, 0.3)',
                    backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    tension: 0.4,
                    fill: false,
                    pointRadius: 0,
                    hidden: !showBounds
                },
                {
                    label: 'Zero Line',
                    data: new Array(labels.length).fill(0),
                    borderColor: '#ef4444',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    pointRadius: 0,
                    fill: false
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
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            label += '$' + context.parsed.y.toFixed(2);
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function (value) {
                            return '$' + value.toLocaleString();
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

/**
 * Toggle confidence bounds visibility
 */
function toggleConfidenceBounds() {
    showBounds = !showBounds;

    if (forecastChart) {
        forecastChart.data.datasets[1].hidden = !showBounds;
        forecastChart.data.datasets[2].hidden = !showBounds;
        forecastChart.update();
    }

    const btn = document.getElementById('toggle-bounds');
    btn.textContent = showBounds ? 'Hide Confidence Bands' : 'Show Confidence Bands';
}

/**
 * Load and render scenario cards
 */
function loadScenarios(scenarios) {
    const container = document.getElementById('scenario-list');
    container.innerHTML = '';

    if (scenarios.length === 0) {
        container.innerHTML = '<p class="empty-text">No preset scenarios available. Create a custom one!</p>';
        return;
    }

    scenarios.forEach((scenario, index) => {
        const card = document.createElement('div');
        card.className = 'scenario-card';
        card.innerHTML = `
            <div class="scenario-header">
                <h4>${scenario.name}</h4>
                <span class="scenario-impact ${scenario.impactOnRunway > 0 ? 'positive' : 'negative'}">
                    ${scenario.impactOnRunway > 0 ? '+' : ''}${scenario.impactOnRunway} days
                </span>
            </div>
            <p class="scenario-description">${scenario.description}</p>
            <button class="btn-sm btn-outline" onclick="simulateScenario(${index})">
                Simulate This Scenario
            </button>
        `;
        container.appendChild(card);
    });
}

/** 
 * Simulate a preset scenario
 */
async function simulateScenario(scenarioIndex) {
    const scenario = currentForecast.scenarios[scenarioIndex];
    console.log('Simulating scenario:', scenario);

    try {
        const response = await fetch(`${API_BASE}/forecast/simulate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                adjustments: scenario.adjustments
            })
        });

        const data = await response.json();

        if (data.success) {
            visualizeSimulation(data.data);
        }
    } catch (error) {
        console.error('Error simulating scenario:', error);
        showError('Failed to simulate scenario');
    }
}

/**
 * Visualize simulation result
 */
function visualizeSimulation(simulation) {
    // For now, just show an alert. In a full implementation,
    // you would overlay the simulated projection on the chart
    alert(`Simulation Result:\n\nOriginal Runway: ${simulation.originalRunway} days\nSimulated Runway: ${simulation.simulatedRunway} days\nImpact: ${simulation.runwayImpact > 0 ? '+' : ''}${simulation.runwayImpact} days`);
}

/**
 * Generate AI insights
 */
function generateInsights(forecast) {
    const container = document.getElementById('insights-list');
    const insights = [];

    // Insight 1: Runway status
    if (forecast.predictedRunwayDays !== null && forecast.predictedRunwayDays <= 30) {
        insights.push({
            icon: '⚠️',
            title: 'Low Runway Alert',
            text: `You have only ${forecast.predictedRunwayDays} days of financial runway. Consider reducing expenses or increasing income.`,
            type: 'warning'
        });
    } else if (forecast.predictedRunwayDays === null) {
        insights.push({
            icon: '✅',
            title: 'Healthy Financial Position',
            text: 'Your current trajectory shows sustainable finances with no predicted negative balance.',
            type: 'success'
        });
    }

    // Insight 2: Burn rate
    if (forecast.burnRate > 0) {
        insights.push({
            icon: '🔥',
            title: 'Monthly Burn Rate',
            text: `You're currently spending $${forecast.burnRate.toFixed(2)} more than you earn each month. This is your net burn rate.`,
            type: 'info'
        });
    }

    // Insight 3: Confidence
    if (forecast.confidenceScore < 50) {
        insights.push({
            icon: '📊',
            title: 'Low Forecast Confidence',
            text: 'Add more transaction data and set up recurring expenses to improve forecast accuracy.',
            type: 'info'
        });
    }

    // Render insights
    container.innerHTML = insights.map(insight => `
        <div class="insight-card ${insight.type}">
            <span class="insight-icon">${insight.icon}</span>
            <div class="insight-content">
                <h4>${insight.title}</h4>
                <p>${insight.text}</p>
            </div>
        </div>
    `).join('');
}

/**
 * Check for alerts
 */
async function checkAlerts() {
    try {
        const response = await fetch(`${API_BASE}/forecast/alerts`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success && data.data.hasAlert && data.data.alerts.length > 0) {
            const topAlert = data.data.alerts[0];
            showAlert(topAlert.message, topAlert.severity);
        }
    } catch (error) {
        console.error('Error checking alerts:', error);
    }
}

/**
 * Modal controls
 */
function openScenarioModal() {
    document.getElementById('scenario-modal').classList.remove('hidden');
}

function closeScenarioModal() {
    document.getElementById('scenario-modal').classList.add('hidden');
    document.getElementById('scenario-form').reset();
}

/**
 * Handle custom scenario form submission
 */
async function handleScenarioSubmit(e) {
    e.preventDefault();

    const adjustments = [{
        type: document.getElementById('adjustment-type').value,
        amount: parseFloat(document.getElementById('adjustment-amount').value),
        startDate: document.getElementById('adjustment-date').value,
        description: document.getElementById('adjustment-description').value
    }];

    try {
        const response = await fetch(`${API_BASE}/forecast/simulate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ adjustments })
        });

        const data = await response.json();

        if (data.success) {
            visualizeSimulation(data.data);
            closeScenarioModal();
        }
    } catch (error) {
        console.error('Error simulating custom scenario:', error);
        showError('Failed to simulate scenario');
    }
}

/**
 * UI Helper Functions
 */
function showLoading() {
    // Implementation
}

function showEmptyState() {
    document.querySelector('.metrics-grid').innerHTML = `
        <div class="empty-state full-width">
            <h3>No Forecast Available</h3>
            <p>Click "Generate New Forecast" to create your first cash flow projection.</p>
        </div>
    `;
}

function showError(message) {
    showAlert(message, 'critical');
}

function showSuccess(message) {
    showAlert(message, 'info');
}

function showAlert(message, severity = 'info') {
    const banner = document.getElementById('alert-banner');
    const title = document.getElementById('alert-title');
    const messageEl = document.getElementById('alert-message');

    title.textContent = severity === 'critical' ? 'Error' : severity === 'warning' ? 'Warning' : 'Success';
    messageEl.textContent = message;

    banner.className = `alert-banner ${severity}`;
    banner.classList.remove('hidden');

    setTimeout(() => {
        closeAlert();
    }, 5000);
}

function closeAlert() {
    document.getElementById('alert-banner').classList.add('hidden');
}
