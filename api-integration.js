// API Configuration
var API_BASE_URL = '/api';

// State
let transactions = [];
let currentFilter = 'all';
let suggestionTimeout = null;
let currentSuggestions = [];
let selectedSuggestion = null;

// DOM Elements
const balance = document.getElementById("balance");
const money_plus = document.getElementById("money-plus");
const money_minus = document.getElementById("money-minus");
const list = document.getElementById("list");
const form = document.getElementById("form");
const text = document.getElementById("text");
const amount = document.getElementById("amount");
const category = document.getElementById("category");
const type = document.getElementById("type");
const categorySuggestions = document.getElementById("category-suggestions");
const categoryConfidence = document.getElementById("category-confidence");
const navToggle = document.getElementById("nav-toggle");
const navMenu = document.getElementById("nav-menu");

// Constant labels and emojis
const categoryEmojis = {
  food: '🍽️',
  transport: '🚗',
  shopping: '🛒',
  entertainment: '🎬',
  bills: '💡',
  utilities: '💡',
  healthcare: '🏥',
  education: '📚',
  travel: '✈️',
  salary: '💼',
  freelance: '💻',
  investment: '📈',
  other: '📋'
};

const categoryLabels = {
  food: 'Food & Dining',
  transport: 'Transportation',
  shopping: 'Shopping',
  entertainment: 'Entertainment',
  bills: 'Bills & Utilities',
  utilities: 'Bills & Utilities',
  healthcare: 'Healthcare',
  education: 'Education',
  travel: 'Travel',
  salary: 'Salary',
  freelance: 'Freelance',
  investment: 'Investment',
  other: 'Other'
};

const categories = {
  food: { name: '🍽️ Food & Dining', color: '#FF6B6B' },
  transport: { name: '🚗 Transportation', color: '#4ECDC4' },
  shopping: { name: '🛒 Shopping', color: '#45B7D1' },
  entertainment: { name: '🎬 Entertainment', color: '#96CEB4' },
  utilities: { name: '💡 Bills & Utilities', color: '#FECA57' },
  healthcare: { name: '🏥 Healthcare', color: '#FF9FF3' },
  other: { name: '📋 Other', color: '#A55EEA' }
};

const formatAppCurrency = (value, { showPlus = false, absolute = false } = {}) => {
  const formatter = window.i18n?.formatCurrency;
  const numericValue = Number(absolute ? Math.abs(value) : value) || 0;
  const formatted = typeof formatter === 'function'
    ? formatter(numericValue)
    : (function () { const sym = window.i18n?.getCurrencySymbol?.(window.i18n?.getCurrency?.() || '') || ''; return `${sym}${numericValue.toFixed(2)}`; })();
  if (showPlus && numericValue > 0 && !formatted.startsWith('+') && !formatted.startsWith('-')) {
    return `+${formatted}`;
  }
  return formatted;
};

// ========================
// API Functions
// ========================

function getAuthToken() {
  return localStorage.getItem('token');
}

async function fetchTransactions(page = 1, limit = 50) {
  try {
    // 1. Try to get from local DB first (Offline-First)
    const localExpenses = await dbManager.getAll('expenses');
    if (localExpenses.length > 0) {
      return localExpenses;
    }

    // 2. Fallback to server if local is empty or we want to refresh
    const token = getAuthToken();
    if (!token) return [];

    let url = `${API_BASE_URL}/transactions?page=${page}&limit=${limit}`;
    const activeWs = localStorage.getItem('activeWorkspaceId');
    if (activeWs && activeWs !== 'personal') {
      url += `&workspaceId=${activeWs}`;
    }

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    if (!response.ok) throw new Error('Failed to fetch expenses');
    const result = await response.json();

    // Handle standardized response format: { success: true, data: [...], meta: {...} }
    const data = result.data || result;

    // Save to local DB for future offline use
    for (const expense of data) {
      await dbManager.saveExpense(expense);
    }

    return data;
  } catch (error) {
    console.error('Error fetching expenses:', error);
    // If network fails, we already tried local, but maybe try again
    return await dbManager.getAll('expenses');
  }
}

async function saveTransaction(transaction, workspaceId = null) {
  if (window.ExpenseSync) {
    return await window.ExpenseSync.saveExpense(transaction);
  }
  // Fallback for safety (though ExpenseSync should be loaded)
  const response = await fetch(`${API_BASE_URL}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`
    },
    body: JSON.stringify(expense)
  });
  return await response.json();
}

