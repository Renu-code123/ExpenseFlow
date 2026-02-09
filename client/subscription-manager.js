/**
 * Subscription Manager Frontend
 * Handles subscription tracking, auto-detection, ghost subscriptions, and renewal reminders
 */

class SubscriptionManager {
  constructor() {
    this.subscriptions = [];
    this.detectedSubscriptions = [];
    this.statistics = null;
    this.init();
  }

  init() {
    this.loadSubscriptions();
    this.setupEventListeners();
    this.loadStatistics();
    this.checkForDetectedSubscriptions();
  }

  setupEventListeners() {
    // Add subscription button
    document.getElementById('add-subscription-btn')?.addEventListener('click', () => {
      this.showAddSubscriptionModal();
    });

    // Detect subscriptions button
    document.getElementById('detect-subscriptions-btn')?.addEventListener('click', () => {
      this.detectSubscriptions();
    });

    // Export subscriptions button
    document.getElementById('export-subscriptions-btn')?.addEventListener('click', () => {
      this.exportSubscriptions();
    });

    // Filter change
    document.querySelectorAll('.subscription-filter').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.subscription-filter').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.filterSubscriptions(e.target.dataset.filter);
      });
    });
  }

  async loadSubscriptions() {
    try {
      const response = await fetch('/api/subscriptions', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      const data = await response.json();
      if (data.success) {
        this.subscriptions = data.data;
        this.renderSubscriptions();
      }
    } catch (error) {
      console.error('Error loading subscriptions:', error);
      this.showError('Failed to load subscriptions');
    }
  }

  async loadStatistics() {
    try {
      const response = await fetch('/api/subscriptions/statistics', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      const data = await response.json();
      if (data.success) {
        this.statistics = data.data;
        this.renderStatistics();
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  }

  async detectSubscriptions() {
    try {
      const btn = document.getElementById('detect-subscriptions-btn');
      btn.textContent = 'Detecting...';
      btn.disabled = true;

      const response = await fetch('/api/subscriptions/detect', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      const data = await response.json();
      if (data.success) {
        this.detectedSubscriptions = data.data;
        this.showDetectedSubscriptions();
      }

      btn.textContent = '🔍 Detect Subscriptions';
      btn.disabled = false;
    } catch (error) {
      console.error('Error detecting subscriptions:', error);
      this.showError('Failed to detect subscriptions');
      document.getElementById('detect-subscriptions-btn').textContent = '🔍 Detect Subscriptions';
      document.getElementById('detect-subscriptions-btn').disabled = false;
    }
  }

  async checkForDetectedSubscriptions() {
    // Auto-detect on first load
    setTimeout(() => {
      if (this.subscriptions.length === 0) {
        this.detectSubscriptions();
      }
    }, 1000);
  }

  renderStatistics() {
    if (!this.statistics) return;

    const statsHtml = `
      <div class="subscription-stats">
        <div class="stat-card">
          <div class="stat-icon">💰</div>
          <div class="stat-content">
            <div class="stat-value">₹${this.statistics.monthlyTotal.toFixed(2)}</div>
            <div class="stat-label">Monthly Cost</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📅</div>
          <div class="stat-content">
            <div class="stat-value">₹${this.statistics.yearlyTotal.toFixed(2)}</div>
            <div class="stat-label">Yearly Cost</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📺</div>
          <div class="stat-content">
            <div class="stat-value">${this.statistics.activeCount}</div>
            <div class="stat-label">Active Subscriptions</div>
          </div>
        </div>
        <div class="stat-card ${this.statistics.unusedCount > 0 ? 'stat-warning' : ''}">
          <div class="stat-icon">👻</div>
          <div class="stat-content">
            <div class="stat-value">${this.statistics.unusedCount}</div>
            <div class="stat-label">Ghost Subscriptions</div>
            ${this.statistics.unusedCount > 0 ? 
              `<div class="stat-sublabel">Wasting ₹${this.statistics.unusedMonthlyCost.toFixed(2)}/mo</div>` : ''
            }
          </div>
        </div>
        ${this.statistics.upcomingPayments > 0 ? `
          <div class="stat-card stat-info">
            <div class="stat-icon">⏰</div>
            <div class="stat-content">
              <div class="stat-value">${this.statistics.upcomingPayments}</div>
              <div class="stat-label">Upcoming Payments</div>
              <div class="stat-sublabel">₹${this.statistics.upcomingPaymentsAmount.toFixed(2)} due soon</div>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    document.getElementById('subscription-statistics').innerHTML = statsHtml;
  }

  renderSubscriptions(filter = 'all') {
    let filtered = this.subscriptions;

    if (filter === 'active') {
      filtered = this.subscriptions.filter(s => s.status === 'active' || s.status === 'trial');
    } else if (filter === 'unused') {
      filtered = this.subscriptions.filter(s => s.isUnused);
    } else if (filter === 'upcoming') {
      filtered = this.subscriptions.filter(s => s.daysUntilPayment <= 7);
    }

    const container = document.getElementById('subscription-list');
    
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <h3>No Subscriptions Found</h3>
          <p>Start tracking your recurring expenses and subscriptions</p>
          <button class="btn btn-primary" onclick="subscriptionManager.showAddSubscriptionModal()">
            ➕ Add Subscription
          </button>
          <button class="btn btn-secondary" onclick="subscriptionManager.detectSubscriptions()">
            🔍 Auto-Detect from Expenses
          </button>
        </div>
      `;
      return;
    }

    const html = filtered.map(sub => this.renderSubscriptionCard(sub)).join('');
    container.innerHTML = html;
  }

  renderSubscriptionCard(sub) {
    const daysUntil = sub.daysUntilPayment;
    const isUpcoming = daysUntil <= 7;
    const isUnused = sub.isUnused;
    const isTrial = sub.status === 'trial';

    let statusClass = 'subscription-active';
    let statusText = 'Active';
    
    if (sub.status === 'cancelled') {
      statusClass = 'subscription-cancelled';
      statusText = 'Cancelled';
    } else if (sub.status === 'paused') {
      statusClass = 'subscription-paused';
      statusText = 'Paused';
    } else if (isTrial) {
      statusClass = 'subscription-trial';
      statusText = `Trial (${sub.daysUntilTrialEnds} days left)`;
    }

    return `
      <div class="subscription-card ${statusClass} ${isUnused ? 'subscription-unused' : ''} ${isUpcoming ? 'subscription-upcoming' : ''}">
        <div class="subscription-header">
          <div class="subscription-logo">${sub.logo || this.getCategoryEmoji(sub.category)}</div>
          <div class="subscription-info">
            <h3>${sub.name}</h3>
            <span class="subscription-category">${sub.category}</span>
          </div>
          <div class="subscription-actions">
            <button class="btn-icon" onclick="subscriptionManager.editSubscription('${sub._id}')" title="Edit">
              ✏️
            </button>
            <button class="btn-icon" onclick="subscriptionManager.deleteSubscription('${sub._id}')" title="Delete">
              🗑️
            </button>
          </div>
        </div>

        <div class="subscription-details">
          <div class="detail-row">
            <span class="detail-label">Amount:</span>
            <span class="detail-value">${sub.currency} ${sub.amount} / ${sub.billingCycle}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Monthly Equivalent:</span>
            <span class="detail-value">₹${sub.monthlyAmount.toFixed(2)}/mo</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Next Payment:</span>
            <span class="detail-value ${isUpcoming ? 'text-warning' : ''}">
              ${new Date(sub.nextPaymentDate).toLocaleDateString('en-IN', { 
                day: 'numeric', month: 'short', year: 'numeric' 
              })}
              ${isUpcoming ? ` (in ${daysUntil} day${daysUntil !== 1 ? 's' : ''})` : ''}
            </span>
          </div>
          ${sub.lastUsedDate ? `
            <div class="detail-row">
              <span class="detail-label">Last Used:</span>
              <span class="detail-value">${new Date(sub.lastUsedDate).toLocaleDateString('en-IN')}</span>
            </div>
          ` : ''}
        </div>

        <div class="subscription-status">
          <span class="status-badge ${statusClass}">${statusText}</span>
          ${sub.isAutoDetected ? '<span class="status-badge badge-auto">🤖 Auto-Detected</span>' : ''}
          ${isUnused ? '<span class="status-badge badge-ghost">👻 Unused</span>' : ''}
          ${isUpcoming ? '<span class="status-badge badge-upcoming">⏰ Due Soon</span>' : ''}
        </div>

        ${isUnused ? `
          <div class="subscription-alert alert-warning">
            ⚠️ This subscription hasn't been used in ${sub.unusedDays} days. Consider cancelling to save ₹${sub.monthlyAmount.toFixed(2)}/mo
            <button class="btn btn-sm btn-warning" onclick="subscriptionManager.cancelSubscription('${sub._id}')">
              Cancel Now
            </button>
          </div>
        ` : ''}

        <div class="subscription-footer">
          <button class="btn btn-sm" onclick="subscriptionManager.markAsUsed('${sub._id}')">
            ✅ Mark as Used
          </button>
          ${sub.status === 'active' ? `
            <button class="btn btn-sm" onclick="subscriptionManager.pauseSubscription('${sub._id}')">
              ⏸️ Pause
            </button>
          ` : sub.status === 'paused' ? `
            <button class="btn btn-sm" onclick="subscriptionManager.resumeSubscription('${sub._id}')">
              ▶️ Resume
            </button>
          ` : ''}
          <button class="btn btn-sm" onclick="subscriptionManager.recordPayment('${sub._id}')">
            💳 Record Payment
          </button>
        </div>
      </div>
    `;
  }

  showDetectedSubscriptions() {
    if (this.detectedSubscriptions.length === 0) {
      this.showInfo('No recurring patterns detected in your expenses');
      return;
    }

    const html = `
      <div class="modal" id="detected-subscriptions-modal">
        <div class="modal-content large">
          <div class="modal-header">
            <h2>🔍 Detected Subscriptions</h2>
            <button class="modal-close" onclick="subscriptionManager.closeModal('detected-subscriptions-modal')">✕</button>
          </div>
          <div class="modal-body">
            <p>We found ${this.detectedSubscriptions.length} potential subscription(s) in your expense history:</p>
            <div class="detected-list">
              ${this.detectedSubscriptions.map((sub, index) => `
                <div class="detected-item">
                  <div class="detected-header">
                    <div class="detected-logo">${sub.logo || '📦'}</div>
                    <div class="detected-info">
                      <h3>${sub.name}</h3>
                      <span class="detected-confidence">Confidence: ${sub.confidence}%</span>
                    </div>
                  </div>
                  <div class="detected-details">
                    <p><strong>Amount:</strong> ₹${sub.amount}</p>
                    <p><strong>Billing Cycle:</strong> ${sub.billingCycle}</p>
                    <p><strong>Category:</strong> ${sub.category}</p>
                    <p><strong>Occurrences:</strong> ${sub.occurrences} times in last 90 days</p>
                  </div>
                  <button class="btn btn-primary" onclick="subscriptionManager.confirmDetection(${index})">
                    ✅ Add as Subscription
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('detected-subscriptions-modal').style.display = 'flex';
  }

  async confirmDetection(index) {
    try {
      const detection = this.detectedSubscriptions[index];
      
      const response = await fetch('/api/subscriptions/detect/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(detection)
      });

      const data = await response.json();
      if (data.success) {
        this.showSuccess('Subscription added successfully!');
        this.detectedSubscriptions.splice(index, 1);
        await this.loadSubscriptions();
        await this.loadStatistics();
        
        if (this.detectedSubscriptions.length === 0) {
          this.closeModal('detected-subscriptions-modal');
        } else {
          this.showDetectedSubscriptions();
        }
      }
    } catch (error) {
      console.error('Error confirming detection:', error);
      this.showError('Failed to add subscription');
    }
  }

  showAddSubscriptionModal() {
    const html = `
      <div class="modal" id="add-subscription-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>➕ Add Subscription</h2>
            <button class="modal-close" onclick="subscriptionManager.closeModal('add-subscription-modal')">✕</button>
          </div>
          <div class="modal-body">
            <form id="add-subscription-form" onsubmit="subscriptionManager.addSubscription(event)">
              <div class="form-group">
                <label for="sub-name">Name *</label>
                <input type="text" id="sub-name" required placeholder="e.g., Netflix, Spotify">
              </div>
              
              <div class="form-group">
                <label for="sub-amount">Amount *</label>
                <input type="number" id="sub-amount" required min="0" step="0.01" placeholder="199.00">
              </div>
              
              <div class="form-group">
                <label for="sub-currency">Currency</label>
                <select id="sub-currency">
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="sub-billing-cycle">Billing Cycle *</label>
                <select id="sub-billing-cycle" required>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="semi_annual">Semi-Annual</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="sub-category">Category *</label>
                <select id="sub-category" required>
                  <option value="streaming">📺 Streaming</option>
                  <option value="music">🎵 Music</option>
                  <option value="software">💻 Software</option>
                  <option value="cloud_storage">☁️ Cloud Storage</option>
                  <option value="fitness">💪 Fitness</option>
                  <option value="food_delivery">🍔 Food Delivery</option>
                  <option value="news">📰 News & Media</option>
                  <option value="gaming">🎮 Gaming</option>
                  <option value="utilities">🔌 Utilities</option>
                  <option value="other">📦 Other</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="sub-next-date">Next Payment Date *</label>
                <input type="date" id="sub-next-date" required>
              </div>
              
              <div class="form-group">
                <label for="sub-description">Description</label>
                <textarea id="sub-description" rows="3" placeholder="Optional notes about this subscription"></textarea>
              </div>
              
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="subscriptionManager.closeModal('add-subscription-modal')">
                  Cancel
                </button>
                <button type="submit" class="btn btn-primary">
                  Add Subscription
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('add-subscription-modal').style.display = 'flex';
    
    // Set default next payment date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('sub-next-date').valueAsDate = tomorrow;
  }

  async addSubscription(event) {
    event.preventDefault();

    const formData = {
      name: document.getElementById('sub-name').value,
      amount: parseFloat(document.getElementById('sub-amount').value),
      currency: document.getElementById('sub-currency').value,
      billingCycle: document.getElementById('sub-billing-cycle').value,
      category: document.getElementById('sub-category').value,
      nextPaymentDate: document.getElementById('sub-next-date').value,
      description: document.getElementById('sub-description').value
    };

    try {
      const response = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      if (data.success) {
        this.showSuccess('Subscription added successfully!');
        this.closeModal('add-subscription-modal');
        await this.loadSubscriptions();
        await this.loadStatistics();
      } else {
        this.showError(data.error || 'Failed to add subscription');
      }
    } catch (error) {
      console.error('Error adding subscription:', error);
      this.showError('Failed to add subscription');
    }
  }

  async markAsUsed(id) {
    try {
      const response = await fetch(`/api/subscriptions/${id}/usage`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      const data = await response.json();
      if (data.success) {
        this.showSuccess('Marked as used!');
        await this.loadSubscriptions();
        await this.loadStatistics();
      }
    } catch (error) {
      console.error('Error marking as used:', error);
      this.showError('Failed to update usage');
    }
  }

  async pauseSubscription(id) {
    try {
      const response = await fetch(`/api/subscriptions/${id}/pause`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      const data = await response.json();
      if (data.success) {
        this.showSuccess('Subscription paused');
        await this.loadSubscriptions();
        await this.loadStatistics();
      }
    } catch (error) {
      console.error('Error pausing subscription:', error);
      this.showError('Failed to pause subscription');
    }
  }

  async resumeSubscription(id) {
    try {
      const response = await fetch(`/api/subscriptions/${id}/resume`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      const data = await response.json();
      if (data.success) {
        this.showSuccess('Subscription resumed');
        await this.loadSubscriptions();
        await this.loadStatistics();
      }
    } catch (error) {
      console.error('Error resuming subscription:', error);
      this.showError('Failed to resume subscription');
    }
  }

  async cancelSubscription(id) {
    if (!confirm('Are you sure you want to cancel this subscription?')) return;

    try {
      const response = await fetch(`/api/subscriptions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      const data = await response.json();
      if (data.success) {
        this.showSuccess('Subscription cancelled');
        await this.loadSubscriptions();
        await this.loadStatistics();
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      this.showError('Failed to cancel subscription');
    }
  }

  async recordPayment(id) {
    try {
      const response = await fetch(`/api/subscriptions/${id}/payment`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      const data = await response.json();
      if (data.success) {
        this.showSuccess('Payment recorded!');
        await this.loadSubscriptions();
        await this.loadStatistics();
      }
    } catch (error) {
      console.error('Error recording payment:', error);
      this.showError('Failed to record payment');
    }
  }

  async exportSubscriptions() {
    try {
      const response = await fetch('/api/subscriptions/export?format=csv', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `subscriptions_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        this.showSuccess('Subscriptions exported!');
      }
    } catch (error) {
      console.error('Error exporting subscriptions:', error);
      this.showError('Failed to export subscriptions');
    }
  }

  filterSubscriptions(filter) {
    this.renderSubscriptions(filter);
  }

  getCategoryEmoji(category) {
    const emojis = {
      streaming: '📺',
      music: '🎵',
      software: '💻',
      cloud_storage: '☁️',
      fitness: '💪',
      food_delivery: '🍔',
      news: '📰',
      gaming: '🎮',
      utilities: '🔌',
      other: '📦'
    };
    return emojis[category] || '📦';
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.remove();
    }
  }

  showSuccess(message) {
    this.showToast(message, 'success');
  }

  showError(message) {
    this.showToast(message, 'error');
  }

  showInfo(message) {
    this.showToast(message, 'info');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 100);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }
}

// Initialize subscription manager when page loads
let subscriptionManager;
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('subscription-list')) {
    subscriptionManager = new SubscriptionManager();
  }
});
