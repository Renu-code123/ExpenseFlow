/**
 * Account Management & Net Worth Dashboard
 * Issue #337: Multi-Account Liquidity Management & Historical Revaluation
 */

// API Configuration
const ACCOUNTS_API = '/api/accounts';

// State
let accounts = [];
let netWorthData = null;
let transferHistory = [];
let selectedAccount = null;
let netWorthChart = null;

// ============================================
// API Functions
// ============================================

async function fetchAccounts() {
  const token = localStorage.getItem('token') || localStorage.getItem('token');
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(ACCOUNTS_API, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) throw new Error('Failed to fetch accounts');
  return response.json();
}

async function createAccount(accountData) {
  const token = localStorage.getItem('token') || localStorage.getItem('token');
  
  const response = await fetch(ACCOUNTS_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(accountData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create account');
  }
  return response.json();
}

async function updateAccount(accountId, updates) {
  const token = localStorage.getItem('token') || localStorage.getItem('token');
  
  const response = await fetch(`${ACCOUNTS_API}/${accountId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(updates)
  });

  if (!response.ok) throw new Error('Failed to update account');
  return response.json();
}

async function deleteAccount(accountId) {
  const token = localStorage.getItem('token') || localStorage.getItem('token');
  
  const response = await fetch(`${ACCOUNTS_API}/${accountId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) throw new Error('Failed to delete account');
  return response.json();
}

async function updateAccountBalance(accountId, balance, description = '') {
  const token = localStorage.getItem('token') || localStorage.getItem('token');
  
  const response = await fetch(`${ACCOUNTS_API}/${accountId}/balance`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ balance, description })
  });

  if (!response.ok) throw new Error('Failed to update balance');
  return response.json();
}

async function executeTransfer(transferData) {
  const token = localStorage.getItem('token') || localStorage.getItem('token');
  
  const response = await fetch(`${ACCOUNTS_API}/transfer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(transferData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Transfer failed');
  }
  return response.json();
}

async function fetchNetWorthSummary() {
  const token = localStorage.getItem('token') || localStorage.getItem('token');
  
  const response = await fetch(`${ACCOUNTS_API}/networth/summary`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) throw new Error('Failed to fetch net worth');
  return response.json();
}

async function fetchNetWorthTrend(days = 30) {
  const token = localStorage.getItem('token') || localStorage.getItem('token');
  
  const response = await fetch(`${ACCOUNTS_API}/networth/trend?days=${days}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) throw new Error('Failed to fetch trend data');
  return response.json();
}

async function fetchAccountHistory(accountId, days = 30) {
  const token = localStorage.getItem('token') || localStorage.getItem('token');
  
  const response = await fetch(`${ACCOUNTS_API}/${accountId}/history?days=${days}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) throw new Error('Failed to fetch history');
  return response.json();
}

async function fetchTransferHistory(limit = 20) {
  const token = localStorage.getItem('token') || localStorage.getItem('token');
  
  const response = await fetch(`${ACCOUNTS_API}/transfers/history?limit=${limit}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) throw new Error('Failed to fetch transfers');
  return response.json();
}

async function fetchDashboardData() {
  const token = localStorage.getItem('token') || localStorage.getItem('token');
  
  const response = await fetch(`${ACCOUNTS_API}/dashboard/summary`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) throw new Error('Failed to fetch dashboard');
  return response.json();
}

// ============================================
// UI Rendering Functions
// ============================================