async function deleteTransaction(id) {
  if (window.ExpenseSync) {
    return await window.ExpenseSync.deleteExpense(id);
  }
  const response = await fetch(`${API_BASE_URL}/transactions/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${getAuthToken()}` }
  });
  return await response.json();
}

async function fetchCategorySuggestions(description) {
  if (!description || description.trim().length < 3) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/categorization/suggest?description=${encodeURIComponent(description)}`, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    if (response.ok) {
      const data = await response.json();
      return data.data;
    }
  } catch (error) {
    console.error('Error fetching suggestions:', error);
  }
  return null;
}

// Auto-categorize all uncategorized expenses
async function autoCategorizeAllUncategorized(workspaceId = null) {
  try {
    const payload = {};
    const activeWs = workspaceId || localStorage.getItem('activeWorkspaceId');
    if (activeWs && activeWs !== 'personal') {
      payload.workspaceId = activeWs;
    }

    const response = await fetch(`${API_BASE_URL}/expenses/auto-categorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('Failed to auto-categorize');
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error auto-categorizing:', error);
    showNotification('Failed to auto-categorize expenses', 'error');
    throw error;
  }
}

// Apply a category suggestion to an expense
async function applyCategorySuggestion(expenseId, category, isCorrection = false, originalSuggestion = null) {
  try {
    const response = await fetch(`${API_BASE_URL}/expenses/${expenseId}/apply-suggestion`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ category, isCorrection, originalSuggestion })
    });

    if (!response.ok) throw new Error('Failed to apply suggestion');
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error applying suggestion:', error);
    showNotification('Failed to apply category', 'error');
    throw error;
  }
}

// Train the categorization system with a correction
async function trainCategorization(description, suggestedCategory, actualCategory) {
  try {
    const response = await fetch(`${API_BASE_URL}/categorization/train`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ description, suggestedCategory, actualCategory })
    });

    if (!response.ok) throw new Error('Failed to train');
    return await response.json();
  } catch (error) {
    console.error('Error training categorization:', error);
  }
}

// Get user's learned patterns
async function fetchUserPatterns(category = null) {
  try {
    let url = `${API_BASE_URL}/categorization/patterns`;
    if (category) url += `?category=${category}`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });

    if (!response.ok) throw new Error('Failed to fetch patterns');
    return await response.json();
  } catch (error) {
    console.error('Error fetching patterns:', error);
    return null;
  }
}

// Get categorization statistics
async function fetchCategorizationStats() {
  try {
    const response = await fetch(`${API_BASE_URL}/categorization/stats`, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });

    if (!response.ok) throw new Error('Failed to fetch stats');
    return await response.json();
  } catch (error) {
    console.error('Error fetching categorization stats:', error);
    return null;
  }
}

// ========================
// CORE LOGIC
// ========================

async function addTransaction(e) {
  e.preventDefault();

  if (text.value.trim() === '' || amount.value.trim() === '' || !category.value || !type.value) {
    showNotification('Please fill in all required fields', 'error');
    return;
  }

  if (isNaN(amount.value) || amount.value === '0') {
    showNotification('Please enter a valid amount', 'error');
    return;
  }

  let transactionAmount = +amount.value;

  if (type.value === 'expense' && transactionAmount > 0) {
    transactionAmount = -transactionAmount;
  } else if (type.value === 'income' && transactionAmount < 0) {
    transactionAmount = Math.abs(transactionAmount);
  }

  const expense = {
    description: text.value.trim(),
    amount: Math.abs(transactionAmount),
    category: category.value,
    type: type.value
  };

  try {
    const savedExpense = await window.ExpenseSync.saveExpense(expense);

    // Convert to local format for state
    const transaction = {
      id: savedExpense.id, // Now uses the ID from saveExpense (local or server)
      text: savedExpense.description,
      amount: transactionAmount,
      category: category.value,
      type: type.value,
      date: new Date().toISOString(),
      offline: savedExpense.status === 'pending'
    };

    transactions.push(transaction);
    displayTransactions();
    updateValues();

    // Clear form
    text.value = '';
    amount.value = '';
    category.value = '';
    type.value = '';
    if (categoryConfidence) categoryConfidence.classList.add('hidden');
    selectedSuggestion = null;
    hideSuggestions();

    const msg = transaction.offline ? 'Saved offline. Will sync when online.' : `${type.value.charAt(0).toUpperCase() + type.value.slice(1)} added successfully!`;
    showNotification(msg, transaction.offline ? 'warning' : 'success');
  } catch (error) {
    console.error('Add transaction error:', error);
    showNotification('Failed to add transaction', 'error');
  }
}

