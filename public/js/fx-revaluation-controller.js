/**
 * FX Revaluation Controller
 * Handles all FX revaluation and gain/loss tracking UI logic
 */

let exposureChart = null;
let trendChart = null;
let sensitivityChart = null;
let currentPositions = [];

document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    loadUnrealizedPositions();
    loadRevaluationHistory();
    loadGainLossTrend();
    loadTopPositions();
    loadVaR();
    loadSensitivityAnalysis();
    setupForms();
});

async function loadDashboard() {
    try {
        const res = await fetch('/api/fx-revaluation/dashboard', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        updateDashboardStats(data);
        renderCurrencyExposure(data.currencyExposure);
    } catch (err) {
        console.error('Failed to load dashboard:', err);
    }
}

function updateDashboardStats(data) {
    const unrealized = data.unrealizedPositions;

    document.getElementById('unrealized-gain').textContent = `₹${unrealized.totalGain.toLocaleString()}`;
    document.getElementById('unrealized-loss').textContent = `₹${unrealized.totalLoss.toLocaleString()}`;

    const netPosition = unrealized.netPosition;
    const netElement = document.getElementById('net-position');
    netElement.textContent = `₹${Math.abs(netPosition).toLocaleString()}`;
    netElement.style.color = netPosition >= 0 ? '#64ffda' : '#ff6b6b';

    document.getElementById('active-positions').textContent = unrealized.total;
}

async function loadUnrealizedPositions() {
    try {
        const res = await fetch('/api/fx-revaluation/unrealized-positions', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        currentPositions = data;
        renderPositions(data);
        populateCurrencyFilter(data);
    } catch (err) {
        console.error('Failed to load positions:', err);
    }
}

function renderPositions(positions) {
    const list = document.getElementById('positions-list');

    if (!positions || positions.length === 0) {
        list.innerHTML = '<div class="empty-state">No unrealized positions found.</div>';
        return;
    }

    list.innerHTML = positions.map(pos => `
        <div class="position-card glass-card-sm ${pos.gainLossType}" onclick="viewPositionDetails('${pos._id}')">
            <div class="position-header">
                <div class="position-info">
                    <strong>${pos.accountName}</strong>
                    <span class="currency-badge">${pos.currency}</span>
                </div>
                <span class="gl-badge ${pos.gainLossType}">
                    ${pos.gainLossType === 'gain' ? '+' : ''}${pos.gainLossPercentage.toFixed(2)}%
                </span>
            </div>
            <div class="position-details">
                <div class="detail-row">
                    <label>Original Amount:</label>
                    <span>${pos.originalAmount.toLocaleString()} ${pos.currency}</span>
                </div>
                <div class="detail-row">
                    <label>Original Rate:</label>
                    <span>${pos.originalRate.toFixed(4)}</span>
                </div>
                <div class="detail-row">
                    <label>Current Rate:</label>
                    <span>${pos.currentRate.toFixed(4)}</span>
                </div>
                <div class="detail-row">
                    <label>Unrealized ${pos.gainLossType}:</label>
                    <span class="gl-amount ${pos.gainLossType}">
                        ₹${Math.abs(pos.unrealizedGainLoss).toLocaleString()}
                    </span>
                </div>
            </div>
        </div>
    `).join('');
}

function populateCurrencyFilter(positions) {
    const currencies = [...new Set(positions.map(p => p.currency))];
    const select = document.getElementById('currency-filter');

    const options = currencies.map(curr =>
        `<option value="${curr}">${curr}</option>`
    ).join('');

    select.innerHTML = '<option value="">All Currencies</option>' + options;
}

function filterPositions() {
    const currency = document.getElementById('currency-filter').value;

    if (!currency) {
        renderPositions(currentPositions);
    } else {
        const filtered = currentPositions.filter(p => p.currency === currency);
        renderPositions(filtered);
    }
}

function renderCurrencyExposure(exposure) {
    if (!exposure || exposure.length === 0) return;

    const ctx = document.getElementById('exposureChart').getContext('2d');

    if (exposureChart) {
        exposureChart.destroy();
    }

    exposureChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: exposure.map(e => e.currency),
            datasets: [{
                data: exposure.map(e => Math.abs(e.totalExposure)),
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
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `${context.label}: ₹${context.parsed.toLocaleString()}`;
                        }
                    }
                }
            }
        }
    });
}

