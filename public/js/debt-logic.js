/**
 * Debt Logic Controller
 * Issue #520: Comprehensive Debt Management & Amortization Engine
 */

const API_BASE = window.location.origin + '/api';
let debts = [];
let selectedDebtId = null;
let amortizationChart = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Event listeners
    document.getElementById('add-debt-btn').addEventListener('click', openDebtModal);
    document.getElementById('compare-strategies-btn').addEventListener('click', openStrategyComparison);
    document.getElementById('debt-form').addEventListener('submit', handleDebtSubmit);
    document.getElementById('run-comparison-btn').addEventListener('click', runStrategyComparison);
    document.getElementById('calculate-acceleration-btn').addEventListener('click', calculateAcceleration);
    document.getElementById('calculate-payment-btn').addEventListener('click', calculateLoanPayment);
    document.getElementById('debt-selector').addEventListener('change', handleDebtSelection);

    // Load initial data
    await loadDashboard();
});

/**
 * Load dashboard data
 */
async function loadDashboard() {
    try {
        const [dashboardData, debtsList] = await Promise.all([
            fetch(`${API_BASE}/debt/dashboard`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            }).then(r => r.json()),
            fetch(`${API_BASE}/debt?status=active`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            }).then(r => r.json())
        ]);

        if (dashboardData.success) {
            updateDashboardMetrics(dashboardData.data);
        }

        if (debtsList.success) {
            debts = debtsList.data;
            renderDebtList(debts);
            populateDebtSelectors(debts);
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showError('Failed to load dashboard');
    }
}

/**
 * Update dashboard metrics
 */
function updateDashboardMetrics(data) {
    document.getElementById('total-debt').textContent = `$${data.totalBalance.toFixed(2)}`;
    document.getElementById('monthly-payments').textContent = `$${data.totalMonthlyPayment.toFixed(2)}`;
    document.getElementById('overall-progress').textContent = `${data.overallProgress.toFixed(1)}%`;
    document.getElementById('debt-count-badge').textContent = `${data.debtCount} debt${data.debtCount !== 1 ? 's' : ''}`;
}

/**
 * Render debt list
 */
function renderDebtList(debtsList) {
    const container = document.getElementById('debt-list');

    if (debtsList.length === 0) {
        container.innerHTML = '<p class="empty-text">No active debts. Click "Add Debt" to get started.</p>';
        return;
    }

    container.innerHTML = debtsList.map(debt => `
        <div class="debt-card" data-id="${debt._id}">
            <div class="debt-header">
                <div class="debt-title">
                    <h3>${debt.name}</h3>
                    <span class="debt-type-badge ${debt.debtType}">${formatDebtType(debt.debtType)}</span>
                </div>
                <div class="debt-actions">
                    <button class="btn-icon" onclick="viewAmortization('${debt._id}')" title="View Amortization">📊</button>
                    <button class="btn-icon" onclick="editDebt('${debt._id}')" title="Edit">✏️</button>
                    <button class="btn-icon" onclick="deleteDebt('${debt._id}')" title="Delete">🗑️</button>
                </div>
            </div>
            <div class="debt-stats">
                <div class="stat">
                    <span class="label">Balance</span>
                    <span class="value">$${debt.currentBalance.toLocaleString()}</span>
                </div>
                <div class="stat">
                    <span class="label">Payment</span>
                    <span class="value">$${debt.monthlyPayment.toFixed(2)}/mo</span>
                </div>
                <div class="stat">
                    <span class="label">Rate</span>
                    <span class="value">${debt.interestRate}%</span>
                </div>
                <div class="stat">
                    <span class="label">Remaining</span>
                    <span class="value">${debt.remainingMonths || 0} months</span>
                </div>
            </div>
            <div class="debt-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${debt.progressPercentage || 0}%"></div>
                </div>
                <span class="progress-label">${(debt.progressPercentage || 0).toFixed(1)}% paid off</span>
            </div>
        </div>
    `).join('');
}

/**
 * Populate debt selectors
 */
function populateDebtSelectors(debtsList) {
    const selectors = [
        document.getElementById('debt-selector'),
        document.getElementById('accelerator-debt-select')
    ];

    selectors.forEach(select => {
        select.innerHTML = '<option value="">Select a debt...</option>' +
            debtsList.map(debt => `
                <option value="${debt._id}">${debt.name} ($${debt.currentBalance.toLocaleString()})</option>
            `).join('');
    });
}

/**
 * Handle debt selection for amortization
 */
