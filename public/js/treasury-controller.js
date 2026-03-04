/**
 * Treasury Dashboard Controller
 * Handles all treasury management UI logic
 */

let runwayChart = null;
let vaultDistChart = null;
let currentForecastData = null;

document.addEventListener('DOMContentLoaded', () => {
    loadTreasuryDashboard();
    loadVaults();
    loadThresholds();
    loadHedges();
    setupForms();
});

async function loadTreasuryDashboard() {
    try {
        const res = await fetch('/api/treasury/dashboard', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        updateDashboardMetrics(data);
        loadForecast();
    } catch (err) {
        console.error('Failed to load treasury dashboard:', err);
    }
}

function updateDashboardMetrics(data) {
    document.getElementById('total-liquidity').textContent = `₹${data.totalLiquidity.toLocaleString()}`;
    document.getElementById('cash-runway').textContent = `${data.cashRunway} days`;
    document.getElementById('health-score').textContent = `${data.healthScore}%`;

    const healthFill = document.getElementById('health-fill');
    healthFill.style.width = `${data.healthScore}%`;
    healthFill.style.backgroundColor = data.healthScore > 70 ? '#64ffda' : data.healthScore > 40 ? '#ff9f43' : '#ff6b6b';

    const runwayTrend = document.getElementById('runway-trend');
    if (data.cashRunway < 30) {
        runwayTrend.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Critical';
        runwayTrend.className = 'metric-trend negative';
    } else if (data.cashRunway < 60) {
        runwayTrend.innerHTML = '<i class="fas fa-exclamation-circle"></i> Warning';
        runwayTrend.className = 'metric-trend warning';
    } else {
        runwayTrend.innerHTML = '<i class="fas fa-check-circle"></i> Healthy';
        runwayTrend.className = 'metric-trend positive';
    }

    // Update portfolio metrics
    if (data.portfolio) {
        document.getElementById('sharpe-ratio').textContent = data.portfolio.sharpeRatio.toFixed(2);
        document.getElementById('var-95').textContent = `₹${data.portfolio.var95.toLocaleString()}`;
        document.getElementById('diversification').textContent = `${data.portfolio.diversificationScore}%`;
    }

    // Display violations
    if (data.violations && data.violations.length > 0) {
        showViolationAlerts(data.violations);
    }
}

function showViolationAlerts(violations) {
    const container = document.createElement('div');
    container.className = 'violations-alert glass-card';
    container.innerHTML = `
        <div class="alert-header">
            <i class="fas fa-exclamation-triangle"></i>
            <strong>${violations.length} Threshold Violation(s)</strong>
        </div>
        ${violations.map(v => `
            <div class="violation-item ${v.severity}">
                <span>${v.thresholdName}</span>
                <span>${v.vaultName}: ${v.currentValue.toFixed(2)} / ${v.triggerValue}</span>
            </div>
        `).join('')}
    `;

    const main = document.querySelector('.treasury-main');
    main.insertBefore(container, main.firstChild);
}

async function loadForecast() {
    try {
        const horizon = document.getElementById('forecast-horizon').value;
        const res = await fetch(`/api/treasury/forecast?days=${horizon}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        currentForecastData = data;
        renderForecastChart(data);
        renderInsights(data.insights);
    } catch (err) {
        console.error('Failed to load forecast:', err);
    }
}

function renderForecastChart(data) {
    const model = document.getElementById('forecast-model').value;
    const forecastData = data.forecasts[model];

    const ctx = document.getElementById('runwayChart').getContext('2d');

    if (runwayChart) {
        runwayChart.destroy();
    }

    runwayChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: forecastData.map(f => `Day ${f.day}`),
            datasets: [{
                label: 'Projected Balance',
                data: forecastData.map(f => f.balance),
                borderColor: '#64ffda',
                backgroundColor: 'rgba(100, 255, 218, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#8892b0' }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `Balance: ₹${context.parsed.y.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#8892b0',
                        maxTicksLimit: 10
                    },
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

function renderInsights(insights) {
    const container = document.getElementById('forecast-insights');
    if (!insights || insights.length === 0) {
        container.innerHTML = '<p class="no-insights">No critical insights at this time.</p>';
        return;
    }

    container.innerHTML = insights.map(insight => `
        <div class="insight-card ${insight.type}">
            <div class="insight-icon">
                <i class="fas ${getInsightIcon(insight.type)}"></i>
            </div>
            <div class="insight-content">
                <strong>${insight.message}</strong>
                ${insight.recommendation ? `<p>${insight.recommendation}</p>` : ''}
            </div>
            <span class="severity-badge ${insight.severity}">${insight.severity}</span>
        </div>
    `).join('');
}

function getInsightIcon(type) {
    const icons = {
        'critical': 'fa-exclamation-circle',
        'warning': 'fa-exclamation-triangle',
        'positive': 'fa-check-circle',
        'info': 'fa-info-circle'
    };
    return icons[type] || 'fa-info-circle';
}

async function loadVaults() {
    try {
        const res = await fetch('/api/treasury/vaults', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderVaults(data);
        renderVaultDistribution(data);
        populateVaultDropdowns(data);
    } catch (err) {
        console.error('Failed to load vaults:', err);
    }
}

function renderVaults(vaults) {
    const list = document.getElementById('vaults-list');
    if (!vaults || vaults.length === 0) {
        list.innerHTML = '<div class="empty-state">No vaults created yet.</div>';
        return;
    }

    list.innerHTML = vaults.map(vault => `
        <div class="vault-card glass-card">
            <div class="vault-header">
                <div class="vault-icon ${vault.vaultType}">
                    <i class="fas ${getVaultIcon(vault.vaultType)}"></i>
                </div>
                <div class="vault-info">
                    <strong>${vault.vaultName}</strong>
                    <span>${vault.currency}</span>
                </div>
            </div>
            <div class="vault-balance">
                <label>Available</label>
                <h3>₹${vault.availableLiquidity.toLocaleString()}</h3>
            </div>
            <div class="vault-stats">
                <div class="stat">
                    <label>Total</label>
                    <span>₹${vault.balance.toLocaleString()}</span>
                </div>
                <div class="stat">
                    <label>Allocated</label>
                    <span>₹${vault.allocatedFunds.toLocaleString()}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function getVaultIcon(type) {
    const icons = {
        'operating': 'fa-wallet',
        'reserve': 'fa-piggy-bank',
        'investment': 'fa-chart-line',
        'forex': 'fa-exchange-alt'
    };
    return icons[type] || 'fa-vault';
}

function renderVaultDistribution(vaults) {
    const ctx = document.getElementById('vaultDistChart').getContext('2d');

    if (vaultDistChart) {
        vaultDistChart.destroy();
    }

    vaultDistChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: vaults.map(v => v.vaultName),
            datasets: [{
                data: vaults.map(v => v.balance),
                backgroundColor: ['#64ffda', '#48dbfb', '#ff9f43', '#ff6b6b', '#54a0ff'],
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

function populateVaultDropdowns(vaults) {
    const select = document.getElementById('threshold-vault');
    if (select) {
        select.innerHTML = vaults.map(v =>
            `<option value="${v._id}">${v.vaultName}</option>`
        ).join('');
    }
}

async function loadThresholds() {
    try {
        const res = await fetch('/api/treasury/thresholds', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderThresholds(data);
    } catch (err) {
        console.error('Failed to load thresholds:', err);
    }
}

function renderThresholds(thresholds) {
    const list = document.getElementById('thresholds-list');
    if (!thresholds || thresholds.length === 0) {
        list.innerHTML = '<div class="empty-state">No thresholds configured.</div>';
        return;
    }

    list.innerHTML = thresholds.map(t => `
        <div class="threshold-item">
            <div class="threshold-info">
                <strong>${t.thresholdName}</strong>
                <span class="severity-pill ${t.severity}">${t.severity}</span>
            </div>
            <div class="threshold-value">
                ${t.triggerValue} ${t.thresholdType === 'percentage' ? '%' : t.thresholdType === 'runway_days' ? 'days' : ''}
            </div>
        </div>
    `).join('');
}

async function loadHedges() {
    try {
        const res = await fetch('/api/treasury/hedges', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderHedges(data);
    } catch (err) {
        console.error('Failed to load hedges:', err);
    }
}

function renderHedges(hedges) {
    const list = document.getElementById('hedges-list');
    if (!hedges || hedges.length === 0) {
        list.innerHTML = '<div class="empty-state">No FX hedges active.</div>';
        return;
    }

    list.innerHTML = hedges.map(h => `
        <div class="hedge-item">
            <div class="hedge-pair">
                <strong>${h.baseCurrency}/${h.targetCurrency}</strong>
                <span class="hedge-type">${h.hedgeType.replace('_', ' ')}</span>
            </div>
            <div class="hedge-details">
                <div class="detail">
                    <label>Notional</label>
                    <span>${h.notionalAmount.toLocaleString()}</span>
                </div>
                <div class="detail">
                    <label>Rate</label>
                    <span>${h.contractRate}</span>
                </div>
                <div class="detail ${h.effectiveness.gainLoss >= 0 ? 'positive' : 'negative'}">
                    <label>MTM</label>
                    <span>${h.effectiveness.gainLoss >= 0 ? '+' : ''}${h.effectiveness.gainLoss.toLocaleString()}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function updateForecast() {
    loadForecast();
}

// Modal Functions
function openVaultModal() {
    document.getElementById('vault-modal').classList.remove('hidden');
}

function closeVaultModal() {
    document.getElementById('vault-modal').classList.add('hidden');
}

function openThresholdModal() {
    document.getElementById('threshold-modal').classList.remove('hidden');
}

function closeThresholdModal() {
    document.getElementById('threshold-modal').classList.add('hidden');
}

function openHedgeModal() {
    document.getElementById('hedge-modal').classList.remove('hidden');
}

function closeHedgeModal() {
    document.getElementById('hedge-modal').classList.add('hidden');
}

function setupForms() {
    // Vault Form
    document.getElementById('vault-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const vaultData = {
            vaultName: document.getElementById('vault-name').value,
            vaultType: document.getElementById('vault-type').value,
            currency: document.getElementById('vault-currency').value,
            balance: parseFloat(document.getElementById('vault-balance').value)
        };

        try {
            const res = await fetch('/api/treasury/vaults', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(vaultData)
            });

            if (res.ok) {
                closeVaultModal();
                loadVaults();
                loadTreasuryDashboard();
            }
        } catch (err) {
            console.error('Failed to create vault:', err);
        }
    });

    // Threshold Form
    document.getElementById('threshold-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const thresholdData = {
            thresholdName: document.getElementById('threshold-name').value,
            vaultId: document.getElementById('threshold-vault').value,
            thresholdType: document.getElementById('threshold-type').value,
            triggerValue: parseFloat(document.getElementById('threshold-value').value),
            severity: document.getElementById('threshold-severity').value,
            alertChannels: ['dashboard', 'email']
        };

        try {
            const res = await fetch('/api/treasury/thresholds', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(thresholdData)
            });

            if (res.ok) {
                closeThresholdModal();
                loadThresholds();
            }
        } catch (err) {
            console.error('Failed to create threshold:', err);
        }
    });

    // Hedge Form
    document.getElementById('hedge-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const hedgeData = {
            baseCurrency: document.getElementById('hedge-base').value,
            targetCurrency: document.getElementById('hedge-target').value,
            hedgeType: document.getElementById('hedge-type').value,
            notionalAmount: parseFloat(document.getElementById('hedge-amount').value),
            contractRate: parseFloat(document.getElementById('hedge-rate').value),
            maturityDate: document.getElementById('hedge-maturity').value
        };

        try {
            const res = await fetch('/api/treasury/hedges', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(hedgeData)
            });

            if (res.ok) {
                closeHedgeModal();
                loadHedges();
            }
        } catch (err) {
            console.error('Failed to create hedge:', err);
        }
    });
}
