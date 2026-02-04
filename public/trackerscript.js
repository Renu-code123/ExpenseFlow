if (!localStorage.getItem('token')) {
  window.location.replace('/login.html');
}

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
     STATE
  ====================== */
  let transactions = [];
  let suggestionTimeout = null;
  let currentSuggestions = [];
  let selectedSuggestion = null;
  let socket = null;
  let isOnline = navigator.onLine;
  let currentFilter = 'all';

  /* =====================
     API CONFIGURATION
  ====================== */
  const API_BASE_URL = 'http://localhost:3000/api';

  // Get auth headers
  function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  /* =====================
     REAL-TIME SYNC
  ====================== */
  function initializeSocket() {
    const token = localStorage.getItem('token');
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
      displayTransactions();
      updateValues();
      showNotification('Expense deleted from another device', 'info');
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
        localStorage.clear();
        window.location.replace('/login.html');
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
      const savedExpense = await saveExpense(expense);

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
      await deleteExpense(id);
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
      const expenses = await fetchExpenses();
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
        <div class="transaction-main">
          <span class="transaction-text">${transaction.text}</span>
          <span class="transaction-amount">${currencySymbol}${Math.abs(transaction.amount).toFixed(2)}</span>
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
     INITIALIZATION
  ====================== */
  async function Init() {
    await loadTransactions();
    initializeSocket();
  }

  // Event listeners
  form.addEventListener('submit', addTransaction);

  Init();
});