async function handleDebtSelection(e) {
    const debtId = e.target.value;
    if (!debtId) return;

    try {
        const response = await fetch(`${API_BASE}/debt/${debtId}/amortization`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        const data = await response.json();

        if (data.success) {
            renderAmortizationChart(data.data);
        }
    } catch (error) {
        console.error('Error loading amortization:', error);
        showError('Failed to load amortization schedule');
    }
}

/**
 * Render amortization chart
 */
function renderAmortizationChart(schedule) {
    const ctx = document.getElementById('amortization-chart').getContext('2d');

    if (amortizationChart) {
        amortizationChart.destroy();
    }

    const labels = schedule.payments.map(p => `Month ${p.paymentNumber}`);
    const principalData = schedule.payments.map(p => p.cumulativePrincipal);
    const interestData = schedule.payments.map(p => p.cumulativeInterest);
    const balanceData = schedule.payments.map(p => p.endingBalance);

    amortizationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Remaining Balance',
                    data: balanceData,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Cumulative Principal',
                    data: principalData,
                    borderColor: '#10b981',
                    tension: 0.4,
                    fill: false
                },
                {
                    label: 'Cumulative Interest',
                    data: interestData,
                    borderColor: '#f59e0b',
                    tension: 0.4,
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
                    labels: { color: '#ffffff' }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return context.dataset.label + ': $' + context.parsed.y.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                y: {
                    ticks: {
                        callback: value => '$' + value.toLocaleString(),
                        color: '#ffffff'
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: { color: '#ffffff' },
                    grid: { display: false }
                }
            }
        }
    });

    // Show stats
    const statsDiv = document.getElementById('amortization-stats');
    statsDiv.classList.remove('hidden');
    statsDiv.innerHTML = `
        <div class="stat-row">
            <div class="stat-item">
                <span class="label">Total Payments:</span>
                <span class="value">$${schedule.totalPayments.toFixed(2)}</span>
            </div>
            <div class="stat-item">
                <span class="label">Total Interest:</span>
                <span class="value">$${schedule.totalInterest.toFixed(2)}</span>
            </div>
            <div class="stat-item">
                <span class="label">Term:</span>
                <span class="value">${schedule.paymentCount} months</span>
            </div>
        </div>
    `;
}

/**
 * Run strategy comparison
 */
