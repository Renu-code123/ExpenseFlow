/**
 * Debt Tracker Module
 * Manages loans, mortgages, and debt payoff progress
 */

class DebtTracker {
  constructor() {
    this.debts = [];
    this.summary = null;
    this.currentDebtId = null;
    this.apiBaseUrl = '/api/debts';
    
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadDebts();
    this.loadSummary();
  }

  bindEvents() {
    // Add debt button
    const addDebtBtn = document.getElementById('add-debt-btn');
    if (addDebtBtn) {
      addDebtBtn.addEventListener('click', () => this.openDebtModal());
    }

    // Debt form submission
    const debtForm = document.getElementById('debt-form');
    if (debtForm) {
      debtForm.addEventListener('submit', (e) => this.handleDebtSubmit(e));
    }

    // Payment form submission
    const paymentForm = document.getElementById('payment-form');
    if (paymentForm) {
      paymentForm.addEventListener('submit', (e) => this.handlePaymentSubmit(e));
    }

    // Close modals
    document.querySelectorAll('.modal-close-btn, .btn-cancel').forEach(btn => {
      btn.addEventListener('click', (e) => this.closeModal(e.target.closest('.modal')));
    });

    // Strategy selector
    const strategySelect = document.getElementById('payoff-strategy');
    if (strategySelect) {
      strategySelect.addEventListener('change', (e) => this.loadRecommendations(e.target.value));
    }

    // Filter buttons
    document.querySelectorAll('.debt-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.filterDebts(e.target.dataset.filter));
    });