function renderAccountsDashboard(container) {
  container.innerHTML = `
    <div class="accounts-dashboard">
      <div class="dashboard-header">
        <h2><i class="fas fa-wallet"></i> Account Manager</h2>
        <button class="btn-primary" onclick="showAddAccountModal()">
          <i class="fas fa-plus"></i> Add Account
        </button>
      </div>

      <div class="net-worth-overview" id="net-worth-overview">
        <div class="loading-spinner">Loading...</div>
      </div>

      <div class="accounts-grid" id="accounts-grid">
        <div class="loading-spinner">Loading accounts...</div>
      </div>

      <div class="quick-actions">
        <button class="action-btn" onclick="showTransferModal()">
          <i class="fas fa-exchange-alt"></i>
          <span>Transfer</span>
        </button>
        <button class="action-btn" onclick="refreshAllBalances()">
          <i class="fas fa-sync"></i>
          <span>Refresh</span>
        </button>
        <button class="action-btn" onclick="showTransferHistory()">
          <i class="fas fa-history"></i>
          <span>History</span>
        </button>
      </div>

      <div class="charts-section">
        <div class="chart-container">
          <h3><i class="fas fa-chart-line"></i> Net Worth Trend</h3>
          <div class="chart-controls">
            <button class="chart-period active" data-days="7">7D</button>
            <button class="chart-period" data-days="30">1M</button>
            <button class="chart-period" data-days="90">3M</button>
            <button class="chart-period" data-days="365">1Y</button>
          </div>
          <canvas id="networth-chart"></canvas>
        </div>
      </div>
    </div>
  `;

  // Load data
  loadAccountsDashboard();
  bindChartControls();
}

async function loadAccountsDashboard() {
  try {
    const [accountsData, netWorthStats] = await Promise.all([
      fetchAccounts(),
      fetchNetWorthSummary()
    ]);

    accounts = accountsData.accounts;
    netWorthData = netWorthStats;

    renderNetWorthOverview(netWorthStats);
    renderAccountsGrid(accounts);
    loadNetWorthChart(30);
  } catch (error) {
    console.error('Failed to load dashboard:', error);
    showNotification('Failed to load accounts', 'error');
  }
}

function renderNetWorthOverview(stats) {
  const container = document.getElementById('net-worth-overview');
  if (!container) return;

  const changeClass = stats.changes?.daily?.amount >= 0 ? 'positive' : 'negative';
  const changeIcon = stats.changes?.daily?.amount >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';

  container.innerHTML = `
    <div class="net-worth-card">
      <div class="net-worth-main">
        <span class="label">Total Net Worth</span>
        <span class="amount">${formatCurrency(stats.current, 'USD')}</span>
        <span class="change ${changeClass}">
          <i class="fas ${changeIcon}"></i>
          ${formatCurrency(Math.abs(stats.changes?.daily?.amount || 0), 'USD')}
          (${(stats.changes?.daily?.percentage || 0).toFixed(2)}%)
          <span class="period">today</span>
        </span>
      </div>
      
      <div class="net-worth-breakdown">
        <div class="breakdown-item assets">
          <i class="fas fa-arrow-up"></i>
          <div>
            <span class="breakdown-label">Assets</span>
            <span class="breakdown-value">${formatCurrency(stats.assets, 'USD')}</span>
          </div>
        </div>
        <div class="breakdown-item liabilities">
          <i class="fas fa-arrow-down"></i>
          <div>
            <span class="breakdown-label">Liabilities</span>
            <span class="breakdown-value">${formatCurrency(stats.liabilities, 'USD')}</span>
          </div>
        </div>
      </div>

      <div class="period-changes">
        ${renderPeriodChange('Week', stats.changes?.weekly)}
        ${renderPeriodChange('Month', stats.changes?.monthly)}
        ${renderPeriodChange('Year', stats.changes?.yearly)}
      </div>
    </div>
  `;
}

function renderPeriodChange(label, change) {
  if (!change || change.amount === null) return '';
  
  const isPositive = change.amount >= 0;
  const changeClass = isPositive ? 'positive' : 'negative';
  const icon = isPositive ? 'fa-caret-up' : 'fa-caret-down';

  return `
    <div class="period-change ${changeClass}">
      <span class="period-label">${label}</span>
      <span class="period-value">
        <i class="fas ${icon}"></i>
        ${(change.percentage || 0).toFixed(1)}%
      </span>
    </div>
  `;
}

