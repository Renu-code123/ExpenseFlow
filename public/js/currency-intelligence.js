/**
 * Currency Intelligence Controller
 * Issue #521: Advanced Multi-Currency Intelligence & Forex Revaluation
 */

const API_BASE = window.location.origin + '/api';
let baseCurrency = 'USD';
let exposureChart = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Get user's base currency (from localStorage or default)
    baseCurrency = localStorage.getItem('baseCurrency') || 'USD';
    document.getElementById('base-currency-selector').value = baseCurrency;

    // Set default dates (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    document.getElementById('end-date').valueAsDate = endDate;
    document.getElementById('start-date').valueAsDate = startDate;

    // Event listeners
    document.getElementById('base-currency-selector').addEventListener('change', handleBaseCurrencyChange);
    document.getElementById('refresh-rates-btn').addEventListener('click', refreshData);
    document.getElementById('clear-cache-btn').addEventListener('click', clearCache);
    document.getElementById('generate-report-btn').addEventListener('click', generateRevaluationReport);
    document.getElementById('convert-btn').addEventListener('click', handleQuickConvert);

    // Load initial data
    await loadAllData();
});

/**
 * Load all dashboard data
 */
async function loadAllData() {
    try {
        await Promise.all([
            loadCurrencyExposure(),
            loadPortfolioPL(),
            loadLiveRates(),
            loadRiskAssessment()
        ]);
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Failed to load currency data');
    }
}

/**
 * Load currency exposure and render chart
 */
async function loadCurrencyExposure() {
    try {
        const response = await fetch(`${API_BASE}/currency/exposure?baseCurrency=${baseCurrency}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            const exposure = data.data;

            // Update metrics
            document.getElementById('total-value').textContent =
                `${getCurrencySymbol(baseCurrency)}${exposure.totalValueInBase.toFixed(2)}`;
            document.getElementById('currencies-count').textContent = exposure.currenciesCount;
            document.getElementById('exposure-badge').textContent =
                `${exposure.currenciesCount} currencies tracked`;

            // Render chart
            renderExposureChart(exposure.exposures);
        }
    } catch (error) {
        console.error('Error loading exposure:', error);
    }
}

/**
 * Load portfolio P&L
 */
async function loadPortfolioPL() {
    try {
        const response = await fetch(`${API_BASE}/currency/portfolio-pl?baseCurrency=${baseCurrency}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            const plData = data.data;

            // Update P&L metric
            const plValue = document.getElementById('unrealized-pl');
            plValue.textContent = `${getCurrencySymbol(baseCurrency)}${plData.totalUnrealizedPL.toFixed(2)}`;
            plValue.style.color = plData.totalUnrealizedPL >= 0 ? '#10b981' : '#ef4444';

            // Render P&L list
            renderPLList(plData.accounts);
        }
    } catch (error) {
        console.error('Error loading P&L:', error);
    }
}

/**
 * Load live exchange rates
 */
async function loadLiveRates() {
    try {
        const response = await fetch(`${API_BASE}/currency/rates?base=${baseCurrency}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            renderRatesList(data.data.rates, data.data.cached);
        }
    } catch (error) {
        console.error('Error loading rates:', error);
    }
}

/**
 * Load risk assessment
 */
async function loadRiskAssessment() {
    try {
        const response = await fetch(`${API_BASE}/currency/risk-assessment?baseCurrency=${baseCurrency}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            const assessment = data.data;

            // Update risk metric
            const riskValue = document.getElementById('risk-level');
            riskValue.textContent = assessment.riskLevel.toUpperCase();

            if (assessment.riskLevel === 'high') {
                riskValue.style.color = '#ef4444';
            } else if (assessment.riskLevel === 'medium') {
                riskValue.style.color = '#f59e0b';
            } else {
                riskValue.style.color = '#10b981';
            }

            document.getElementById('risk-score-label').textContent = `Score: ${assessment.riskScore}/100`;

            // Render risk assessment
            renderRiskAssessment(assessment);
        }
    } catch (error) {
        console.error('Error loading risk assessment:', error);
    }
}

/**
 * Render exposure chart
 */