async function runStrategyComparison() {
    const extraPayment = parseFloat(document.getElementById('extra-payment-input').value) || 0;

    try {
        const response = await fetch(`${API_BASE}/debt/strategies/compare?extraPayment=${extraPayment}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        const data = await response.json();

        if (data.success) {
            renderStrategyComparison(data.data);
        }
    } catch (error) {
        console.error('Error comparing strategies:', error);
        showError('Failed to compare strategies');
    }
}

/**
 * Render strategy comparison
 */
function renderStrategyComparison(comparison) {
    document.getElementById('comparison-empty').classList.add('hidden');
    const container = document.getElementById('strategy-comparison');
    container.classList.remove('hidden');

    const strategies = ['standard', 'snowball', 'avalanche'];

    container.querySelector('.strategy-grid').innerHTML = strategies.map(name => {
        const strategy = comparison.strategies[name];
        const isBest = name === comparison.bestStrategy;

        return `
            <div class="strategy-card ${isBest ? 'best' : ''}">
                ${isBest ? '<div class="best-badge">⭐ Best Strategy</div>' : ''}
                <h3>${formatStrategyName(name)}</h3>
                <div class="strategy-stats">
                    <div class="stat">
                        <span class="label">Total Interest</span>
                        <span class="value">$${strategy.totalInterest.toFixed(2)}</span>
                    </div>
                    <div class="stat">
                        <span class="label">Total Months</span>
                        <span class="value">${strategy.totalMonths}</span>
                    </div>
                    <div class="stat">
                        <span class="label">Total Payments</span>
                        <span class="value">$${strategy.totalPayments.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Calculate payoff acceleration
 */
async function calculateAcceleration() {
    const debtId = document.getElementById('accelerator-debt-select').value;
    const extraPayment = parseFloat(document.getElementById('accelerator-extra').value) || 0;

    if (!debtId) {
        showError('Please select a debt');
        return;
    }

    if (extraPayment <= 0) {
        showError('Please enter a valid extra payment amount');
        return;
    }

    try {
        const response = await fetch(
            `${API_BASE}/debt/${debtId}/payoff-acceleration?extraPayment=${extraPayment}`,
            { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }
        );

        const data = await response.json();

        if (data.success) {
            renderAccelerationResult(data.data);
        }
    } catch (error) {
        console.error('Error calculating acceleration:', error);
        showError('Failed to calculate acceleration');
    }
}

/**
 * Render acceleration result
 */
function renderAccelerationResult(result) {
    const container = document.getElementById('acceleration-result');
    container.classList.remove('hidden');

    container.innerHTML = `
        <div class="result-section">
            <h4>💰 Savings Analysis</h4>
            <div class="savings-grid">
                <div class="saving-item positive">
                    <span class="icon">💵</span>
                    <div>
                        <div class="amount">$${result.savings.interestSaved.toFixed(2)}</div>
                        <div class="label">Interest Saved</div>
                    </div>
                </div>
                <div class="saving-item positive">
                    <span class="icon">⏱️</span>
                    <div>
                        <div class="amount">${result.savings.monthsSaved} months</div>
                        <div class="label">Time Saved</div>
                    </div>
                </div>
                <div class="saving-item">
                    <span class="icon">🎯</span>
                    <div>
                        <div class="amount">${result.savings.roi.toFixed(1)}%</div>
                        <div class="label">ROI</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Calculate loan payment
 */
async function calculateLoanPayment() {
    const principal = parseFloat(document.getElementById('calc-principal').value);
    const rate = parseFloat(document.getElementById('calc-rate').value);
    const term = parseInt(document.getElementById('calc-term').value);

    if (!principal || !rate || !term) {
        showError('Please fill in all fields');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/debt/calculate-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ principal, annualRate: rate, termMonths: term })
        });

        const data = await response.json();

        if (data.success) {
            const result = document.getElementById('calculator-result');
            result.classList.remove('hidden');
            result.innerHTML = `
                <div class="calc-result-item">
                    <span class="label">Monthly Payment:</span>
                    <span class="value primary">$${data.data.monthlyPayment.toFixed(2)}</span>
                </div>
                <div class="calc-result-item">
                    <span class="label">Total Interest:</span>
                    <span class="value">$${data.data.totalInterest.toFixed(2)}</span>
                </div>
                <div class="calc-result-item">
                    <span class="label">Total Payments:</span>
                    <span class="value">$${data.data.totalPayments.toFixed(2)}</span>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error calculating payment:', error);
        showError('Failed to calculate payment');
    }
}

/**
 * Modal functions
 */
function openDebtModal() {
    document.getElementById('debt-modal').classList.remove('hidden');
    document.getElementById('debt-form').reset();
}

function closeDebtModal() {
    document.getElementById('debt-modal').classList.add('hidden');
}

async function handleDebtSubmit(e) {
    e.preventDefault();

    const debtData = {
        name: document.getElementById('debt-name').value,
        debtType: document.getElementById('debt-type').value,
        lender: document.getElementById('debt-lender').value,
        accountNumber: document.getElementById('debt-account-number').value,
        originalPrincipal: parseFloat(document.getElementById('debt-principal').value),
        currentBalance: parseFloat(document.getElementById('debt-balance').value),
        interestRate: parseFloat(document.getElementById('debt-rate').value),
        interestType: document.getElementById('debt-interest-type').value,
        monthlyPayment: parseFloat(document.getElementById('debt-monthly-payment').value),
        termMonths: parseInt(document.getElementById('debt-term').value),
        originationDate: document.getElementById('debt-origination-date').value,
        firstPaymentDate: document.getElementById('debt-first-payment-date').value,
        notes: document.getElementById('debt-notes').value
    };

    try {
        const response = await fetch(`${API_BASE}/debt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(debtData)
        });

        const data = await response.json();

        if (data.success) {
            closeDebtModal();
            await loadDashboard();
            showSuccess('Debt added successfully!');
        }
    } catch (error) {
        console.error('Error creating debt:', error);
        showError('Failed to create debt');
    }
}

// Helper functions
function formatDebtType(type) {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatStrategyName(name) {
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function showError(message) {
    alert(message);
}

function showSuccess(message) {
    console.log('Success:', message);
}

function openStrategyComparison() {
    document.getElementById('run-comparison-btn').click();
}

function viewAmortization(debtId) {
    document.getElementById('debt-selector').value = debtId;
    document.getElementById('debt-selector').dispatchEvent(new Event('change'));
}

async function deleteDebt(debtId) {
    if (!confirm('Are you sure you want to delete this debt?')) return;

    try {
        await fetch(`${API_BASE}/debt/${debtId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        await loadDashboard();
        showSuccess('Debt deleted');
    } catch (error) {
        console.error('Error deleting debt:', error);
        showError('Failed to delete debt');
    }
}