    // Close modal when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal(modal);
      });
    });
  }

  async loadDebts() {
    try {
      const response = await fetch(this.apiBaseUrl, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to load debts');

      const result = await response.json();
      this.debts = result.data || [];
      this.renderDebts();
    } catch (error) {
      console.error('Error loading debts:', error);
      this.showNotification('Failed to load debts', 'error');
    }
  }

  async loadSummary() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/summary`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to load summary');

      const result = await response.json();
      this.summary = result.data;
      this.renderSummary();
      this.loadAttentionNeeded();
    } catch (error) {
      console.error('Error loading summary:', error);
    }
  }

  async loadAttentionNeeded() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/attention`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to load attention items');

      const result = await response.json();
      this.renderAttentionNeeded(result.data);
    } catch (error) {
      console.error('Error loading attention items:', error);
    }
  }

  async loadRecommendations(strategy = 'avalanche') {
    try {
      const response = await fetch(`${this.apiBaseUrl}/recommendations?strategy=${strategy}`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to load recommendations');

      const result = await response.json();
      this.renderRecommendations(result.data);
    } catch (error) {
      console.error('Error loading recommendations:', error);
    }
  }

  renderSummary() {
    if (!this.summary) return;

    const { overview } = this.summary;
    
    // Update summary cards
    const elements = {
      'total-debts': overview.totalDebts,
      'active-debts': overview.activeDebts,
      'total-balance': this.formatCurrency(overview.totalCurrentBalance),
      'total-paid': this.formatCurrency(overview.totalPaid),
      'monthly-payments': this.formatCurrency(overview.monthlyPayments),
      'payoff-progress': `${overview.payoffProgress}%`,
      'avg-interest-rate': `${overview.weightedInterestRate}%`
    };

    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });

    // Update progress bar
    const progressBar = document.getElementById('debt-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${overview.payoffProgress}%`;
    }
  }

  renderDebts(filter = 'all') {
    const container = document.getElementById('debts-list');
    if (!container) return;

    let filteredDebts = this.debts;
    if (filter !== 'all') {
      filteredDebts = this.debts.filter(debt => {
        if (filter === 'active') return debt.status === 'active';
        if (filter === 'paid-off') return debt.status === 'paid_off';
        if (filter === 'high-interest') return debt.interestRate > 15;
        return true;
      });
    }

    if (filteredDebts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-piggy-bank"></i>
          <p>No debts found. Great job staying debt-free!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filteredDebts.map(debt => this.createDebtCard(debt)).join('');
    
    // Bind action buttons
    container.querySelectorAll('.pay-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const debtId = e.target.closest('.debt-card').dataset.id;
        this.openPaymentModal(debtId);
      });
    });

    container.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const debtId = e.target.closest('.debt-card').dataset.id;
        this.viewDebtDetails(debtId);
      });
    });

    container.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const debtId = e.target.closest('.debt-card').dataset.id;
        this.editDebt(debtId);
      });
    });

    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const debtId = e.target.closest('.debt-card').dataset.id;
        this.deleteDebt(debtId);
      });
    });
  }

  createDebtCard(debt) {
    const progress = debt.progressPercentage || 0;
    const isPaidOff = debt.status === 'paid_off';
    const isOverdue = debt.isOverdue;
    
    return `
      <div class="debt-card ${isPaidOff ? 'paid-off' : ''} ${isOverdue ? 'overdue' : ''}" data-id="${debt._id}">
        <div class="debt-header">
          <div class="debt-info">
            <h4>${debt.name}</h4>
            <span class="lender">${debt.lender}</span>
            <span class="loan-type">${this.formatLoanType(debt.loanType)}</span>
          </div>
          <div class="debt-status">
            <span class="status-badge ${debt.status}">${this.formatStatus(debt.status)}</span>
            ${debt.priority !== 'medium' ? `<span class="priority-badge ${debt.priority}">${debt.priority}</span>` : ''}
          </div>
        </div>
        
        <div class="debt-details">
          <div class="detail-item">
            <span class="label">Current Balance</span>
            <span class="value ${isPaidOff ? 'paid' : 'balance'}">${this.formatCurrency(debt.currentBalance)}</span>
          </div>
          <div class="detail-item">
            <span class="label">Original Amount</span>
            <span class="value">${this.formatCurrency(debt.principalAmount)}</span>
          </div>
          <div class="detail-item">
            <span class="label">Interest Rate</span>
            <span class="value ${debt.interestRate > 15 ? 'high-interest' : ''}">${debt.interestRate}%</span>
          </div>
          <div class="detail-item">
            <span class="label">Monthly Payment</span>
            <span class="value">${this.formatCurrency(debt.monthlyPayment)}</span>
          </div>
        </div>
        
        <div class="debt-progress">
          <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${progress}%; background: ${debt.color || '#64ffda'}"></div>
          </div>
          <span class="progress-text">${progress}% paid off</span>
        </div>
        
        ${!isPaidOff ? `
          <div class="debt-meta">
            <span class="next-payment">
              <i class="fas fa-calendar"></i>
              Next: ${debt.nextPaymentDate ? this.formatDate(debt.nextPaymentDate) : 'Not set'}
              ${debt.daysUntilPayment !== null ? `(${debt.daysUntilPayment} days)` : ''}
            </span>
            <span class="payoff-date">
              <i class="fas fa-flag-checkered"></i>
              Payoff: ${debt.estimatedPayoffDate ? this.formatDate(debt.estimatedPayoffDate) : 'N/A'}
            </span>
          </div>
        ` : `
          <div class="debt-meta paid-off-message">
            <i class="fas fa-check-circle"></i>
            Paid off on ${this.formatDate(debt.lastPaymentDate)}
          </div>
        `}
        
        <div class="debt-actions">
          ${!isPaidOff ? `
            <button class="btn-pay pay-btn">
              <i class="fas fa-money-bill-wave"></i> Make Payment
            </button>
          ` : ''}
          <button class="btn-view view-btn">
            <i class="fas fa-eye"></i> Details
          </button>
          <button class="btn-edit edit-btn">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn-delete delete-btn">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }

  renderAttentionNeeded(items) {
    const container = document.getElementById('attention-needed');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = '<p class="no-alerts">No items need attention. You\'re on track!</p>';
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="attention-item ${item.severity}">
        <div class="attention-icon">
          <i class="fas ${this.getAttentionIcon(item.type)}"></i>
        </div>
        <div class="attention-content">
          <h5>${item.name}</h5>
          <p>${item.message}</p>
          <span class="action">${item.action}</span>
        </div>
      </div>
    `).join('');
  }

  renderRecommendations(data) {
    const container = document.getElementById('payoff-recommendations');
    if (!container || !data) return;

    container.innerHTML = `
      <div class="strategy-info">
        <h4>${data.strategy === 'avalanche' ? '💰 Debt Avalanche' : '🏔️ Debt Snowball'}</h4>
        <p>${data.strategyDescription}</p>
      </div>
      <div class="recommendations-list">
        ${data.recommendations.map((rec, index) => `
          <div class="recommendation-item priority-${rec.priority}">
            <div class="priority-number">${rec.priority}</div>
            <div class="rec-details">
              <h5>${rec.name}</h5>
              <p>${this.formatCurrency(rec.currentBalance)} at ${rec.interestRate}%</p>
              <span class="payoff-estimate">Payoff: ${rec.estimatedPayoffDate ? this.formatDate(rec.estimatedPayoffDate) : 'N/A'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  getAttentionIcon(type) {
    const icons = {
      overdue: 'fa-exclamation-circle',
      upcoming: 'fa-calendar-day',
      high_interest: 'fa-percentage',
      low_progress: 'fa-chart-line'
    };
    return icons[type] || 'fa-info-circle';
  }

  openDebtModal(debtId = null) {
    this.currentDebtId = debtId;
    const modal = document.getElementById('debt-modal');
    const form = document.getElementById('debt-form');
    const title = document.getElementById('debt-modal-title');
    
    if (debtId) {
      const debt = this.debts.find(d => d._id === debtId);
      if (debt) {
        title.textContent = 'Edit Debt';
        this.populateDebtForm(debt);
      }
    } else {
      title.textContent = 'Add New Debt';
      form.reset();
      document.getElementById('debt-id').value = '';
    }
    
    modal.classList.add('active');
  }

  openPaymentModal(debtId) {
    this.currentDebtId = debtId;
    const modal = document.getElementById('payment-modal');
    const debt = this.debts.find(d => d._id === debtId);
    
    if (debt) {
      document.getElementById('payment-debt-name').textContent = debt.name;
      document.getElementById('payment-current-balance').textContent = this.formatCurrency(debt.currentBalance);
      document.getElementById('payment-monthly-payment').textContent = this.formatCurrency(debt.monthlyPayment);
      document.getElementById('payment-amount').value = debt.monthlyPayment;
    }
    
    modal.classList.add('active');
  }

  closeModal(modal) {
    if (modal) {
      modal.classList.remove('active');
    }
  }

  populateDebtForm(debt) {
    document.getElementById('debt-id').value = debt._id;
    document.getElementById('debt-name').value = debt.name;
    document.getElementById('debt-lender').value = debt.lender;
    document.getElementById('debt-type').value = debt.loanType;
    document.getElementById('debt-principal').value = debt.principalAmount;
    document.getElementById('debt-balance').value = debt.currentBalance;
    document.getElementById('debt-interest-rate').value = debt.interestRate;
    document.getElementById('debt-interest-type').value = debt.interestType;
    document.getElementById('debt-monthly-payment').value = debt.monthlyPayment;
    document.getElementById('debt-minimum-payment').value = debt.minimumPayment || '';
    document.getElementById('debt-start-date').value = this.formatDateForInput(debt.startDate);
    document.getElementById('debt-maturity-date').value = this.formatDateForInput(debt.maturityDate);
    document.getElementById('debt-status').value = debt.status;
    document.getElementById('debt-priority').value = debt.priority;
    document.getElementById('debt-reminder-days').value = debt.reminderDays;
    document.getElementById('debt-auto-pay').checked = debt.isAutoPay;
    document.getElementById('debt-account-number').value = debt.accountNumber || '';
    document.getElementById('debt-notes').value = debt.notes || '';
  }

  async handleDebtSubmit(e) {
    e.preventDefault();
    
    const formData = {
      name: document.getElementById('debt-name').value,
      lender: document.getElementById('debt-lender').value,
      loanType: document.getElementById('debt-type').value,
      principalAmount: parseFloat(document.getElementById('debt-principal').value),
      currentBalance: parseFloat(document.getElementById('debt-balance').value),
      interestRate: parseFloat(document.getElementById('debt-interest-rate').value),
      interestType: document.getElementById('debt-interest-type').value,
      monthlyPayment: parseFloat(document.getElementById('debt-monthly-payment').value),
      minimumPayment: parseFloat(document.getElementById('debt-minimum-payment').value) || undefined,
      startDate: document.getElementById('debt-start-date').value,
      maturityDate: document.getElementById('debt-maturity-date').value,
      status: document.getElementById('debt-status').value,
      priority: document.getElementById('debt-priority').value,
      reminderDays: parseInt(document.getElementById('debt-reminder-days').value),
      isAutoPay: document.getElementById('debt-auto-pay').checked,
      accountNumber: document.getElementById('debt-account-number').value || undefined,
      notes: document.getElementById('debt-notes').value || undefined
    };

    const debtId = document.getElementById('debt-id').value;
    const url = debtId ? `${this.apiBaseUrl}/${debtId}` : this.apiBaseUrl;
    const method = debtId ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save debt');
      }

      this.showNotification(debtId ? 'Debt updated successfully' : 'Debt created successfully', 'success');
      this.closeModal(document.getElementById('debt-modal'));
      this.loadDebts();
      this.loadSummary();
    } catch (error) {
      console.error('Error saving debt:', error);
      this.showNotification(error.message, 'error');
    }
  }

  async handlePaymentSubmit(e) {
    e.preventDefault();
    
    const paymentData = {
      amount: parseFloat(document.getElementById('payment-amount').value),
      date: document.getElementById('payment-date').value || new Date().toISOString(),
      paymentMethod: document.getElementById('payment-method').value,
      notes: document.getElementById('payment-notes').value || undefined,
      isExtraPayment: document.getElementById('payment-is-extra').checked
    };

    try {
      const response = await fetch(`${this.apiBaseUrl}/${this.currentDebtId}/payments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(paymentData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to record payment');
      }

      const result = await response.json();
      
      if (result.data.isPaidOff) {
        this.showNotification('🎉 Congratulations! You\'ve paid off this debt!', 'success');
      } else {
        this.showNotification('Payment recorded successfully', 'success');
      }
      
      this.closeModal(document.getElementById('payment-modal'));
      this.loadDebts();
      this.loadSummary();
    } catch (error) {
      console.error('Error recording payment:', error);
      this.showNotification(error.message, 'error');
    }
  }

  async viewDebtDetails(debtId) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/${debtId}`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to load debt details');

      const result = await response.json();
      this.renderDebtDetails(result.data);
      
      const modal = document.getElementById('debt-details-modal');
      modal.classList.add('active');
    } catch (error) {
      console.error('Error loading debt details:', error);
      this.showNotification('Failed to load debt details', 'error');
    }
  }

  renderDebtDetails(debt) {
    const container = document.getElementById('debt-details-content');
    if (!container) return;

    container.innerHTML = `
      <div class="debt-details-header">
        <h3>${debt.name}</h3>
        <span class="lender">${debt.lender}</span>
      </div>
      
      <div class="debt-stats-grid">
        <div class="stat-card">
          <span class="stat-label">Current Balance</span>
          <span class="stat-value">${this.formatCurrency(debt.currentBalance)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Original Amount</span>
          <span class="stat-value">${this.formatCurrency(debt.principalAmount)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Interest Rate</span>
          <span class="stat-value">${debt.interestRate}%</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Monthly Payment</span>
          <span class="stat-value">${this.formatCurrency(debt.monthlyPayment)}</span>
        </div>
      </div>
      
      <div class="amortization-section">
        <h4>Amortization Schedule (Next 12 Months)</h4>
        <table class="amortization-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Payment</th>
              <th>Principal</th>
              <th>Interest</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            ${debt.amortizationSchedule.map(row => `
              <tr>
                <td>${row.month}</td>
                <td>${this.formatCurrency(row.payment)}</td>
                <td>${this.formatCurrency(row.principalPayment)}</td>
                <td>${this.formatCurrency(row.interestPayment)}</td>
                <td>${this.formatCurrency(row.remainingBalance)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      ${debt.earlyPayoffAnalysis ? `
        <div class="early-payoff-section">
          <h4>Early Payoff Analysis (+₹100/month)</h4>
          <div class="payoff-stats">
            <div class="payoff-stat">
              <span class="label">Months Saved</span>
              <span class="value">${debt.earlyPayoffAnalysis.monthsSaved}</span>
            </div>
            <div class="payoff-stat">
              <span class="label">Interest Saved</span>
              <span class="value">${this.formatCurrency(debt.earlyPayoffAnalysis.interestSaved)}</span>
            </div>
            <div class="payoff-stat">
              <span class="label">New Payoff Date</span>
              <span class="value">${this.formatDate(debt.earlyPayoffAnalysis.breakEvenDate)}</span>
            </div>
          </div>
        </div>
      ` : ''}
    `;
  }

  async editDebt(debtId) {
    this.openDebtModal(debtId);
  }

  async deleteDebt(debtId) {
    if (!confirm('Are you sure you want to delete this debt? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/${debtId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete debt');
      }

      this.showNotification('Debt deleted successfully', 'success');
      this.loadDebts();
      this.loadSummary();
    } catch (error) {
      console.error('Error deleting debt:', error);
      this.showNotification(error.message, 'error');
    }
  }

  filterDebts(filter) {
    // Update active filter button
    document.querySelectorAll('.debt-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    
    this.renderDebts(filter);
  }

  formatCurrency(amount) {
    if (amount === null || amount === undefined) return '₹0.00';
    return '₹' + parseFloat(amount).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
  }

  formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatDateForInput(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  }

  formatLoanType(type) {
    const types = {
      personal: 'Personal Loan',
      mortgage: 'Mortgage',
      auto: 'Auto Loan',
      student: 'Student Loan',
      credit_card: 'Credit Card',
      home_equity: 'Home Equity',
      business: 'Business Loan',
      medical: 'Medical Debt',
      other: 'Other'
    };
    return types[type] || type;
  }

  formatStatus(status) {
    const statuses = {
      active: 'Active',
      paid_off: 'Paid Off',
      defaulted: 'Defaulted',
      refinanced: 'Refinanced',
      in_grace_period: 'Grace Period'
    };
    return statuses[status] || status;
  }

  getAuthToken() {
    // Get token from localStorage or your auth system
    return localStorage.getItem('authToken') || '';
  }

  showNotification(message, type = 'info') {
    // Use your app's notification system
    if (window.showNotification) {
      window.showNotification(message, type);
    } else {
      alert(message);
    }
  }
}

// Initialize debt tracker when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.debtTracker = new DebtTracker();
});