async function removeTransaction(id) {
  try {
    await window.ExpenseSync.deleteExpense(id);

    transactions = transactions.filter(transaction => transaction.id !== id);
    displayTransactions();
    updateValues();
    showNotification('Transaction deleted successfully', 'success');
  } catch (error) {
    console.error('Delete transaction error:', error);
    showNotification('Failed to delete transaction', 'error');
  }
}

// UI Helpers

function displayTransactions() {
  if (!list) return;
  list.innerHTML = '';

  if (transactions.length === 0) {
    list.innerHTML = `<li class="empty-message">No transactions yet</li>`;
    return;
  }

  transactions
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach(transaction => addTransactionDOM(transaction));
}

function addTransactionDOM(transaction) {
  const item = document.createElement("li");
  item.classList.add(transaction.amount < 0 ? "minus" : "plus");

  const categoryInfo = categories[transaction.category] || categories.other;
  const date = new Date(transaction.date);
  const formattedDate = date.toLocaleDateString(window.i18n?.getLocale?.() || 'en-US');

  item.innerHTML = `
    <div class="transaction-content">
      <div class="transaction-main">
        <span class="transaction-text">${transaction.text}</span>
        <span class="transaction-amount">${formatAppCurrency(transaction.amount, { absolute: true })}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 0.5rem;">
        <span class="transaction-category" style="background-color: ${categoryInfo.color}20; color: ${categoryInfo.color};">
          ${categoryInfo.name}
        </span>
        <div class="transaction-date">${formattedDate}</div>
      </div>
    </div>
    <button class="delete-btn" onclick="removeTransaction('${transaction.id}')">
      <i class="fas fa-trash"></i>
    </button>
  `;

  list.appendChild(item);
}

function updateValues() {
  const amounts = transactions.map(transaction => transaction.amount);

  const total = amounts.reduce((acc, item) => acc + item, 0);
  const income = amounts.filter(item => item > 0).reduce((acc, item) => acc + item, 0);
  const expense = amounts.filter(item => item < 0).reduce((acc, item) => acc + item, 0) * -1;

  if (balance) balance.innerHTML = formatAppCurrency(total);
  if (money_plus) money_plus.innerHTML = formatAppCurrency(income, { showPlus: true });
  if (money_minus) money_minus.innerHTML = formatAppCurrency(-expense);

  // Update quick stats if they exist
  const quickBalance = document.getElementById('quick-balance');
  const quickIncome = document.getElementById('quick-income');
  const quickExpense = document.getElementById('quick-expense');
  if (quickBalance) quickBalance.textContent = formatAppCurrency(total);
  if (quickIncome) quickIncome.textContent = formatAppCurrency(income);
  if (quickExpense) quickExpense.textContent = formatAppCurrency(expense);
}



// AI Suggestion UI Functions
function showSuggestions(suggestions) {
  if (!categorySuggestions) return;
  if (!suggestions || !suggestions.suggestions || suggestions.suggestions.length === 0) {
    hideSuggestions();
    return;
  }

  currentSuggestions = suggestions.suggestions;
  categorySuggestions.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'suggestions-header';
  header.innerHTML = `<i class="fas fa-brain"></i><span>AI Suggestions</span>`;
  categorySuggestions.appendChild(header);

  // Show auto-apply threshold info
  const thresholdInfo = document.createElement('div');
  thresholdInfo.className = 'suggestions-threshold-info';
  const autoApplyThreshold = suggestions.autoApplyThreshold || 0.85;
  thresholdInfo.innerHTML = `<small><i class="fas fa-info-circle"></i> Auto-applies at ${(autoApplyThreshold * 100).toFixed(0)}%+ confidence</small>`;
  categorySuggestions.appendChild(thresholdInfo);

  suggestions.suggestions.forEach((suggestion, index) => {
    const item = document.createElement('div');
    const isHighConfidence = suggestion.confidence >= (suggestions.autoApplyThreshold || 0.85);
    item.className = `suggestion-item ${index === 0 ? 'primary' : ''} ${isHighConfidence ? 'high-confidence' : ''}`;
    const confidenceLevel = suggestion.confidence >= 0.85 ? 'high' : suggestion.confidence >= 0.6 ? 'medium' : 'low';

    // Add "Suggested" badge for lower confidence suggestions
    const badgeHTML = isHighConfidence
      ? '<span class="auto-apply-badge"><i class="fas fa-check-circle"></i> Auto-apply</span>'
      : '<span class="suggested-badge"><i class="fas fa-lightbulb"></i> Suggested</span>';

    item.innerHTML = `
      <div class="suggestion-content">
        <div class="suggestion-category">
          <span class="suggestion-category-icon">${categoryEmojis[suggestion.category] || '📋'}</span>
          <span>${categoryLabels[suggestion.category] || suggestion.category}</span>
          ${badgeHTML}
        </div>
        <div class="suggestion-reason"><i class="fas fa-info-circle"></i><span>${suggestion.reason}</span></div>
      </div>
      <div class="suggestion-confidence confidence-${confidenceLevel}">
        <span class="confidence-value">${(suggestion.confidence * 100).toFixed(0)}%</span>
        <div class="confidence-bar"><div class="confidence-fill" style="width: ${suggestion.confidence * 100}%"></div></div>
      </div>
    `;

    item.addEventListener('click', () => {
      selectSuggestion(suggestion);
      hideSuggestions();
    });
    categorySuggestions.appendChild(item);
  });

  categorySuggestions.classList.remove('hidden');
  categorySuggestions.classList.add('visible');
}