async function loadRevaluationHistory() {
    try {
        const res = await fetch('/api/fx-revaluation/revaluations?limit=10', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderRevaluationHistory(data);
    } catch (err) {
        console.error('Failed to load revaluation history:', err);
    }
}

function renderRevaluationHistory(revaluations) {
    const container = document.getElementById('revaluation-history');

    if (!revaluations || revaluations.length === 0) {
        container.innerHTML = '<div class="empty-state">No revaluation history found.</div>';
        return;
    }

    container.innerHTML = revaluations.map(rev => `
        <div class="revaluation-card glass-card-sm">
            <div class="rev-header">
                <div class="rev-info">
                    <strong>${new Date(rev.revaluationDate).toLocaleDateString()}</strong>
                    <span class="rev-id">${rev.revaluationId}</span>
                </div>
                <span class="rev-type">${rev.revaluationType}</span>
            </div>
            <div class="rev-summary">
                <div class="summary-item">
                    <label>Accounts:</label>
                    <span>${rev.summary.totalAccounts}</span>
                </div>
                <div class="summary-item">
                    <label>Net G/L:</label>
                    <span class="${rev.summary.netGainLoss >= 0 ? 'gain' : 'loss'}">
                        ₹${Math.abs(rev.summary.netGainLoss).toLocaleString()}
                    </span>
                </div>
                <div class="summary-item">
                    <label>Currencies:</label>
                    <span>${rev.summary.currenciesRevalued.join(', ')}</span>
                </div>
            </div>
        </div>
    `).join('');
}

async function loadGainLossTrend() {
    try {
        const res = await fetch('/api/fx-revaluation/gain-loss/trend?months=12', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderTrendChart(data);
    } catch (err) {
        console.error('Failed to load trend:', err);
    }
}

function renderTrendChart(trend) {
    if (!trend || trend.length === 0) return;

    const ctx = document.getElementById('trendChart').getContext('2d');

    if (trendChart) {
        trendChart.destroy();
    }

    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trend.map(t => new Date(t.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })),
            datasets: [
                {
                    label: 'Gain',
                    data: trend.map(t => t.gain),
                    borderColor: '#64ffda',
                    backgroundColor: 'rgba(100, 255, 218, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Loss',
                    data: trend.map(t => t.loss),
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Net',
                    data: trend.map(t => t.net),
                    borderColor: '#48dbfb',
                    backgroundColor: 'rgba(72, 219, 251, 0.1)',
                    fill: false,
                    tension: 0.4,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#8892b0' }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#8892b0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: { color: '#8892b0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

async function loadTopPositions() {
    try {
        const res = await fetch('/api/fx-revaluation/gain-loss/top-positions?limit=5', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderTopGains(data.topGains);
        renderTopLosses(data.topLosses);
    } catch (err) {
        console.error('Failed to load top positions:', err);
    }
}

function renderTopGains(gains) {
    const container = document.getElementById('top-gains');

    if (!gains || gains.length === 0) {
        container.innerHTML = '<div class="empty-state">No gains to display.</div>';
        return;
    }

    container.innerHTML = gains.map(pos => `
        <div class="top-position-item gain">
            <div class="position-name">${pos.accountName}</div>
            <div class="position-currency">${pos.currency}</div>
            <div class="position-amount">+₹${Math.abs(pos.unrealizedGainLoss).toLocaleString()}</div>
        </div>
    `).join('');
}

function renderTopLosses(losses) {
    const container = document.getElementById('top-losses');

    if (!losses || losses.length === 0) {
        container.innerHTML = '<div class="empty-state">No losses to display.</div>';
        return;
    }

    container.innerHTML = losses.map(pos => `
        <div class="top-position-item loss">
            <div class="position-name">${pos.accountName}</div>
            <div class="position-currency">${pos.currency}</div>
            <div class="position-amount">-₹${Math.abs(pos.unrealizedGainLoss).toLocaleString()}</div>
        </div>
    `).join('');
}

async function loadVaR() {
    try {
        const res = await fetch('/api/fx-revaluation/risk/var?confidenceLevel=0.95', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderVaR(data);
    } catch (err) {
        console.error('Failed to load VaR:', err);
    }
}

function renderVaR(varData) {
    const container = document.getElementById('var-display');

    container.innerHTML = `
        <div class="var-summary">
            <div class="var-value">
                <label>Value at Risk (95%)</label>
                <h2>₹${varData.var.toLocaleString()}</h2>
            </div>
            <div class="var-info">
                <p>Based on ${varData.positions} active positions</p>
                <p class="var-note">Maximum expected loss with 95% confidence over 1 day</p>
            </div>
        </div>
    `;
}

async function loadSensitivityAnalysis() {
    try {
        const res = await fetch('/api/fx-revaluation/risk/sensitivity', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderSensitivityChart(data);
    } catch (err) {
        console.error('Failed to load sensitivity analysis:', err);
    }
}

function renderSensitivityChart(scenarios) {
    if (!scenarios || scenarios.length === 0) return;

    const ctx = document.getElementById('sensitivityChart').getContext('2d');

    if (sensitivityChart) {
        sensitivityChart.destroy();
    }

    sensitivityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: scenarios.map(s => `${s.rateChange > 0 ? '+' : ''}${s.rateChange}%`),
            datasets: [{
                label: 'Impact on P&L',
                data: scenarios.map(s => s.impact),
                backgroundColor: scenarios.map(s => s.impact >= 0 ? 'rgba(100, 255, 218, 0.6)' : 'rgba(255, 107, 107, 0.6)'),
                borderColor: scenarios.map(s => s.impact >= 0 ? '#64ffda' : '#ff6b6b'),
                borderWidth: 1
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
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

async function runRevaluation() {
    if (!confirm('Run FX revaluation for all foreign currency accounts?')) return;

    try {
        const res = await fetch('/api/fx-revaluation/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                baseCurrency: 'INR',
                revaluationType: 'manual'
            })
        });

        const { data } = await res.json();

        alert(`Revaluation completed!\nNet G/L: ₹${data.summary.netGainLoss.toLocaleString()}\nAccounts: ${data.summary.totalAccounts}`);

        // Reload dashboard
        loadDashboard();
        loadUnrealizedPositions();
        loadRevaluationHistory();
    } catch (err) {
        console.error('Failed to run revaluation:', err);
        alert('Failed to run revaluation');
    }
}

function generateComplianceReport() {
    document.getElementById('compliance-modal').classList.remove('hidden');
}

function closeComplianceModal() {
    document.getElementById('compliance-modal').classList.add('hidden');
}

function closePositionModal() {
    document.getElementById('position-details-modal').classList.add('hidden');
}

async function viewPositionDetails(positionId) {
    // Implementation for viewing detailed position information
    console.log('View position:', positionId);
}

function setupForms() {
    document.getElementById('compliance-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const startDate = document.getElementById('report-start-date').value;
        const endDate = document.getElementById('report-end-date').value;

        try {
            const res = await fetch('/api/fx-revaluation/reports/compliance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ startDate, endDate })
            });

            const { data } = await res.json();

            // Display report
            const reportContent = document.getElementById('compliance-report-content');
            reportContent.innerHTML = `
                <div class="compliance-report">
                    <h4>Compliance Report: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}</h4>
                    <div class="report-summary">
                        <div class="summary-row">
                            <label>Unrealized Gain:</label>
                            <span class="gain">₹${data.summary.unrealizedGain.toLocaleString()}</span>
                        </div>
                        <div class="summary-row">
                            <label>Unrealized Loss:</label>
                            <span class="loss">₹${data.summary.unrealizedLoss.toLocaleString()}</span>
                        </div>
                        <div class="summary-row">
                            <label>Realized Gain:</label>
                            <span class="gain">₹${data.summary.realizedGain.toLocaleString()}</span>
                        </div>
                        <div class="summary-row">
                            <label>Realized Loss:</label>
                            <span class="loss">₹${data.summary.realizedLoss.toLocaleString()}</span>
                        </div>
                        <div class="summary-row total">
                            <label>Total Net:</label>
                            <span class="${data.summary.totalNet >= 0 ? 'gain' : 'loss'}">
                                ₹${Math.abs(data.summary.totalNet).toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            `;
            reportContent.classList.remove('hidden');
        } catch (err) {
            console.error('Failed to generate report:', err);
        }
    });
}