function renderAccountsGrid(accountsList) {
  const container = document.getElementById('accounts-grid');
  if (!container) return;

  if (!accountsList || accountsList.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-wallet"></i>
        <p>No accounts yet</p>
        <button class="btn-primary" onclick="showAddAccountModal()">Add Your First Account</button>
      </div>
    `;
    return;
  }

  // Group accounts by type
  const grouped = groupAccountsByType(accountsList);

  container.innerHTML = Object.entries(grouped).map(([type, accts]) => `
    <div class="account-group">
      <h4 class="group-title">
        <i class="fas ${getAccountTypeIcon(type)}"></i>
        ${formatAccountType(type)}
        <span class="group-total">${formatCurrency(
          accts.reduce((sum, a) => sum + (a.effectiveBalance || a.balance), 0),
          'USD'
        )}</span>
      </h4>
      <div class="account-cards">
        ${accts.map(account => renderAccountCard(account)).join('')}
      </div>
    </div>
  `).join('');
}

function renderAccountCard(account) {
  const isDebt = ['credit_card', 'loan'].includes(account.type);
  const balanceClass = isDebt && account.balance > 0 ? 'negative' : 'positive';

  return `
    <div class="account-card" data-id="${account._id}" onclick="showAccountDetails('${account._id}')">
      <div class="account-header" style="border-left: 4px solid ${account.color || '#667eea'}">
        <div class="account-icon" style="background: ${account.color || '#667eea'}">
          <i class="fas ${account.icon || 'fa-wallet'}"></i>
        </div>
        <div class="account-info">
          <span class="account-name">${account.name}</span>
          <span class="account-institution">${account.institution?.name || account.currency}</span>
        </div>
        <button class="btn-icon" onclick="event.stopPropagation(); showAccountMenu('${account._id}')">
          <i class="fas fa-ellipsis-v"></i>
        </button>
      </div>
      <div class="account-balance ${balanceClass}">
        ${formatCurrency(account.balance, account.currency)}
      </div>
      ${account.creditLimit ? `
        <div class="credit-info">
          <div class="credit-bar">
            <div class="credit-used" style="width: ${Math.min((account.balance / account.creditLimit) * 100, 100)}%"></div>
          </div>
          <span class="credit-text">${formatCurrency(account.availableCredit, account.currency)} available</span>
        </div>
      ` : ''}
      <div class="account-footer">
        <span class="last-updated">Updated ${formatRelativeTime(account.lastBalanceUpdate)}</span>
      </div>
    </div>
  `;
}

// ============================================
// Modal Functions
// ============================================

function showAddAccountModal() {
  const modal = createModal('add-account-modal', `
    <div class="modal-header">
      <h3><i class="fas fa-plus-circle"></i> Add New Account</h3>
    </div>
    <form id="add-account-form" class="account-form">
      <div class="form-group">
        <label>Account Name *</label>
        <input type="text" id="account-name" required placeholder="e.g., Chase Checking">
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label>Account Type *</label>
          <select id="account-type" required onchange="onAccountTypeChange()">
            <option value="">Select type</option>
            <option value="cash">Cash</option>
            <option value="checking">Checking Account</option>
            <option value="savings">Savings Account</option>
            <option value="credit_card">Credit Card</option>
            <option value="investment">Investment</option>
            <option value="loan">Loan</option>
            <option value="wallet">Digital Wallet</option>
            <option value="crypto">Cryptocurrency</option>
            <option value="other">Other</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>Currency *</label>
          <select id="account-currency" required>
            <option value="USD">USD - US Dollar</option>
            <option value="EUR">EUR - Euro</option>
            <option value="GBP">GBP - British Pound</option>
            <option value="INR">INR - Indian Rupee</option>
            <option value="JPY">JPY - Japanese Yen</option>
            <option value="CAD">CAD - Canadian Dollar</option>
            <option value="AUD">AUD - Australian Dollar</option>
            <option value="BTC">BTC - Bitcoin</option>
            <option value="ETH">ETH - Ethereum</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label>Current Balance *</label>
        <input type="number" id="account-balance" required step="0.01" placeholder="0.00">
      </div>

      <div class="form-group credit-fields" style="display: none;">
        <label>Credit Limit</label>
        <input type="number" id="account-credit-limit" step="0.01" placeholder="0.00">
      </div>

      <div class="form-group">
        <label>Institution Name</label>
        <input type="text" id="account-institution" placeholder="e.g., Chase Bank">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Icon</label>
          <select id="account-icon">
            <option value="fa-wallet">💳 Wallet</option>
            <option value="fa-university">🏦 Bank</option>
            <option value="fa-piggy-bank">🐷 Savings</option>
            <option value="fa-credit-card">💳 Card</option>
            <option value="fa-chart-line">📈 Investment</option>
            <option value="fa-bitcoin">₿ Crypto</option>
            <option value="fa-money-bill">💵 Cash</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>Color</label>
          <input type="color" id="account-color" value="#667eea">
        </div>
      </div>

      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" id="account-include-networth" checked>
          Include in Net Worth calculation
        </label>
      </div>

      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="closeModal('add-account-modal')">Cancel</button>
        <button type="submit" class="btn-primary">Create Account</button>
      </div>
    </form>
  `);

  document.body.appendChild(modal);

  document.getElementById('add-account-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleCreateAccount();
  });
}

function onAccountTypeChange() {
  const type = document.getElementById('account-type').value;
  const creditFields = document.querySelector('.credit-fields');
  
  if (type === 'credit_card') {
    creditFields.style.display = 'block';
  } else {
    creditFields.style.display = 'none';
  }
}

async function handleCreateAccount() {
  const accountData = {
    name: document.getElementById('account-name').value,
    type: document.getElementById('account-type').value,
    currency: document.getElementById('account-currency').value,
    balance: parseFloat(document.getElementById('account-balance').value) || 0,
    institution: { name: document.getElementById('account-institution').value },
    icon: document.getElementById('account-icon').value,
    color: document.getElementById('account-color').value,
    includeInNetWorth: document.getElementById('account-include-networth').checked
  };

  const creditLimit = document.getElementById('account-credit-limit')?.value;
  if (creditLimit) {
    accountData.creditLimit = parseFloat(creditLimit);
  }

  try {
    await createAccount(accountData);
    closeModal('add-account-modal');
    showNotification('Account created successfully!', 'success');
    loadAccountsDashboard();
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

function showTransferModal() {
  if (accounts.length < 2) {
    showNotification('You need at least 2 accounts to make a transfer', 'warning');
    return;
  }

  const accountOptions = accounts.map(a => 
    `<option value="${a._id}">${a.name} (${formatCurrency(a.balance, a.currency)})</option>`
  ).join('');

  const modal = createModal('transfer-modal', `
    <div class="modal-header">
      <h3><i class="fas fa-exchange-alt"></i> Transfer Between Accounts</h3>
    </div>
    <form id="transfer-form" class="transfer-form">
      <div class="form-group">
        <label>From Account *</label>
        <select id="transfer-from" required>
          <option value="">Select source account</option>
          ${accountOptions}
        </select>
      </div>

      <div class="transfer-arrow">
        <i class="fas fa-arrow-down"></i>
      </div>

      <div class="form-group">
        <label>To Account *</label>
        <select id="transfer-to" required>
          <option value="">Select destination account</option>
          ${accountOptions}
        </select>
      </div>

      <div class="form-group">
        <label>Amount *</label>
        <input type="number" id="transfer-amount" required min="0.01" step="0.01" placeholder="0.00">
      </div>

      <div class="form-group">
        <label>Category</label>
        <select id="transfer-category">
          <option value="account_transfer">General Transfer</option>
          <option value="atm_withdrawal">ATM Withdrawal</option>
          <option value="atm_deposit">ATM Deposit</option>
          <option value="savings">Savings Deposit</option>
          <option value="credit_payment">Credit Card Payment</option>
          <option value="loan_payment">Loan Payment</option>
          <option value="investment">Investment</option>
        </select>
      </div>

      <div class="form-group">
        <label>Description</label>
        <input type="text" id="transfer-description" placeholder="Optional description">
      </div>

      <div class="form-group">
        <label>Fee (optional)</label>
        <input type="number" id="transfer-fee" min="0" step="0.01" value="0" placeholder="0.00">
      </div>

      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="closeModal('transfer-modal')">Cancel</button>
        <button type="submit" class="btn-primary">Execute Transfer</button>
      </div>
    </form>
  `);

  document.body.appendChild(modal);

  document.getElementById('transfer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleTransfer();
  });
}

async function handleTransfer() {
  const fromAccountId = document.getElementById('transfer-from').value;
  const toAccountId = document.getElementById('transfer-to').value;

  if (fromAccountId === toAccountId) {
    showNotification('Source and destination must be different', 'error');
    return;
  }

  const transferData = {
    fromAccountId,
    toAccountId,
    amount: parseFloat(document.getElementById('transfer-amount').value),
    category: document.getElementById('transfer-category').value,
    description: document.getElementById('transfer-description').value,
    fee: parseFloat(document.getElementById('transfer-fee').value) || 0
  };

  try {
    await executeTransfer(transferData);
    closeModal('transfer-modal');
    showNotification('Transfer completed successfully!', 'success');
    loadAccountsDashboard();
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

function showAccountDetails(accountId) {
  const account = accounts.find(a => a._id === accountId);
  if (!account) return;

  selectedAccount = account;

  const modal = createModal('account-details-modal', `
    <div class="modal-header">
      <div class="account-icon" style="background: ${account.color}">
        <i class="fas ${account.icon || 'fa-wallet'}"></i>
      </div>
      <div>
        <h3>${account.name}</h3>
        <span class="account-type-badge">${formatAccountType(account.type)}</span>
      </div>
    </div>
    
    <div class="account-details-content">
      <div class="balance-display">
        <span class="label">Current Balance</span>
        <span class="balance-amount">${formatCurrency(account.balance, account.currency)}</span>
      </div>

      <div class="details-actions">
        <button class="btn-secondary" onclick="showUpdateBalanceModal('${accountId}')">
          <i class="fas fa-edit"></i> Update Balance
        </button>
        <button class="btn-secondary" onclick="showAccountHistory('${accountId}')">
          <i class="fas fa-history"></i> View History
        </button>
      </div>

      <div class="account-meta">
        <div class="meta-item">
          <span class="meta-label">Currency</span>
          <span class="meta-value">${account.currency}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Institution</span>
          <span class="meta-value">${account.institution?.name || 'N/A'}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Last Updated</span>
          <span class="meta-value">${formatRelativeTime(account.lastBalanceUpdate)}</span>
        </div>
        ${account.creditLimit ? `
          <div class="meta-item">
            <span class="meta-label">Credit Limit</span>
            <span class="meta-value">${formatCurrency(account.creditLimit, account.currency)}</span>
          </div>
        ` : ''}
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn-danger" onclick="confirmDeleteAccount('${accountId}')">
        <i class="fas fa-trash"></i> Delete Account
      </button>
      <button class="btn-secondary" onclick="closeModal('account-details-modal')">Close</button>
    </div>
  `);

  document.body.appendChild(modal);
}

async function showAccountHistory(accountId) {
  try {
    const data = await fetchAccountHistory(accountId, 30);
    
    const historyHtml = data.history.map(h => `
      <div class="history-item ${h.change >= 0 ? 'positive' : 'negative'}">
        <div class="history-icon">
          <i class="fas ${getChangeTypeIcon(h.changeType)}"></i>
        </div>
        <div class="history-info">
          <span class="history-description">${h.description || formatChangeType(h.changeType)}</span>
          <span class="history-date">${new Date(h.createdAt).toLocaleDateString()}</span>
        </div>
        <div class="history-amount">
          ${h.change >= 0 ? '+' : ''}${formatCurrency(h.change, h.currency)}
        </div>
      </div>
    `).join('');

    closeModal('account-details-modal');
    
    const modal = createModal('account-history-modal', `
      <div class="modal-header">
        <h3><i class="fas fa-history"></i> Transaction History</h3>
      </div>
      <div class="history-list">
        ${historyHtml || '<p class="empty-state">No history available</p>'}
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal('account-history-modal'); showAccountDetails('${accountId}')">Back</button>
      </div>
    `);

    document.body.appendChild(modal);
  } catch (error) {
    showNotification('Failed to load history', 'error');
  }
}

// ============================================
// Chart Functions
// ============================================

async function loadNetWorthChart(days) {
  try {
    const data = await fetchNetWorthTrend(days);
    renderNetWorthChart(data.trend);
  } catch (error) {
    console.error('Failed to load chart:', error);
  }
}

function renderNetWorthChart(trendData) {
  const canvas = document.getElementById('networth-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Destroy existing chart
  if (netWorthChart) {
    netWorthChart.destroy();
  }

  const labels = trendData.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const values = trendData.map(d => d.netWorth);

  netWorthChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Net Worth',
        data: values,
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => formatCurrency(context.raw, 'USD')
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: (value) => formatCompactCurrency(value)
          },
          grid: { color: 'rgba(255,255,255,0.1)' }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

function bindChartControls() {
  document.querySelectorAll('.chart-period').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.chart-period').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      loadNetWorthChart(parseInt(e.target.dataset.days));
    });
  });
}

// ============================================
// Helper Functions
// ============================================

function createModal(id, content) {
  const modal = document.createElement('div');
  modal.id = id;
  modal.className = 'account-modal';
  modal.innerHTML = `
    <div class="modal-overlay" onclick="closeModal('${id}')"></div>
    <div class="modal-content">
      <button class="modal-close" onclick="closeModal('${id}')">&times;</button>
      ${content}
    </div>
  `;
  return modal;
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.remove();
}

function formatCurrency(amount, currency) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatCompactCurrency(amount) {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatRelativeTime(date) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

function groupAccountsByType(accountsList) {
  return accountsList.reduce((groups, account) => {
    const type = account.type;
    if (!groups[type]) groups[type] = [];
    groups[type].push(account);
    return groups;
  }, {});
}

function getAccountTypeIcon(type) {
  const icons = {
    cash: 'fa-money-bill',
    checking: 'fa-university',
    savings: 'fa-piggy-bank',
    credit_card: 'fa-credit-card',
    investment: 'fa-chart-line',
    loan: 'fa-hand-holding-usd',
    wallet: 'fa-wallet',
    crypto: 'fa-bitcoin',
    other: 'fa-folder'
  };
  return icons[type] || 'fa-wallet';
}

function formatAccountType(type) {
  const names = {
    cash: 'Cash',
    checking: 'Checking',
    savings: 'Savings',
    credit_card: 'Credit Cards',
    investment: 'Investments',
    loan: 'Loans',
    wallet: 'Digital Wallets',
    crypto: 'Cryptocurrency',
    other: 'Other'
  };
  return names[type] || type;
}

function getChangeTypeIcon(changeType) {
  const icons = {
    expense: 'fa-minus-circle',
    income: 'fa-plus-circle',
    transfer_out: 'fa-arrow-right',
    transfer_in: 'fa-arrow-left',
    adjustment: 'fa-edit',
    reconciliation: 'fa-check-circle',
    opening_balance: 'fa-flag'
  };
  return icons[changeType] || 'fa-circle';
}

function formatChangeType(changeType) {
  const names = {
    expense: 'Expense',
    income: 'Income',
    transfer_out: 'Transfer Out',
    transfer_in: 'Transfer In',
    adjustment: 'Manual Adjustment',
    reconciliation: 'Reconciliation',
    opening_balance: 'Opening Balance'
  };
  return names[changeType] || changeType;
}

async function refreshAllBalances() {
  showNotification('Refreshing balances...', 'info');
  await loadAccountsDashboard();
  showNotification('Balances refreshed!', 'success');
}

async function confirmDeleteAccount(accountId) {
  if (!confirm('Are you sure you want to delete this account? This action cannot be undone.')) {
    return;
  }

  try {
    await deleteAccount(accountId);
    closeModal('account-details-modal');
    showNotification('Account deleted successfully', 'success');
    loadAccountsDashboard();
  } catch (error) {
    showNotification('Failed to delete account', 'error');
  }
}

// Notification helper
if (!window.showNotification) {
  window.showNotification = function(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed; top: 20px; right: 20px; padding: 1rem 1.5rem;
      border-radius: 8px; color: white; z-index: 10000;
      background: ${type === 'success' ? '#00c853' : type === 'error' ? '#ff5252' : type === 'warning' ? '#ffc107' : '#2196f3'};
      animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fetchAccounts, createAccount, updateAccount, deleteAccount,
    executeTransfer, fetchNetWorthSummary, fetchNetWorthTrend,
    renderAccountsDashboard, loadAccountsDashboard
  };
}
