// Auth check handled by protect.js (Clerk-based)

document.addEventListener("DOMContentLoaded", () => {

  /* =====================
     DOM ELEMENTS
  ====================== */
  const balance = document.getElementById("balance");
  const moneyPlus = document.getElementById("money-plus");
  const moneyMinus = document.getElementById("money-minus");
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

  /* =====================
     BULK DOM ELEMENTS
  ====================== */
  const selectAllCheckbox = document.getElementById("select-all");
  const bulkActionBar = document.getElementById("bulk-action-bar");
  const selectedCountSpan = document.getElementById("selected-count");
  const bulkEditBtn = document.getElementById("bulk-edit-btn");
  const bulkDeleteBtn = document.getElementById("bulk-delete-btn");
  const bulkEditModal = document.getElementById("bulk-edit-modal");
  const closeBulkModalBtn = document.getElementById("close-bulk-modal");
  const cancelBulkEditBtn = document.getElementById("cancel-bulk-edit");
  const bulkEditForm = document.getElementById("bulk-edit-form");
  const bulkCategorySelect = document.getElementById("bulk-category");
  const bulkTypeSelect = document.getElementById("bulk-type");

  /* =====================
     STATE
  ====================== */
  let transactions = [];
  let suggestionTimeout = null;
  let currentSuggestions = [];
  let selectedSuggestion = null;
  let socket = null;
  let isOnline = navigator.onLine;
  let currentFilter = 'all';
  let selectedTransactions = new Set(); // Stores IDs of selected transactions

  /* =====================
     API CONFIGURATION
  ====================== */
  const API_BASE_URL = 'http://localhost:3000/api';

  // Get auth headers using Clerk session token
  async function getClerkToken() {
    try {
      if (window.Clerk && window.Clerk.session) {
        return await window.Clerk.session.getToken();
      }
    } catch (e) {
      console.error('Failed to get Clerk token:', e);
    }
    return null;
  }

  function getAuthHeaders() {
    // For sync calls, try localStorage fallback
    const token = localStorage.getItem('clerkToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  async function getAuthHeadersAsync() {
    const token = await getClerkToken();
    if (token) {
      localStorage.setItem('clerkToken', token);
      return { 'Authorization': `Bearer ${token}` };
    }
    return getAuthHeaders();
  }

  /* =====================
     REAL-TIME SYNC
  ====================== */
  function initializeSocket() {
    const token = localStorage.getItem('clerkToken');
    if (!token) return;

    socket = io('http://localhost:3000', {
      auth: { token }
    });

    socket.on('connect', () => {
      console.log('Connected to real-time sync');
    });

    socket.on('transaction_created', (transaction) => {
      // Use display amount if available, otherwise convert
      const displayAmount = transaction.displayAmount || transaction.amount;
      const newTransaction = {
        id: transaction._id,
        text: transaction.description,
        amount: transaction.type === 'expense' ? -displayAmount : displayAmount,
        category: transaction.category,
        type: transaction.type,
        date: transaction.date,
        displayCurrency: transaction.displayCurrency || 'INR'
      };
      transactions.push(newTransaction);
      displayTransactions();
      updateValues();
      showNotification('New transaction synced from another device', 'info');
    });

    socket.on('expense_updated', (expense) => {
      const displayAmount = expense.displayAmount || expense.amount;
      const index = transactions.findIndex(t => t.id === expense._id);
      if (index !== -1) {
        transactions[index] = {
          id: expense._id,
          text: expense.description,
          amount: expense.type === 'expense' ? -displayAmount : displayAmount,
          category: expense.category,
          type: expense.type,
          date: expense.date,
          displayCurrency: expense.displayCurrency || 'INR'
        };
        displayTransactions();
        updateValues();
        showNotification('Expense updated from another device', 'info');
      }
    });

    socket.on('expense_deleted', (data) => {
      transactions = transactions.filter(t => t.id !== data.id);
      selectedTransactions.delete(data.id); // Remove from selection if deleted
      updateActionBar();
      displayTransactions();
      updateValues();
      showNotification('Expense deleted from another device', 'info');
    });

    socket.on('bulk_expense_updated', (data) => {
      const { ids, updates } = data;
      let updatedCount = 0;

      transactions = transactions.map(t => {
        if (ids.includes(t.id)) {
          updatedCount++;
          return { ...t, ...updates };
        }
        return t;
      });

      if (updatedCount > 0) {
        displayTransactions();
        updateValues();
        showNotification(`${updatedCount} expenses updated via bulk action`, 'info');
      }
    });

    socket.on('bulk_expense_deleted', (data) => {
      const { ids } = data;
      transactions = transactions.filter(t => !ids.includes(t.id));

      ids.forEach(id => selectedTransactions.delete(id));
      updateActionBar();

      displayTransactions();
      updateValues();
      showNotification(`${ids.length} expenses deleted via bulk action`, 'info');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from real-time sync');
    });
  }

  /* =====================
     API FUNCTIONS
  ====================== */
  async function fetchTransactions() {
    try {
      const response = await fetch(`${API_BASE_URL}/transactions`, {
        headers: getAuthHeaders()
      });

      if (response.status === 401) {
        console.warn('API returned 401 - session may have expired');
        return [];
      }

      if (!response.ok) {
        throw new Error('Failed to fetch expenses');
      }

      const data = await response.json();
      return data.data.map(expense => ({
        id: expense._id,
        text: expense.description,
        amount: expense.type === 'expense'
          ? -(expense.displayAmount || expense.amount)
          : (expense.displayAmount || expense.amount),
        category: expense.category,
        type: expense.type,
        date: expense.date,
        displayCurrency: expense.displayCurrency || 'INR',
        approvalStatus: expense.approvalStatus || 'approved'
      }));
    } catch (error) {
      console.error('Network error, loading offline data:', error);
      return JSON.parse(localStorage.getItem('transactions') || '[]');
    }
  }


  async function saveTransaction(transaction) {
    try {
      const response = await fetch(`${API_BASE_URL}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(expense)
      });
      if (!response.ok) throw new Error('Failed to save expense');
      return await response.json();
    } catch (error) {
      console.error('Error saving expense:', error);
      throw error;
    }
  }

  async function updateTransaction(id, transaction) {
    try {
      const response = await fetch(`${API_BASE_URL}/transactions/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(expense)
      });
      if (!response.ok) throw new Error('Failed to update expense');
      return await response.json();
    } catch (error) {
      console.error('Error updating expense:', error);
      throw error;
    }
  }

  async function deleteTransaction(id) {
    try {
      const response = await fetch(`${API_BASE_URL}/transactions/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to delete expense');
      return await response.json();
    } catch (error) {
      console.error('Error deleting expense:', error);
      throw error;
    }
  }

  /* =====================
     I18N & CURRENCY HELPERS
  ====================== */
  const getActiveLocale = () => (window.i18n?.getLocale?.() && window.i18n.getLocale()) || 'en-US';
  const getActiveCurrency = () => (window.i18n?.getCurrency?.() && window.i18n.getCurrency()) || window.currentUserCurrency || 'INR';

  function formatCurrency(amount, options = {}) {
    const currency = options.currency || getActiveCurrency();
    if (window.i18n?.formatCurrency) {
      return window.i18n.formatCurrency(amount, {
        currency,
        locale: getActiveLocale(),
        minimumFractionDigits: options.minimumFractionDigits ?? 2,
        maximumFractionDigits: options.maximumFractionDigits ?? 2
      });
    }

    const symbol = window.i18n?.getCurrencySymbol?.(currency) || currency;
    return `${symbol}${Number(amount || 0).toFixed(options.minimumFractionDigits ?? 2)}`;
  }

  /* =====================
     AI CATEGORIZATION
  ====================== */

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

  async function fetchCategorySuggestions(description) {
    if (!description || description.trim().length < 3) return null;
    try {
      const response = await fetch(`${API_BASE_URL}/categorization/suggest?description=${encodeURIComponent(description)}`, {
        headers: getAuthHeaders()
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

  function showSuggestions(suggestions) {
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

    suggestions.suggestions.forEach((suggestion, index) => {
      const item = document.createElement('div');
      item.className = `suggestion-item ${index === 0 ? 'primary' : ''}`;

      const confidenceLevel = suggestion.confidence > 0.75 ? 'high' :
        suggestion.confidence > 0.5 ? 'medium' : 'low';

      item.innerHTML = `
        <div class="suggestion-content">
          <div class="suggestion-category">
            <span class="suggestion-category-icon">${categoryEmojis[suggestion.category] || '📋'}</span>
            <span>${categoryLabels[suggestion.category] || suggestion.category}</span>
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
    categorySuggestions.classList.remove('visible');
    setTimeout(() => { categorySuggestions.classList.add('hidden'); }, 300);
  }

  function selectSuggestion(suggestion) {
    selectedSuggestion = suggestion;
    category.value = suggestion.category;

    // Show confidence badge
    categoryConfidence.innerHTML = `
      <i class="fas fa-check-circle"></i> ${(suggestion.confidence * 100).toFixed(0)}% confident
    `;
    categoryConfidence.classList.remove('hidden');
  }

  text.addEventListener('input', (e) => {
    const description = e.target.value;
    if (suggestionTimeout) clearTimeout(suggestionTimeout);
    categoryConfidence.classList.add('hidden');
    selectedSuggestion = null;

    if (description.trim().length >= 3) {
      categorySuggestions.innerHTML = '<div class="suggestions-loading"><i class="fas fa-spinner"></i> <span>Getting suggestions...</span></div>';
      categorySuggestions.classList.remove('hidden');
      categorySuggestions.classList.add('visible');

      suggestionTimeout = setTimeout(async () => {
        const suggestions = await fetchCategorySuggestions(description);
        if (suggestions) {
          showSuggestions(suggestions);

          // Auto-select primary suggestion if confidence is high
          if (suggestions.primarySuggestion && suggestions.primarySuggestion.confidence > 0.8) {
            selectSuggestion(suggestions.primarySuggestion);
          }
        } else hideSuggestions();
      }, 500);
    } else hideSuggestions();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.description-input-wrapper')) hideSuggestions();
  });

  /* =====================
     MOBILE NAV
  ====================== */
  if (navToggle && navMenu) {
    navToggle.addEventListener("click", () => {
      navMenu.classList.toggle("active");
    });
  }

  /* =====================
     TRANSACTION MANAGEMENT
  ====================== */

  // Add Transaction
  async function addTransaction(e) {
    e.preventDefault();

    if (text.value.trim() === '' || amount.value.trim() === '' || !category.value || !type.value) {
      showNotification('Please fill in all required fields', 'error');
      return;
    }

    if (isNaN(amount.value) || amount.value <= 0) {
      showNotification('Please enter a valid positive amount', 'error');
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
      const savedExpense = await saveTransaction(expense);

      // Convert to local format using display amounts
      const displayAmount = savedExpense.displayAmount || savedExpense.amount;
      const transaction = {
        id: savedExpense._id,
        text: savedExpense.description,
        amount: savedExpense.type === 'expense' ? -displayAmount : displayAmount,
        category: savedExpense.category,
        type: savedExpense.type,
        date: savedExpense.date,
        displayCurrency: savedExpense.displayCurrency || 'INR'
      };

      transactions.push(transaction);
      displayTransactions();
      updateValues();

      // Clear form
      text.value = '';
      amount.value = '';
      category.value = '';
      type.value = '';

      // Reset AI state
      categoryConfidence.classList.add('hidden');
      selectedSuggestion = null;
      hideSuggestions();

      showNotification(`${type.value.charAt(0).toUpperCase() + type.value.slice(1)} added successfully!`, 'success');
    } catch (error) {
      console.error('Failed to add transaction:', error);
      showNotification('Failed to add transaction. Please check your connection.', 'error');
    }
  }

  // Remove Transaction
  async function removeTransaction(id) {
    const transactionToRemove = transactions.find(t => t.id === id);
    if (!transactionToRemove) return;

    try {
      await deleteTransaction(id);
      transactions = transactions.filter(transaction => transaction.id !== id);
      displayTransactions();
      updateValues();
      showNotification('Transaction deleted successfully', 'success');
    } catch (error) {
      console.error('Failed to delete transaction:', error);
      showNotification('Failed to delete transaction. Please check your connection.', 'error');
    }
  }

  // Load transactions from API
  async function loadTransactions() {
    try {
      const expenses = await fetchTransactions();
      transactions = expenses;
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



  /* =====================
     UI FUNCTIONS
  ====================== */

  function displayTransactions() {
    list.innerHTML = '';

    if (transactions.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #666;">
          <p>No transactions found.</p>
        </div>
      `;
      list.appendChild(emptyMessage);
      return;
    }

    let filteredTransactions = transactions;

    // Apply filters
    if (currentFilter !== 'all') {
      filteredTransactions = transactions.filter(t => t.type === currentFilter);
    }

    filteredTransactions
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .forEach(transaction => addTransactionDOM(transaction));

    updateMasterCheckbox();
  }

  function addTransactionDOM(transaction) {
    const item = document.createElement("li");
    item.classList.add(transaction.amount < 0 ? "minus" : "plus");

    const date = new Date(transaction.date);
    const formattedDate = date.toLocaleDateString('en-IN');
    const categoryInfo = categories[transaction.category] || categories.other;
    const currencySymbol = transaction.displayCurrency === 'INR' ? '₹' :
      transaction.displayCurrency === 'USD' ? '$' :
        transaction.displayCurrency === 'EUR' ? '€' : transaction.displayCurrency;

    // Determine approval status
    let statusBadge = '';
    if (transaction.approvalStatus) {
      const status = transaction.approvalStatus.toLowerCase();
      const statusText = transaction.approvalStatus.charAt(0).toUpperCase() + transaction.approvalStatus.slice(1);
      statusBadge = `<span class="approval-badge status-${status}">${statusText}</span>`;
    }

    item.innerHTML = `
      <div class="transaction-content">
        <div class="transaction-item-wrapper">
          <input type="checkbox" class="transaction-checkbox" data-id="${transaction.id}" 
            ${selectedTransactions.has(transaction.id) ? 'checked' : ''} onchange="toggleSelection('${transaction.id}')">
          <div class="transaction-main">
            <span class="transaction-text">${transaction.text}</span>
            <span class="transaction-amount">${currencySymbol}${Math.abs(transaction.amount).toFixed(2)}</span>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 0.5rem;">
          <span class="transaction-category" style="background-color: ${categoryInfo.color}20; color: ${categoryInfo.color};">
            ${categoryInfo.name}
          </span>
          <div class="transaction-meta">
            <div class="transaction-date">${formattedDate}</div>
            ${statusBadge}
          </div>
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

    // Use the currency from the first transaction or default to INR
    const currencySymbol = transactions.length > 0 ?
      (transactions[0].displayCurrency === 'INR' ? '₹' :
        transactions[0].displayCurrency === 'USD' ? '$' :
          transactions[0].displayCurrency === 'EUR' ? '€' : transactions[0].displayCurrency) : '₹';

    balance.innerHTML = `${currencySymbol}${total.toFixed(2)}`;
    moneyPlus.innerHTML = `+${currencySymbol}${income.toFixed(2)}`;
    moneyMinus.innerHTML = `-${currencySymbol}${expense.toFixed(2)}`;
  }



  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '1rem',
      borderRadius: '5px',
      color: 'white',
      background: type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3',
      zIndex: '10000'
    });

    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 3000);
  }

  function generateID() {
    return Math.floor(Math.random() * 1000000000);
  }

  const categories = {
    food: { name: '🍽️ Food & Dining', color: '#FF6B6B' },
    transport: { name: '🚗 Transportation', color: '#4ECDC4' },
    shopping: { name: '🛒 Shopping', color: '#45B7D1' },
    entertainment: { name: '🎬 Entertainment', color: '#96CEB4' },
    utilities: { name: '💡 Bills & Utilities', color: '#FECA57' },
    healthcare: { name: '🏥 Healthcare', color: '#FF9FF3' },
    salary: { name: '💼 Salary', color: '#54A0FF' },
    freelance: { name: '💻 Freelance', color: '#5F27CD' },
    investment: { name: '📈 Investment', color: '#00D2D3' },
    other: { name: '📋 Other', color: '#A55EEA' }
  };

  /* =====================
     FILTERS
  ====================== */
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-btn')) {
      document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      displayTransactions();
    }
  });

  /* =====================
     OFFLINE HANDLING
  ====================== */
  window.addEventListener('online', async () => {
    isOnline = true;
    showNotification('Back online! Syncing data...', 'info');
    await syncOfflineTransactions();
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    showNotification('You are offline. Changes will be saved locally.', 'warning');
  });

  /* =====================
     BULK ACTION FUNCTIONS
  ====================== */

  function toggleSelection(id) {
    if (selectedTransactions.has(id)) {
      selectedTransactions.delete(id);
    } else {
      selectedTransactions.add(id);
    }
    updateActionBar();
    updateMasterCheckbox();

    // Update checkbox in DOM without full re-render
    const checkbox = document.querySelector(`.transaction-checkbox[data-id="${id}"]`);
    if (checkbox) checkbox.checked = selectedTransactions.has(id);
  }

  function toggleSelectAll() {
    const isChecked = selectAllCheckbox.checked;

    // Get currently visible transactions based on filter
    let visibleTransactions = transactions;
    if (currentFilter !== 'all') {
      visibleTransactions = transactions.filter(t => t.type === currentFilter);
    }

    if (isChecked) {
      visibleTransactions.forEach(t => selectedTransactions.add(t.id));
    } else {
      // Only deselect visible ones (or deselect all?)
      // Standard behavior: deselect all
      selectedTransactions.clear();
    }

    displayTransactions(); // Re-render to update all checkboxes
    updateActionBar();
  }

  function updateActionBar() {
    const count = selectedTransactions.size;
    selectedCountSpan.textContent = `${count} selected`;

    if (count > 0) {
      bulkActionBar.classList.add('visible');
    } else {
      bulkActionBar.classList.remove('visible');
    }
  }

  function updateMasterCheckbox() {
    // Check if all visible transactions are selected
    let visibleTransactions = transactions;
    if (currentFilter !== 'all') {
      visibleTransactions = transactions.filter(t => t.type === currentFilter);
    }

    if (visibleTransactions.length === 0) {
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
      return;
    }

    const allSelected = visibleTransactions.every(t => selectedTransactions.has(t.id));
    if (selectAllCheckbox) selectAllCheckbox.checked = allSelected;
  }

  async function confirmBulkDelete() {
    const count = selectedTransactions.size;
    if (count === 0) return;

    if (confirm(`Are you sure you want to delete ${count} transactions? This cannot be undone.`)) {
      try {
        const response = await fetch(`${API_BASE_URL}/expenses/bulk-delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify({ ids: Array.from(selectedTransactions) })
        });

        if (!response.ok) throw new Error('Failed to delete expenses');

        const result = await response.json();
        showNotification(`Successfully deleted ${result.data.deleted} expenses`, 'success');

        // Optimistic update
        transactions = transactions.filter(t => !selectedTransactions.has(t.id));
        selectedTransactions.clear();
        updateActionBar();
        displayTransactions();
        updateValues();

      } catch (error) {
        console.error('Bulk delete failed:', error);
        showNotification('Failed to delete expenses', 'error');
      }
    }
  }

  function openBulkEditModal() {
    if (selectedTransactions.size === 0) return;
    bulkEditModal.classList.add('active');
  }

  function closeBulkEditModal() {
    bulkEditModal.classList.remove('active');
    bulkEditForm.reset();
  }

  async function handleBulkEditSubmit(e) {
    e.preventDefault();

    const updates = {};
    if (bulkCategorySelect.value) updates.category = bulkCategorySelect.value;
    if (bulkTypeSelect.value) updates.type = bulkTypeSelect.value;

    if (Object.keys(updates).length === 0) {
      showNotification('No changes selected', 'warning');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/expenses/bulk-update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          ids: Array.from(selectedTransactions),
          updates
        })
      });

      if (!response.ok) throw new Error('Failed to update expenses');

      const result = await response.json();
      showNotification(`Successfully updated ${result.data.modified} expenses`, 'success');

      // Optimistic update
      const ids = Array.from(selectedTransactions);
      transactions = transactions.map(t => {
        if (ids.includes(t.id)) {
          return { ...t, ...updates };
        }
        return t;
      });

      selectedTransactions.clear();
      updateActionBar();
      displayTransactions();
      updateValues();
      closeBulkEditModal();

    } catch (error) {
      console.error('Bulk update failed:', error);
      showNotification('Failed to update expenses', 'error');
    }
  }

  /* =====================
   EXPORT FUNCTIONALITY
====================== */

  // Export Modal Elements
  const exportModal = document.getElementById('export-modal');
  const exportModalCloseBtn = document.getElementById('export-modal-close');
  const exportCancelBtn = document.getElementById('export-cancel-btn');
  const exportSubmitBtn = document.getElementById('export-submit-btn');
  const openExportModalBtn = document.getElementById('open-export-modal');
  
  // Quick Export Buttons
  const quickExportCsvBtn = document.getElementById('export-csv');
  const quickExportPdfBtn = document.getElementById('export-pdf');
  
  // Export Form Elements
  const exportFormatRadios = document.getElementsByName('export-format');
  const exportStartDate = document.getElementById('export-start-date');
  const exportEndDate = document.getElementById('export-end-date');
  const exportCategoryFilter = document.getElementById('export-category-filter');
  const exportTypeFilter = document.getElementById('export-type-filter');
  const exportPreview = document.getElementById('export-preview');
  
  /**
   * Open Export Modal
   */
  function openExportModal() {
    if (!exportModal) return;
    
    exportModal.classList.add('active');
    
    // Set default date range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    if (exportStartDate) exportStartDate.value = thirtyDaysAgo.toISOString().split('T')[0];
    if (exportEndDate) exportEndDate.value = today.toISOString().split('T')[0];
    
    // Load preview
    updateExportPreview();
  }
  
  /**
   * Close Export Modal
   */
  function closeExportModal() {
    if (!exportModal) return;
    exportModal.classList.remove('active');
  }
  
  /**
   * Get selected export format
   */
  function getSelectedFormat() {
    const selected = Array.from(exportFormatRadios).find(radio => radio.checked);
    return selected ? selected.value : 'csv';
  }
  
  /**
   * Get export filters
   */
  function getExportFilters() {
    return {
      startDate: exportStartDate ? exportStartDate.value : null,
      endDate: exportEndDate ? exportEndDate.value : null,
      category: exportCategoryFilter ? exportCategoryFilter.value : 'all',
      type: exportTypeFilter ? exportTypeFilter.value : 'all'
    };
  }
  
  /**
   * Update Export Preview
   */
  async function updateExportPreview() {
    if (!exportPreview) return;
    
    try {
      exportPreview.innerHTML = '<div class="export-preview-loading"><i class="fas fa-spinner fa-spin"></i> Loading preview...</div>';
      
      const filters = getExportFilters();
      
      const response = await fetch(`${API_BASE_URL}/expenses/report/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(filters)
      });
      
      if (!response.ok) {
        throw new Error('Failed to load preview');
      }
      
      const data = await response.json();
      const preview = data.data;
      
      // Display preview
      exportPreview.innerHTML = `
        <div class="export-preview-content">
          <div class="preview-stats">
            <div class="preview-stat">
              <span class="preview-label">Total Transactions:</span>
              <span class="preview-value">${preview.count || 0}</span>
            </div>
            <div class="preview-stat">
              <span class="preview-label">Total Income:</span>
              <span class="preview-value" style="color: var(--success-color);">
                ₹${preview.totalIncome ? preview.totalIncome.toFixed(2) : '0.00'}
              </span>
            </div>
            <div class="preview-stat">
              <span class="preview-label">Total Expenses:</span>
              <span class="preview-value" style="color: var(--danger-color);">
                ₹${preview.totalExpense ? preview.totalExpense.toFixed(2) : '0.00'}
              </span>
            </div>
            <div class="preview-stat">
              <span class="preview-label">Net Balance:</span>
              <span class="preview-value" style="color: ${(preview.totalIncome - preview.totalExpense) >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">
                ₹${preview.netBalance ? preview.netBalance.toFixed(2) : '0.00'}
              </span>
            </div>
          </div>
          ${preview.count === 0 ? '<p class="preview-empty">No transactions found for the selected filters.</p>' : ''}
        </div>
      `;
      
    } catch (error) {
      console.error('Preview load error:', error);
      exportPreview.innerHTML = '<div class="export-preview-error">Failed to load preview. Please try again.</div>';
    }
  }
  
  /**
   * Export Data (Main Function)
   */
  async function exportData(format = null) {
    try {
      // Show loading state
      const exportBtn = exportSubmitBtn || document.createElement('button');
      const originalText = exportBtn.innerHTML;
      exportBtn.disabled = true;
      exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
      
      // Get format and filters
      const selectedFormat = format || getSelectedFormat();
      const filters = getExportFilters();
      
      // Make API request
      const response = await fetch(`${API_BASE_URL}/expenses/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          format: selectedFormat,
          ...filters
        })
      });
      
      if (!response.ok) {
        throw new Error('Export failed');
      }
      
      // Get the file blob
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Set filename based on format
      const timestamp = new Date().toISOString().split('T')[0];
      if (selectedFormat === 'csv') {
        a.download = `expenses-${timestamp}.csv`;
      } else if (selectedFormat === 'pdf') {
        a.download = `expense-report-${timestamp}.pdf`;
      } else if (selectedFormat === 'excel' || selectedFormat === 'xlsx') {
        a.download = `expenses-${timestamp}.xlsx`;
      }
      
      // Trigger download
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      // Show success notification
      showNotification(`Successfully exported as ${selectedFormat.toUpperCase()}`, 'success');
      
      // Close modal if it was open
      if (format === null) {
        closeExportModal();
      }
      
      // Restore button state
      if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.innerHTML = originalText;
      }
      
    } catch (error) {
      console.error('Export error:', error);
      showNotification('Export failed. Please try again.', 'error');
      
      // Restore button state
      if (exportSubmitBtn) {
        exportSubmitBtn.disabled = false;
        exportSubmitBtn.innerHTML = '<i class="fas fa-download"></i> <span>Export</span>';
      }
    }
  }
  
  /**
   * Quick Export CSV (without modal)
   */
  async function quickExportCSV() {
    try {
      const response = await fetch(`${API_BASE_URL}/expenses/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          format: 'csv',
          startDate: null, // All time
          endDate: null,
          category: 'all',
          type: 'all'
        })
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses-all-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      showNotification('CSV exported successfully!', 'success');
    } catch (error) {
      console.error('Quick CSV export failed:', error);
      showNotification('Failed to export CSV', 'error');
    }
  }
  
  /**
   * Quick Export PDF (without modal)
   */
  async function quickExportPDF() {
    try {
      const response = await fetch(`${API_BASE_URL}/expenses/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          format: 'pdf',
          startDate: null, // All time
          endDate: null,
          category: 'all',
          type: 'all'
        })
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expense-report-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      showNotification('PDF exported successfully!', 'success');
    } catch (error) {
      console.error('Quick PDF export failed:', error);
      showNotification('Failed to export PDF', 'error');
    }
  }
  
  // Export Modal Event Listeners
  if (openExportModalBtn) {
    openExportModalBtn.addEventListener('click', openExportModal);
  }
  
  if (exportModalCloseBtn) {
    exportModalCloseBtn.addEventListener('click', closeExportModal);
  }
  
  if (exportCancelBtn) {
    exportCancelBtn.addEventListener('click', closeExportModal);
  }
  
  if (exportSubmitBtn) {
    exportSubmitBtn.addEventListener('click', () => exportData());
  }
  
  // Quick Export Event Listeners
  if (quickExportCsvBtn) {
    quickExportCsvBtn.addEventListener('click', quickExportCSV);
  }
  
  if (quickExportPdfBtn) {
    quickExportPdfBtn.addEventListener('click', quickExportPDF);
  }
  
  // Filter change listeners for live preview
  if (exportStartDate) {
    exportStartDate.addEventListener('change', updateExportPreview);
  }
  
  if (exportEndDate) {
    exportEndDate.addEventListener('change', updateExportPreview);
  }
  
  if (exportCategoryFilter) {
    exportCategoryFilter.addEventListener('change', updateExportPreview);
  }
  
  if (exportTypeFilter) {
    exportTypeFilter.addEventListener('change', updateExportPreview);
  }
  
  // Close modal on outside click
  if (exportModal) {
    exportModal.addEventListener('click', (e) => {
      if (e.target === exportModal) {
        closeExportModal();
      }
    });
  }

  /* =====================
     INITIALIZATION
  ====================== */
  async function Init() {
    await loadTransactions();
    initializeSocket();

    // Bulk Action Event Listeners
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', toggleSelectAll);
    }

    if (bulkDeleteBtn) {
      bulkDeleteBtn.addEventListener('click', confirmBulkDelete);
    }

    if (bulkEditBtn) {
      bulkEditBtn.addEventListener('click', openBulkEditModal);
    }

    if (closeBulkModalBtn) {
      closeBulkModalBtn.addEventListener('click', closeBulkEditModal);
    }

    if (cancelBulkEditBtn) {
      cancelBulkEditBtn.addEventListener('click', closeBulkEditModal);
    }

    if (bulkEditForm) {
      bulkEditForm.addEventListener('submit', handleBulkEditSubmit);
    }

    // Make toggleSelection global so inline onchange works
    window.toggleSelection = toggleSelection;
  }

  // Event listeners
  form.addEventListener('submit', addTransaction);

  Init();
});
