// Financial Goals Management Feature for ExpenseFlow
const GOALS_API_URL = 'http://localhost:3000/api/goals';

const goalCurrencyFormatter = (value) => {
    const formatter = window.i18n?.formatCurrency;
    if (typeof formatter === 'function') return formatter(value);
    const numericValue = Number(value) || 0;
    const symbol = window.i18n?.getCurrencySymbol?.(window.i18n?.getCurrency?.() || '') || '';
    return `${symbol}${numericValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// State management
let goalsData = [];
let activeGoalId = null;

// ========================
// API Functions
// ========================

async function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

/**
 * Fetch all goals
 */
async function fetchGoals() {
    try {
        const response = await fetch(GOALS_API_URL, {
            headers: await getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch goals');
        const result = await response.json();
        goalsData = result.data;
        renderGoalsDashboard();
        return goalsData;
    } catch (error) {
        console.error('Error fetching goals:', error);
        showGoalNotification('Failed to load goals', 'error');
    }
}

/**
 * Create a new goal
 */
async function createGoal(goal) {
    try {
        const response = await fetch(GOALS_API_URL, {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: JSON.stringify(goal)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);

        showGoalNotification('Goal created successfully!', 'success');
        await fetchGoals();
        return result.data;
    } catch (error) {
        showGoalNotification(error.message, 'error');
    }
}

/**
 * Contribute to a goal
 */
async function contributeToGoal(id, amount) {
    try {
        const response = await fetch(`${GOALS_API_URL}/${id}/contribute`, {
            method: 'PATCH',
            headers: await getAuthHeaders(),
            body: JSON.stringify({ amount: parseFloat(amount) })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);

        if (result.alerts && result.alerts.length > 0) {
            result.alerts.forEach(alert => {
                showGoalNotification(alert.message, 'success');
            });
        } else {
            showGoalNotification('Contribution added successfully!', 'success');
        }

        await fetchGoals();
        return result.data;
    } catch (error) {
        showGoalNotification(error.message, 'error');
    }
}

/**
 * Analyze expense impact
 */
async function analyzeExpenseImpact(amount) {
    try {
        const response = await fetch(`${GOALS_API_URL}/analyze/impact?amount=${amount}`, {
            headers: await getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to analyze impact');
        const result = await response.json();
        return result.data;
    } catch (error) {
        console.error('Impact analysis error:', error);
        return null;
    }
}

// ========================
// UI Rendering Functions
// ========================

/**
 * Render Goals Dashboard
 */
function renderGoalsDashboard() {
    const container = document.getElementById('goals-dashboard-container');
    if (!container) return;

    if (goalsData.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <i class="fas fa-bullseye"></i>
        </div>
        <h4>No Financial Goals Yet</h4>
        <p>Start saving for your dreams by creating your first goal.</p>
        <button class="btn-submit" style="width: auto; margin-top: 1rem;" onclick="openGoalModal()">
          <i class="fas fa-plus"></i> Create First Goal
        </button>
      </div>
    `;
        return;
    }

    container.innerHTML = `
    <div class="goals-grid">
      ${goalsData.map(goal => renderGoalCard(goal)).join('')}
    </div>
  `;
}

/**
 * Render individual goal card
 */