function renderExposureChart(exposures) {
    const ctx = document.getElementById('exposure-chart').getContext('2d');

    if (exposureChart) {
        exposureChart.destroy();
    }

    const labels = exposures.map(e => e.currency);
    const values = exposures.map(e => e.valueInBase);
    const percentages = exposures.map(e => e.percentage);

    const colors = generateColors(exposures.length);

    exposureChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#1a1a2e'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#ffffff',
                        generateLabels: function (chart) {
                            const data = chart.data;
                            return data.labels.map((label, i) => ({
                                text: `${label}: ${percentages[i].toFixed(1)}%`,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                hidden: false,
                                index: i
                            }));
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const percentage = percentages[context.dataIndex];
                            return `${label}: ${getCurrencySymbol(baseCurrency)}${value.toFixed(2)} (${percentage.toFixed(1)}%)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Render P&L list
 */
function renderPLList(accounts) {
    const container = document.getElementById('pl-list');

    if (accounts.length === 0) {
        container.innerHTML = '<p class="empty-text">No foreign currency accounts found</p>';
        return;
    }

    container.innerHTML = accounts.map(acc => `
        <div class="pl-item ${acc.trend}">
            <div class="pl-header">
                <span class="pl-currency">${acc.currency}</span>
                <span class="pl-account">${acc.accountName}</span>
            </div>
            <div class="pl-values">
                <div class="pl-value">
                    <span class="label">Book Value:</span>
                    <span>${getCurrencySymbol(baseCurrency)}${acc.bookValue.toFixed(2)}</span>
                </div>
                <div class="pl-value">
                    <span class="label">Market Value:</span>
                    <span>${getCurrencySymbol(baseCurrency)}${acc.marketValue.toFixed(2)}</span>
                </div>
                <div class="pl-value pl-${acc.trend}">
                    <span class="label">Unrealized P&L:</span>
                    <span class="pl-amount">
                        ${acc.unrealizedPL >= 0 ? '+' : ''}${getCurrencySymbol(baseCurrency)}${acc.unrealizedPL.toFixed(2)}
                        (${acc.plPercentage.toFixed(2)}%)
                    </span>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Render rates list
 */
function renderRatesList(rates, cached) {
    const container = document.getElementById('rates-list');
    const majors = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'INR'];

    const rateItems = Object.entries(rates)
        .filter(([currency]) => majors.includes(currency))
        .map(([currency, rate]) => {
            return {
                currency,
                rate,
                isMajor: true
            };
        });

    container.innerHTML = rateItems.map(item => `
        <div class="rate-item">
            <div class="rate-currency">
                <span class="currency-code">${baseCurrency}/${item.currency}</span>
                ${cached ? '<span class="cached-badge">Cached</span>' : '<span class="live-badge">Live</span>'}
            </div>
            <div class="rate-value">${item.rate.toFixed(4)}</div>
        </div>
    `).join('');
}

/**
 * Render risk assessment
 */
function renderRiskAssessment(assessment) {
    const container = document.getElementById('risk-assessment');

    let html = `
        <div class="risk-summary">
            <div class="risk-score-circle ${assessment.riskLevel}">
                <span class="score">${assessment.riskScore}</span>
                <span class="label">Risk Score</span>
            </div>
            <div class="risk-details">
                <h4>Risk Level: ${assessment.riskLevel.toUpperCase()}</h4>
                <p>Based on concentration, volatility, and P&L analysis</p>
            </div>
        </div>
    `;

    if (assessment.recommendations.length > 0) {
        html += '<div class="recommendations">';
        html += '<h4>💡 Recommendations</h4>';
        assessment.recommendations.forEach(rec => {
            html += `
                <div class="recommendation-item ${rec.priority}">
                    <span class="rec-icon">${rec.priority === 'high' ? '⚠️' : rec.priority === 'medium' ? '⚡' : 'ℹ️'}</span>
                    <p>${rec.message}</p>
                </div>
            `;
        });
        html += '</div>';
    }

    container.innerHTML = html;
}

/**
 * Generate revaluation report
 */
async function generateRevaluationReport() {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    if (!startDate || !endDate) {
        showError('Please select both start and end dates');
        return;
    }

    try {
        const response = await fetch(
            `${API_BASE}/currency/revaluation-report?baseCurrency=${baseCurrency}&startDate=${startDate}&endDate=${endDate}`,
            {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            }
        );

        const data = await response.json();

        if (data.success) {
            renderRevaluationReport(data.data);
        }
    } catch (error) {
        console.error('Error generating report:', error);
        showError('Failed to generate revaluation report');
    }
}

/**
 * Render revaluation report
 */
function renderRevaluationReport(report) {
    const container = document.getElementById('revaluation-report');

    if (report.revaluations.length === 0) {
        container.innerHTML = '<p class="empty-text">No revaluation data available for this period</p>';
        return;
    }

    let html = `
        <div class="report-summary">
            <div class="summary-item">
                <span class="label">Period:</span>
                <span>${new Date(report.startDate).toLocaleDateString()} - ${new Date(report.endDate).toLocaleDateString()}</span>
            </div>
            <div class="summary-item">
                <span class="label">Net Worth Change:</span>
                <span class="${report.summary.totalChange >= 0 ? 'positive' : 'negative'}">
                    ${report.summary.totalChange >= 0 ? '+' : ''}${getCurrencySymbol(baseCurrency)}${report.summary.totalChange.toFixed(2)}
                </span>
            </div>
            <div class="summary-item">
                <span class="label">FX Impact:</span>
                <span class="${report.summary.fxImpact >= 0 ? 'positive' : 'negative'}">
                    ${report.summary.fxImpact >= 0 ? '+' : ''}${getCurrencySymbol(baseCurrency)}${report.summary.fxImpact.toFixed(2)}
                    (${report.summary.fxAttributedPercentage.toFixed(1)}%)
                </span>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * Handle quick convert
 */
async function handleQuickConvert() {
    const amount = parseFloat(document.getElementById('convert-amount').value);
    const from = document.getElementById('convert-from').value;
    const to = document.getElementById('convert-to').value;

    if (!amount || amount <= 0) {
        showError('Please enter a valid amount');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/currency/realtime/${from}/${to}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            const converted = amount * data.data.rate;
            const resultDiv = document.getElementById('conversion-result');
            resultDiv.innerHTML = `
                <div class="conversion-display">
                    <span class="from-amount">${getCurrencySymbol(from)}${amount.toFixed(2)}</span>
                    <span class="equals">=</span>
                    <span class="to-amount">${getCurrencySymbol(to)}${converted.toFixed(2)}</span>
                </div>
                <div class="conversion-rate">
                    Rate: 1 ${from} = ${data.data.rate.toFixed(4)} ${to}
                    ${data.data.cached ? ' (cached)' : ' (live)'}
                </div>
            `;
            resultDiv.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error converting:', error);
        showError('Failed to convert currency');
    }
}

/**
 * Handle base currency change
 */
async function handleBaseCurrencyChange(e) {
    baseCurrency = e.target.value;
    localStorage.setItem('baseCurrency', baseCurrency);
    await loadAllData();
}

/**
 * Refresh all data
 */
async function refreshData() {
    const btn = document.getElementById('refresh-rates-btn');
    btn.disabled = true;
    btn.innerHTML = '⏳ Refreshing...';

    await loadAllData();

    btn.disabled = false;
    btn.innerHTML = '🔄 Refresh Rates';
    showSuccess('Data refreshed successfully');
}

/**
 * Clear rate cache
 */
async function clearCache() {
    try {
        const response = await fetch(`${API_BASE}/currency/cache`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('Cache cleared successfully');
            await loadLiveRates();
        }
    } catch (error) {
        console.error('Error clearing cache:', error);
        showError('Failed to clear cache');
    }
}

/**
 * Helper: Get currency symbol
 */
function getCurrencySymbol(code) {
    const symbols = {
        'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥',
        'INR': '₹', 'CAD': 'C$', 'AUD': 'A$', 'CHF': 'CHF'
    };
    return symbols[code] || code + ' ';
}

/**
 * Helper: Generate colors for chart
 */
function generateColors(count) {
    const baseColors = [
        '#667eea', '#f093fb', '#4facfe', '#43e97b',
        '#fa709a', '#ffd32a', '#30cfd0', '#ff6b9d'
    ];

    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(baseColors[i % baseColors.length]);
    }
    return colors;
}

/**
 * Helper: Show error message
 */
function showError(message) {
    // Simple implementation - could be enhanced with a toast library
    alert(message);
}

/**
 * Helper: Show success message
 */
function showSuccess(message) {
    // Simple implementation
    console.log('Success:', message);
}