function hideSuggestions() {
  if (!categorySuggestions) return;
  categorySuggestions.classList.remove('visible');
  setTimeout(() => { if (categorySuggestions) categorySuggestions.classList.add('hidden'); }, 300);
}

function selectSuggestion(suggestion) {
  if (!category || !categoryConfidence) return;
  selectedSuggestion = suggestion;
  category.value = suggestion.category;
  categoryConfidence.innerHTML = `<i class="fas fa-check-circle"></i> ${(suggestion.confidence * 100).toFixed(0)}% confident`;
  categoryConfidence.classList.remove('hidden');
}

// Global UI functions
if (!window.showNotification) {
  window.showNotification = function (message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    Object.assign(notification.style, {
      position: 'fixed', top: '20px', right: '20px', padding: '1rem',
      borderRadius: '5px', color: 'white', zIndex: '10000',
      background: type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'
    });
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  };
}



// ========================
// INITIALIZATION
// ========================

async function initApp() {
  try {
    const expenses = await fetchExpenses();
    transactions = expenses.map(expense => ({
      id: expense._id,
      text: expense.description,
      amount: expense.type === 'expense' ? -expense.amount : expense.amount,
      category: expense.category,
      type: expense.type,
      date: expense.date
    }));
    displayTransactions();
    updateValues();
  } catch (error) {
    console.error('Failed to load transactions:', error);
    showNotification('Failed to load transactions. Please check your connection.', 'error');
    transactions = [];
    displayTransactions();
    updateValues();
  }
}

// Event Listeners
if (form) form.addEventListener('submit', addTransaction);

if (text) {
  text.addEventListener('input', (e) => {
    const description = e.target.value;
    if (suggestionTimeout) clearTimeout(suggestionTimeout);
    if (categoryConfidence) categoryConfidence.classList.add('hidden');
    selectedSuggestion = null;

    if (description.trim().length >= 3) {
      if (categorySuggestions) {
        categorySuggestions.innerHTML = '<div class="suggestions-loading"><i class="fas fa-spinner"></i> <span>Getting suggestions...</span></div>';
        categorySuggestions.classList.remove('hidden');
        categorySuggestions.classList.add('visible');
      }

      suggestionTimeout = setTimeout(async () => {
        const suggestions = await fetchCategorySuggestions(description);
        if (suggestions) {
          showSuggestions(suggestions);
          if (suggestions.primarySuggestion && suggestions.primarySuggestion.confidence > 0.8) {
            selectSuggestion(suggestions.primarySuggestion);
          }
        } else hideSuggestions();
      }, 500);
    } else hideSuggestions();
  });
}

if (navToggle && navMenu) {
  navToggle.addEventListener("click", () => {
    navMenu.classList.toggle("active");
  });
}

window.addEventListener('online', syncOfflineTransactions);

// Global Exposure
window.removeTransaction = removeTransaction;
window.updateAllData = initApp;
window.autoCategorizeAllUncategorized = autoCategorizeAllUncategorized;
window.applyCategorySuggestion = applyCategorySuggestion;
window.trainCategorization = trainCategorization;
window.fetchUserPatterns = fetchUserPatterns;
window.fetchCategorizationStats = fetchCategorizationStats;

// Start the app
document.addEventListener('DOMContentLoaded', initApp);