function renderGoalCard(goal) {
    const progress = goal.progress || 0;
    const statusClass = goal.status === 'completed' ? 'completed' : (goal.isOverdue ? 'overdue' : '');

    return `
    <div class="goal-card ${statusClass}" data-id="${goal._id}">
      <div class="goal-card-header">
        <div class="goal-icon" style="background-color: ${goal.color}20; color: ${goal.color}">
          <i class="fas ${getGoalIcon(goal.category)}"></i>
        </div>
        <div class="goal-badges">
          <span class="goal-priority ${goal.priority}">${goal.priority}</span>
          ${goal.autoAllocate ? '<span class="auto-badge" title="Auto-Allocation Enabled"><i class="fas fa-magic"></i></span>' : ''}
        </div>
      </div>
      
      <div class="goal-info">
        <h3>${goal.title}</h3>
        <p class="goal-desc">${goal.description || 'No description'}</p>
      </div>

      <div class="goal-progress-section">
        <div class="progress-labels">
          <span class="progress-percent">${progress}%</span>
          <span class="progress-amount">${goalCurrencyFormatter(goal.currentAmount)} / ${goalCurrencyFormatter(goal.targetAmount)}</span>
        </div>
        <div class="goal-progress-bar">
          <div class="goal-progress-fill" style="width: ${progress}%; background-color: ${goal.color}"></div>
        </div>
      </div>

      <div class="goal-footer">
        <div class="goal-meta">
          <span class="meta-item ${goal.isOverdue ? 'text-error' : ''}">
            <i class="far fa-calendar-alt"></i> ${goal.daysRemaining} days left
          </span>
        </div>
        <div class="goal-actions">
          <button class="goal-btn contribute" onclick="openContributionModal('${goal._id}')" title="Contribute Funds">
            <i class="fas fa-hand-holding-usd"></i>
          </button>
          <button class="goal-btn view" onclick="viewGoalDetails('${goal._id}')" title="View Details">
            <i class="fas fa-chart-line"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Helper to get category icon
 */
function getGoalIcon(category) {
    const icons = {
        savings: 'fa-piggy-bank',
        emergency: 'fa-first-aid',
        investment: 'fa-chart-area',
        purchase: 'fa-shopping-cart',
        travel: 'fa-plane',
        car: 'fa-car',
        house: 'fa-home',
        education: 'fa-graduation-cap',
        other: 'fa-bullseye'
    };
    return icons[category] || 'fa-bullseye';
}

/**
 * Modal Management
 */
function openGoalModal() {
    document.getElementById('add-goal-modal')?.classList.add('active');
}

function closeGoalModal() {
    document.getElementById('add-goal-modal')?.classList.remove('active');
    document.getElementById('add-goal-form')?.reset();
}

function openContributionModal(id) {
    activeGoalId = id;
    const goal = goalsData.find(g => g._id === id);
    if (!goal) return;

    document.getElementById('contrib-goal-name').textContent = goal.title;
    document.getElementById('contribution-modal').classList.add('active');
}

function closeContributionModal() {
    document.getElementById('contribution-modal').classList.remove('active');
    document.getElementById('contrib-amount-input').value = '';
}

/**
 * Show Goal Notification
 */
function showGoalNotification(message, type = 'info') {
    if (typeof showNotification === 'function') {
        showNotification(message, type);
        return;
    }
    console.log(`[GOAL ${type.toUpperCase()}] ${message}`);
}

// ========================
// Initialization
// ========================

function initGoalFeature() {
    fetchGoals();

    // Handle create goal form
    const addGoalForm = document.getElementById('add-goal-form');
    if (addGoalForm) {
        addGoalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const goal = {
                title: document.getElementById('goal-title').value,
                targetAmount: parseFloat(document.getElementById('goal-target').value),
                targetDate: document.getElementById('goal-date').value,
                category: document.getElementById('goal-category').value,
                priority: document.getElementById('goal-priority').value,
                description: document.getElementById('goal-description').value,
                autoAllocate: document.getElementById('goal-auto-allocate').checked,
                color: document.getElementById('goal-color').value
            };

            const result = await createGoal(goal);
            if (result) closeGoalModal();
        });
    }

    // Handle contribution form
    const contribForm = document.getElementById('contribution-form');
    if (contribForm) {
        contribForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('contrib-amount-input').value;
            if (activeGoalId && amount) {
                const result = await contributeToGoal(activeGoalId, amount);
                if (result) closeContributionModal();
            }
        });
    }

    // Handle impact analysis on amount input change (Optional/Demo)
    const amountInput = document.getElementById('amount');
    if (amountInput) {
        amountInput.addEventListener('blur', async () => {
            const amount = parseFloat(amountInput.value);
            const type = document.getElementById('type')?.value;
            if (amount > 1000 && type === 'expense') { // Only for large expenses
                const impacts = await analyzeExpenseImpact(amount);
                if (impacts && impacts.length > 0) {
                    // You could show a subtle warning here
                    console.log('Expense Impact:', impacts);
                }
            }
        });
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGoalFeature);
} else {
    initGoalFeature();
}

// Export functions for global use
window.openGoalModal = openGoalModal;
window.closeGoalModal = closeGoalModal;
window.openContributionModal = openContributionModal;
window.closeContributionModal = closeContributionModal;
window.viewGoalDetails = (id) => {
    // Logic to show detailed prediction/milestone view
    const goal = goalsData.find(g => g._id === id);
    if (!goal) return;
    showGoalNotification(`Goal prediction: Complete in ${goal.daysRemaining} days`, 'info');
};
