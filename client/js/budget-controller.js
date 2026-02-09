/**
 * Budget Controller
 * Issue #554: Budget Planning & Variance Analysis System
 * UI logic for budget management and Chart.js visualizations
 */

const API_BASE = window.location.origin + '/api';
let budgets = [];
let selectedBudgetId = null;
let varianceChart = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('create-budget-btn').addEventListener('click', openBudgetModal);
    document.getElementById('templates-btn').addEventListener('click', showTemplates);
    document.getElementById('budget-form').addEventListener('submit', handleBudgetSubmit);
    document.getElementById('period-filter').addEventListener('change', filterBudgets);
    document.getElementById('chart-budget-selector').addEventListener('change', handleBudgetChartSelection);
    document.getElementById('budget-period').addEventListener('change', updateEndDate);

    await loadDashboard();
});

/**
 * Load dashboard data
 */
async function loadDashboard() {
    try {
        const response = await fetch(`${API_BASE}/budgets?active=true`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        const data = await response.json();

        if (data.success) {
            budgets = data.data;
            renderBudgetsList(budgets);
            updateSummaryMetrics(budgets);
            populateBudgetSelector(budgets);
            await loadAlerts();
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showError('Failed to load budgets');
    }
}

/**
 * Update summary metrics
 */
function updateSummaryMetrics(budgetsList) {
    const totals = budgetsList.reduce((acc, budget) => {
        acc.allocated += budget.totalAllocated || 0;
        acc.spent += budget.totalSpent || 0;
        return acc;
    }, { allocated: 0, spent: 0 });

    const variance = totals.allocated - totals.spent;

    document.getElementById('total-allocated').textContent = `$${totals.allocated.toLocaleString()}`;
    document.getElementById('total-spent').textContent = `$${totals.spent.toLocaleString()}`;
    document.getElementById('total-variance').textContent = `$${Math.abs(variance).toLocaleString()}`;
    document.getElementById('active-budgets').textContent = budgetsList.length;

    const varianceLabel = document.getElementById('variance-label');
    if (variance >= 0) {
        varianceLabel.textContent = 'Under budget';
        varianceLabel.style.color = '#10b981';
    } else {
        varianceLabel.textContent = 'Over budget';
        varianceLabel.style.color = '#ef4444';
    }

    // Update health counts
    const healthCounts = { healthy: 0, warning: 0, critical: 0, exceeded: 0 };
    budgetsList.forEach(b => {
        const health = b.overallHealth || 'healthy';
        healthCounts[health]++;
    });

    document.getElementById('health-count-healthy').textContent = healthCounts.healthy;
    document.getElementById('health-count-warning').textContent = healthCounts.warning;
    document.getElementById('health-count-critical').textContent = healthCounts.critical;
    document.getElementById('health-count-exceeded').textContent = healthCounts.exceeded;
}

/**
 * Render budgets list
 */
function renderBudgetsList(budgetsList) {
    const container = document.getElementById('budgets-list');

    if (budgetsList.length === 0) {
        container.innerHTML = '<p class="empty-text">No active budgets. Create one to get started!</p>';
        return;
    }

    container.innerHTML = budgetsList.map(budget => {
        const health = budget.overallHealth || 'healthy';
        const healthColors = {
            healthy: '#10b981',
            warning: '#f59e0b',
            critical: '#f97316',
            exceeded: '#ef4444'
        };

        return `
            <div class="budget-card" data-id="${budget._id}">
                <div class="budget-header">
                    <div class="budget-info">
                        <h3>${budget.name}</h3>
                        <span class="budget-period">${budget.period}</span>
                    </div>
                    <div class="budget-actions">
                        <button class="btn-icon" onclick="viewVariance('${budget._id}')" title="View Details">📊</button>
                        <button class="btn-icon" onclick="exportBudget('${budget._id}')" title="Export">📥</button>
                        <button class="btn-icon" onclick="deleteBudget('${budget._id}')" title="Delete">🗑️</button>
                    </div>
                </div>
                
                <div class="budget-stats">
                    <div class="stat">
                        <span class="label">Allocated</span>
                        <span class="value">$${budget.totalAllocated?.toLocaleString() || 0}</span>
                    </div>
                    <div class="stat">
                        <span class="label">Spent</span>
                        <span class="value">$${budget.totalSpent?.toLocaleString() || 0}</span>
                    </div>
                    <div class="stat">
                        <span class="label">Remaining</span>
                        <span class="value">$${budget.totalRemaining?.toLocaleString() || 0}</span>
                    </div>
                    <div class="stat">
                        <span class="label">Days Left</span>
                        <span class="value">${budget.daysRemaining || 0}</span>
                    </div>
                </div>

                <div class="budget-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${budget.progressPercentage || 0}%; background: ${healthColors[health]}"></div>
                    </div>
                    <div class="progress-info">
                        <span class="progress-percentage">${(budget.progressPercentage || 0).toFixed(1)}%</span>
                        <span class="health-badge ${health}">${health.toUpperCase()}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Populate budget selector
 */
function populateBudgetSelector(budgetsList) {
    const selector = document.getElementById('chart-budget-selector');
    selector.innerHTML = '<option value="">Select budget...</option>' +
        budgetsList.map(b => `<option value="${b._id}">${b.name}</option>`).join('');
}

/**
 * Handle budget chart selection
 */
async function handleBudgetChartSelection(e) {
    const budgetId = e.target.value;
    if (!budgetId) return;

    selectedBudgetId = budgetId;
    await loadVarianceChart(budgetId);
    await loadCategoryPerformance(budgetId);
}

/**
 * Load variance chart
 */
async function loadVarianceChart(budgetId) {
    try {
        const response = await fetch(`${API_BASE}/budgets/${budgetId}/variance`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        const data = await response.json();

        if (data.success) {
            renderVarianceChart(data.data);
        }
    } catch (error) {
        console.error('Error loading variance chart:', error);
    }
}

/**
 * Render variance chart
 */
function renderVarianceChart(variance) {
    const ctx = document.getElementById('variance-chart').getContext('2d');

    if (varianceChart) {
        varianceChart.destroy();
    }

    const categories = variance.categories.map(c => c.categoryName);
    const allocated = variance.categories.map(c => c.allocated);
    const spent = variance.categories.map(c => c.spent);

    varianceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: categories,
            datasets: [
                {
                    label: 'Allocated',
                    data: allocated,
                    backgroundColor: 'rgba(16, 185, 129, 0.7)',
                    borderColor: '#10b981',
                    borderWidth: 2
                },
                {
                    label: 'Spent',
                    data: spent,
                    backgroundColor: 'rgba(239, 68, 68, 0.7)',
                    borderColor: '#ef4444',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#ffffff' }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return context.dataset.label + ': $' + context.parsed.y.toLocaleString();
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
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
}

/**
 * Load category performance
 */
async function loadCategoryPerformance(budgetId) {
    try {
        const response = await fetch(`${API_BASE}/budgets/${budgetId}/variance`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        const data = await response.json();

        if (data.success) {
            renderCategoryPerformance(data.data.categories);
        }
    } catch (error) {
        console.error('Error loading category performance:', error);
    }
}

/**
 * Render category performance
 */
function renderCategoryPerformance(categories) {
    const container = document.getElementById('category-performance');

    container.innerHTML = categories.map(cat => `
        <div class="category-item ${cat.status}">
            <div class="category-info">
                <span class="category-name">${cat.categoryName}</span>
                <span class="category-status">${cat.status}</span>
            </div>
            <div class="category-amounts">
                <span class="allocated">$${cat.allocated.toLocaleString()}</span>
                <span class="spent">$${cat.spent.toLocaleString()}</span>
            </div>
            <div class="category-progress">
                <div class="mini-progress-bar">
                    <div class="mini-progress-fill ${cat.status}" style="width: ${cat.percentageUsed}%"></div>
                </div>
                <span class="percentage">${cat.percentageUsed.toFixed(1)}%</span>
            </div>
        </div>
    `).join('');
}

/**
 * Load alerts
 */
async function loadAlerts() {
    try {
        const response = await fetch(`${API_BASE}/budgets/alerts/active`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        const data = await response.json();

        if (data.success && data.count > 0) {
            showAlertBanner(data.data);
        }
    } catch (error) {
        console.error('Error loading alerts:', error);
    }
}

/**
 * Show alert banner
 */
function showAlertBanner(alerts) {
    const banner = document.getElementById('alert-banner');
    const critical = alerts.filter(a => a.level === 'exceeded' || a.level === 'critical');

    if (critical.length > 0) {
        banner.innerHTML = `
            <div class="alert-content">
                <span class="alert-icon">⚠️</span>
                <div class="alert-message">
                    <strong>${critical.length} Budget Alert${critical.length > 1 ? 's' : ''}</strong>
                    <p>${critical[0].message}</p>
                </div>
                <button class="alert-dismiss" onclick="dismissAlertBanner()">×</button>
            </div>
        `;
        banner.classList.remove('hidden');
    }
}

function dismissAlertBanner() {
    document.getElementById('alert-banner').classList.add('hidden');
}

/**
 * Filter budgets
 */
function filterBudgets() {
    const period = document.getElementById('period-filter').value;
    const filtered = period
        ? budgets.filter(b => b.period === period)
        : budgets;

    renderBudgetsList(filtered);
}

/**
 * Modal functions
 */
function openBudgetModal() {
    document.getElementById('budget-modal').classList.remove('hidden');
    document.getElementById('budget-form').reset();
    document.getElementById('budget-start-date').valueAsDate = new Date();
    updateEndDate();
}

function closeBudgetModal() {
    document.getElementById('budget-modal').classList.add('hidden');
}

function updateEndDate() {
    const period = document.getElementById('budget-period').value;
    const startDate = new Date(document.getElementById('budget-start-date').value);

    if (isNaN(startDate)) return;

    const endDate = new Date(startDate);
    switch (period) {
        case 'monthly':
            endDate.setMonth(endDate.getMonth() + 1);
            break;
        case 'quarterly':
            endDate.setMonth(endDate.getMonth() + 3);
            break;
        case 'yearly':
            endDate.setFullYear(endDate.getFullYear() + 1);
            break;
    }

    document.getElementById('budget-end-date').valueAsDate = endDate;
}

/**
 * Category management
 */
function addCategory() {
    const container = document.getElementById('categories-container');
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'category-allocation';
    categoryDiv.innerHTML = `
        <input type="text" placeholder="Category" class="cat-name" required>
        <input type="number" placeholder="Amount" class="cat-amount" required min="0" step="0.01">
        <button type="button" class="btn-icon remove-category" onclick="removeCategory(this)">🗑️</button>
    `;
    container.appendChild(categoryDiv);
}

function removeCategory(button) {
    const container = document.getElementById('categories-container');
    if (container.children.length > 1) {
        button.parentElement.remove();
    }
}

/**
 * Handle budget form submit
 */
async function handleBudgetSubmit(e) {
    e.preventDefault();

    const categories = [];
    const catElements = document.querySelectorAll('.category-allocation');

    catElements.forEach(el => {
        const name = el.querySelector('.cat-name').value;
        const amount = parseFloat(el.querySelector('.cat-amount').value);
        categories.push({
            categoryName: name,
            allocatedAmount: amount
        });
    });

    const budgetData = {
        name: document.getElementById('budget-name').value,
        description: document.getElementById('budget-description').value,
        period: document.getElementById('budget-period').value,
        startDate: document.getElementById('budget-start-date').value,
        endDate: document.getElementById('budget-end-date').value,
        categories,
        rolloverEnabled: document.getElementById('rollover-enabled').checked
    };

    try {
        const response = await fetch(`${API_BASE}/budgets`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(budgetData)
        });

        const data = await response.json();

        if (data.success) {
            closeBudgetModal();
            await loadDashboard();
            showSuccess('Budget created successfully!');
        }
    } catch (error) {
        console.error('Error creating budget:', error);
        showError('Failed to create budget');
    }
}

/**
 * Export budget to CSV
 */
async function exportBudget(budgetId) {
    try {
        const response = await fetch(`${API_BASE}/budgets/${budgetId}/export/csv`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        const csv = await response.text();
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `budget-export-${Date.now()}.csv`;
        a.click();
    } catch (error) {
        console.error('Error exporting budget:', error);
        showError('Failed to export budget');
    }
}

/**
 * Delete budget
 */
async function deleteBudget(budgetId) {
    if (!confirm('Are you sure you want to delete this budget?')) return;

    try {
        await fetch(`${API_BASE}/budgets/${budgetId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        await loadDashboard();
        showSuccess('Budget deleted');
    } catch (error) {
        console.error('Error deleting budget:', error);
        showError('Failed to delete budget');
    }
}

/**
 * View variance details
 */
function viewVariance(budgetId) {
    document.getElementById('chart-budget-selector').value = budgetId;
    handleBudgetChartSelection({ target: { value: budgetId } });
}

/**
 * Show templates (placeholder)
 */
function showTemplates() {
    alert('Template management coming soon!');
}

/**
 * Helper functions
 */
function showError(message) {
    alert(message);
}

function showSuccess(message) {
    console.log('Success:', message);
}
