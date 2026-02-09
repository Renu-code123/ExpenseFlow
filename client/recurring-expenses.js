// Recurring Expenses API Integration
const RECURRING_API_URL = 'http://localhost:3000/api/recurring';

// State management for recurring expenses
let recurringExpenses = [];
let recurringStatistics = null;

const getRecurringLocale = () => (window.i18n?.getLocale?.() && window.i18n.getLocale()) || 'en-US';
const getRecurringCurrency = () => (window.i18n?.getCurrency?.() && window.i18n.getCurrency()) || window.currentUserCurrency || 'INR';

function formatRecurringCurrency(value, options = {}) {
    if (window.i18n?.formatCurrency) {
        return window.i18n.formatCurrency(value, {
            currency: getRecurringCurrency(),
            locale: getRecurringLocale(),
            minimumFractionDigits: options.minimumFractionDigits ?? 2,
            maximumFractionDigits: options.maximumFractionDigits ?? 2
        });
    }

    const amount = Number(value || 0);
    return `${getRecurringCurrency()} ${amount.toFixed(options.minimumFractionDigits ?? 2)}`;
}

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

async function fetchRecurringExpenses() {
    try {
        const response = await fetch(RECURRING_API_URL, {
            headers: await getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch recurring expenses');
        const data = await response.json();
        recurringExpenses = data.data || [];
        return recurringExpenses;
    } catch (error) {
        console.error('Error fetching recurring expenses:', error);
        showRecurringNotification('Failed to load recurring expenses', 'error');
        return [];
    }
}

async function fetchRecurringStatistics() {
    try {
        const response = await fetch(`${RECURRING_API_URL}/statistics`, {
            headers: await getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch statistics');
        const data = await response.json();
        recurringStatistics = data.data;
        return recurringStatistics;
    } catch (error) {
        console.error('Error fetching recurring statistics:', error);
        return null;
    }
}

async function fetchUpcomingRecurring(days = 30) {
    try {
        const response = await fetch(`${RECURRING_API_URL}/upcoming?days=${days}`, {
            headers: await getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch upcoming expenses');
        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error('Error fetching upcoming recurring:', error);
        return [];
    }
}

async function createRecurringExpense(expense) {
    try {
        const response = await fetch(RECURRING_API_URL, {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: JSON.stringify(expense)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create recurring expense');
        }
        const data = await response.json();
        showRecurringNotification('Recurring expense created successfully!', 'success');
        await refreshRecurringData();
        return data.data;
    } catch (error) {
        console.error('Error creating recurring expense:', error);
        showRecurringNotification(error.message, 'error');
        throw error;
    }
}

async function updateRecurringExpense(id, updates) {
    try {
        const response = await fetch(`${RECURRING_API_URL}/${id}`, {
            method: 'PUT',
            headers: await getAuthHeaders(),
            body: JSON.stringify(updates)
        });
        if (!response.ok) throw new Error('Failed to update recurring expense');
        const data = await response.json();
        showRecurringNotification('Recurring expense updated!', 'success');
        await refreshRecurringData();
        return data.data;
    } catch (error) {
        console.error('Error updating recurring expense:', error);
        showRecurringNotification('Failed to update recurring expense', 'error');
        throw error;
    }
}

async function deleteRecurringExpense(id, permanent = false) {
    try {
        const url = permanent ? `${RECURRING_API_URL}/${id}?permanent=true` : `${RECURRING_API_URL}/${id}`;
        const response = await fetch(url, {
            method: 'DELETE',
            headers: await getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to delete recurring expense');
        showRecurringNotification('Recurring expense deleted!', 'success');
        await refreshRecurringData();
        return true;
    } catch (error) {
        console.error('Error deleting recurring expense:', error);
        showRecurringNotification('Failed to delete recurring expense', 'error');
        throw error;
    }
}

async function pauseRecurringExpense(id) {
    try {
        const response = await fetch(`${RECURRING_API_URL}/${id}/pause`, {
            method: 'POST',
            headers: await getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to pause recurring expense');
        showRecurringNotification('Recurring expense paused', 'success');
        await refreshRecurringData();
        return true;
    } catch (error) {
        console.error('Error pausing recurring expense:', error);
        showRecurringNotification('Failed to pause recurring expense', 'error');
        throw error;
    }
}

async function resumeRecurringExpense(id) {
    try {
        const response = await fetch(`${RECURRING_API_URL}/${id}/resume`, {
            method: 'POST',
            headers: await getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to resume recurring expense');
        showRecurringNotification('Recurring expense resumed', 'success');
        await refreshRecurringData();
        return true;
    } catch (error) {
        console.error('Error resuming recurring expense:', error);
        showRecurringNotification('Failed to resume recurring expense', 'error');
        throw error;
    }
}

async function skipRecurringOccurrence(id) {
    try {
        const response = await fetch(`${RECURRING_API_URL}/${id}/skip?immediate=true`, {
            method: 'POST',
            headers: await getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to skip occurrence');
        showRecurringNotification('Next occurrence skipped', 'success');
        await refreshRecurringData();
        return true;
    } catch (error) {
        console.error('Error skipping occurrence:', error);
        showRecurringNotification('Failed to skip occurrence', 'error');
        throw error;
    }
}

async function triggerRecurringNow(id) {
    try {
        const response = await fetch(`${RECURRING_API_URL}/${id}/trigger`, {
            method: 'POST',
            headers: await getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to trigger expense');
        showRecurringNotification('Expense created from recurring!', 'success');
        await refreshRecurringData();
        // Refresh main transactions list if available
        if (typeof loadTransactions === 'function') {
            await loadTransactions();
        }
        return true;
    } catch (error) {
        console.error('Error triggering expense:', error);
        showRecurringNotification('Failed to create expense', 'error');
        throw error;
    }
}

// ========================
// UI Rendering Functions
// ========================

function renderRecurringExpenses() {
    const container = document.getElementById('recurring-list');
    if (!container) return;

    if (recurringExpenses.length === 0) {
        container.innerHTML = `
      <div class="recurring-empty">
        <i class="fas fa-calendar-plus"></i>
        <p>No recurring expenses yet</p>
        <small>Add subscriptions, rent, or regular bills to track automatically</small>
      </div>
    `;
        return;
    }

    container.innerHTML = recurringExpenses.map(recurring => renderRecurringCard(recurring)).join('');
}

function renderRecurringCard(recurring) {
    const dueDate = new Date(recurring.nextDueDate);
    const today = new Date();
    const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

    const frequencyLabels = {
        'daily': 'Daily',
        'weekly': 'Weekly',
        'biweekly': 'Bi-weekly',
        'monthly': 'Monthly',
        'quarterly': 'Quarterly',
        'yearly': 'Yearly'
    };

    const categoryIcons = {
        'food': '🍽️',
        'transport': '🚗',
        'entertainment': '🎬',
        'utilities': '💡',
        'healthcare': '🏥',
        'shopping': '🛒',
        'subscription': '📺',
        'rent': '🏠',
        'insurance': '🛡️',
        'other': '📋'
    };

    const statusClass = recurring.isPaused ? 'paused' : daysUntilDue <= 3 ? 'due-soon' : 'active';
    const statusText = recurring.isPaused ? 'Paused' : daysUntilDue <= 0 ? 'Due Today' : daysUntilDue <= 3 ? `Due in ${daysUntilDue} days` : `Due ${dueDate.toLocaleDateString(window.i18n?.getLocale?.() || 'en-US')}`;

    return `
    <div class="recurring-card ${statusClass}" data-id="${recurring._id}">
      <div class="recurring-header">
        <div class="recurring-icon">${categoryIcons[recurring.category] || '📋'}</div>
        <div class="recurring-info">
          <h4 class="recurring-title">${recurring.description}</h4>
          <span class="recurring-category">${recurring.category}</span>
        </div>
        <div class="recurring-amount ${recurring.type}">
                    ${recurring.type === 'income' ? '+' : '-'}${formatRecurringCurrency(recurring.amount)}
        </div>
      </div>
      
      <div class="recurring-details">
        <div class="recurring-detail">
          <i class="fas fa-sync-alt"></i>
          <span>${frequencyLabels[recurring.frequency] || recurring.frequency}</span>
        </div>
        <div class="recurring-detail">
          <i class="fas fa-calendar"></i>
          <span>${statusText}</span>
        </div>
        <div class="recurring-detail">
          <i class="fas fa-chart-line"></i>
                    <span>${formatRecurringCurrency(getMonthlyEstimate(recurring))}/month</span>
        </div>
      </div>

      <div class="recurring-actions">
        ${recurring.isPaused ? `
          <button class="recurring-action-btn resume" onclick="resumeRecurringExpense('${recurring._id}')" title="Resume">
            <i class="fas fa-play"></i>
          </button>
        ` : `
          <button class="recurring-action-btn pause" onclick="pauseRecurringExpense('${recurring._id}')" title="Pause">
            <i class="fas fa-pause"></i>
          </button>
        `}
        <button class="recurring-action-btn skip" onclick="skipRecurringOccurrence('${recurring._id}')" title="Skip Next" ${recurring.isPaused ? 'disabled' : ''}>
          <i class="fas fa-forward"></i>
        </button>
        <button class="recurring-action-btn trigger" onclick="triggerRecurringNow('${recurring._id}')" title="Create Now" ${recurring.isPaused ? 'disabled' : ''}>
          <i class="fas fa-bolt"></i>
        </button>
        <button class="recurring-action-btn edit" onclick="openEditRecurringModal('${recurring._id}')" title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="recurring-action-btn delete" onclick="confirmDeleteRecurring('${recurring._id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

function renderRecurringStatistics() {
    const container = document.getElementById('recurring-stats');
    if (!container || !recurringStatistics) return;

    container.innerHTML = `
    <div class="recurring-stat-card">
      <div class="stat-icon"><i class="fas fa-repeat"></i></div>
      <div class="stat-content">
        <span class="stat-value">${recurringStatistics.activeCount}</span>
        <span class="stat-label">Active</span>
      </div>
    </div>
    <div class="recurring-stat-card">
      <div class="stat-icon"><i class="fas fa-pause-circle"></i></div>
      <div class="stat-content">
        <span class="stat-value">${recurringStatistics.pausedCount}</span>
        <span class="stat-label">Paused</span>
      </div>
    </div>
        <div class="recurring-stat-card expense">
            <div class="stat-icon"><i class="fas fa-arrow-down"></i></div>
            <div class="stat-content">
                <span class="stat-value">${formatRecurringCurrency(recurringStatistics.monthlyExpenseTotal, { maximumFractionDigits: 0 })}</span>
                <span class="stat-label">Monthly Expenses</span>
            </div>
        </div>
    <div class="recurring-stat-card income">
      <div class="stat-icon"><i class="fas fa-arrow-up"></i></div>
      <div class="stat-content">
                <span class="stat-value">${formatRecurringCurrency(recurringStatistics.monthlyIncomeTotal, { maximumFractionDigits: 0 })}</span>
        <span class="stat-label">Monthly Income</span>
      </div>
    </div>
    <div class="recurring-stat-card ${recurringStatistics.netMonthly >= 0 ? 'positive' : 'negative'}">
      <div class="stat-icon"><i class="fas fa-balance-scale"></i></div>
      <div class="stat-content">
                <span class="stat-value">${recurringStatistics.netMonthly >= 0 ? '+' : ''}${formatRecurringCurrency(recurringStatistics.netMonthly, { maximumFractionDigits: 0 })}</span>
        <span class="stat-label">Net Monthly</span>
      </div>
    </div>
  `;
}

function getMonthlyEstimate(recurring) {
    switch (recurring.frequency) {
        case 'daily': return recurring.amount * 30;
        case 'weekly': return recurring.amount * 4.33;
        case 'biweekly': return recurring.amount * 2.17;
        case 'monthly': return recurring.amount;
        case 'quarterly': return recurring.amount / 3;
        case 'yearly': return recurring.amount / 12;
        default: return recurring.amount;
    }
}

// ========================
// Modal Functions
// ========================

function openAddRecurringModal() {
    const modal = document.getElementById('recurring-modal');
    if (!modal) return;

    document.getElementById('recurring-modal-title').textContent = 'Add Recurring Expense';
    document.getElementById('recurring-form').reset();
    document.getElementById('recurring-id').value = '';

    // Set default start date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('recurring-start-date').value = today;
    document.getElementById('recurring-next-due').value = today;

    modal.classList.add('active');
}

function openEditRecurringModal(id) {
    const recurring = recurringExpenses.find(r => r._id === id);
    if (!recurring) return;

    const modal = document.getElementById('recurring-modal');
    if (!modal) return;

    document.getElementById('recurring-modal-title').textContent = 'Edit Recurring Expense';
    document.getElementById('recurring-id').value = recurring._id;
    document.getElementById('recurring-description').value = recurring.description;
    document.getElementById('recurring-amount').value = recurring.amount;
    document.getElementById('recurring-category').value = recurring.category;
    document.getElementById('recurring-type').value = recurring.type;
    document.getElementById('recurring-frequency').value = recurring.frequency;
    document.getElementById('recurring-start-date').value = new Date(recurring.startDate).toISOString().split('T')[0];
    document.getElementById('recurring-next-due').value = new Date(recurring.nextDueDate).toISOString().split('T')[0];
    document.getElementById('recurring-end-date').value = recurring.endDate ? new Date(recurring.endDate).toISOString().split('T')[0] : '';
    document.getElementById('recurring-reminder-days').value = recurring.reminderDays;
    document.getElementById('recurring-auto-create').checked = recurring.autoCreate;
    document.getElementById('recurring-notes').value = recurring.notes || '';

    modal.classList.add('active');
}

function closeRecurringModal() {
    const modal = document.getElementById('recurring-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

async function handleRecurringFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('recurring-id').value;
    const formData = {
        description: document.getElementById('recurring-description').value.trim(),
        amount: parseFloat(document.getElementById('recurring-amount').value),
        category: document.getElementById('recurring-category').value,
        type: document.getElementById('recurring-type').value,
        frequency: document.getElementById('recurring-frequency').value,
        startDate: document.getElementById('recurring-start-date').value,
        nextDueDate: document.getElementById('recurring-next-due').value,
        reminderDays: parseInt(document.getElementById('recurring-reminder-days').value),
        autoCreate: document.getElementById('recurring-auto-create').checked,
        notes: document.getElementById('recurring-notes').value.trim()
    };

    const endDate = document.getElementById('recurring-end-date').value;
    if (endDate) {
        formData.endDate = endDate;
    }

    try {
        if (id) {
            await updateRecurringExpense(id, formData);
        } else {
            await createRecurringExpense(formData);
        }
        closeRecurringModal();
    } catch (error) {
        // Error already handled in API functions
    }
}

function confirmDeleteRecurring(id) {
    const recurring = recurringExpenses.find(r => r._id === id);
    if (!recurring) return;

    if (confirm(`Are you sure you want to delete "${recurring.description}"? This action cannot be undone.`)) {
        deleteRecurringExpense(id, true);
    }
}

// ========================
// Utility Functions
// ========================

async function refreshRecurringData() {
    await Promise.all([
        fetchRecurringExpenses(),
        fetchRecurringStatistics()
    ]);
    renderRecurringExpenses();
    renderRecurringStatistics();
}

function showRecurringNotification(message, type = 'info') {
    // Use existing notification system if available
    if (typeof showNotification === 'function') {
        showNotification(message, type);
        return;
    }

    const notification = document.createElement('div');
    notification.className = `recurring-notification ${type}`;
    notification.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
    <span>${message}</span>
  `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ========================
// Initialization
// ========================

async function initRecurringExpenses() {
    // Check if recurring section exists
    if (!document.getElementById('recurring-section')) {
        console.log('Recurring section not found, skipping initialization');
        return;
    }

    // Set up event listeners
    const form = document.getElementById('recurring-form');
    if (form) {
        form.addEventListener('submit', handleRecurringFormSubmit);
    }

    const addBtn = document.getElementById('add-recurring-btn');
    if (addBtn) {
        addBtn.addEventListener('click', openAddRecurringModal);
    }

    const closeBtn = document.getElementById('recurring-modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeRecurringModal);
    }

    const cancelBtn = document.getElementById('recurring-cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeRecurringModal);
    }

    // Close modal when clicking outside
    const modal = document.getElementById('recurring-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeRecurringModal();
            }
        });
    }

    // Load data
    await refreshRecurringData();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRecurringExpenses);
} else {
    initRecurringExpenses();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        fetchRecurringExpenses,
        createRecurringExpense,
        updateRecurringExpense,
        deleteRecurringExpense,
        pauseRecurringExpense,
        resumeRecurringExpense,
        skipRecurringOccurrence,
        triggerRecurringNow,
        refreshRecurringData
    };
}
