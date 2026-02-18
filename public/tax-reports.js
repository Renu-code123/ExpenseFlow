// Auth check handled by protect.js (Clerk-based)

/**
 * Tax Calculator & Reports Client-Side Manager
 * Handles tax calculations, report generation, and PDF exports
 */
class TaxReportsManager {
  constructor() {
    this.baseUrl = '/api';
    this.currentTaxYear = new Date().getFullYear();
    this.profile = null;
    this.reports = [];
    this.init();
  }

  async init() {
    await this.loadTaxProfile();
    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Tax year selector
    const yearSelector = document.getElementById('tax-year-selector');
    if (yearSelector) {
      yearSelector.addEventListener('change', (e) => {
        this.currentTaxYear = parseInt(e.target.value);
        this.refreshAll();
      });
    }

    // Regime toggle
    const regimeToggle = document.getElementById('regime-toggle');
    if (regimeToggle) {
      regimeToggle.addEventListener('change', (e) => {
        this.updateRegime(e.target.checked ? 'new' : 'old');
      });
    }

    // Report generation form
    const reportForm = document.getElementById('report-form');
    if (reportForm) {
      reportForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleReportGeneration(e.target);
      });
    }

    // Quick report buttons
    document.querySelectorAll('[data-quick-report]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.generateQuickReport(btn.dataset.quickReport, btn.dataset.reportType);
      });
    });
  }

  /**
   * Get auth token
   */
  getToken() {
    return localStorage.getItem('token');
  }

  /**
   * Make authenticated request
   */
  async request(url, options = {}) {
    const token = this.getToken();
  if (!token) {
  console.warn('No auth token available');
  throw new Error('Not authenticated');
}

    const config = {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const response = await fetch(`${this.baseUrl}${url}`, config);
    
    if (response.status === 401) {
      console.warn('API returned 401 - session may have expired');
      return;
    }

    return response;
  }

  // ==================== TAX PROFILE ====================

  /**
   * Load tax profile
   */
  async loadTaxProfile() {
    try {
      const response = await this.request(`/tax/profile?taxYear=${this.currentTaxYear}`);
      const data = await response.json();
      
      if (data.success) {
        this.profile = data.data;
        this.updateProfileUI();
      }
    } catch (error) {
      console.error('Failed to load tax profile:', error);
      this.showNotification('Failed to load tax profile', 'error');
    }
  }

  /**
   * Update tax profile
   */
  async updateProfile(updates) {
    try {
      const response = await this.request(`/tax/profile?taxYear=${this.currentTaxYear}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      const data = await response.json();
      
      if (data.success) {
        this.profile = data.data;
        this.updateProfileUI();
        this.showNotification('Tax profile updated', 'success');
        await this.calculateTax();
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
      this.showNotification('Failed to update profile', 'error');
    }
  }

  /**
   * Update profile UI
   */
  updateProfileUI() {
    if (!this.profile) return;

    const elements = {
      'profile-country': this.profile.country,
      'profile-regime': this.profile.regime,
      'profile-standard-deduction': this.formatCurrency(this.profile.standardDeduction),
      'profile-tds': this.formatCurrency(this.profile.tdsDeducted),
      'profile-advance-tax': this.formatCurrency(this.profile.advanceTaxPaid)
    };

    Object.entries(elements).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });

    // Update regime toggle
    const regimeToggle = document.getElementById('regime-toggle');
    if (regimeToggle) {
      regimeToggle.checked = this.profile.regime === 'new';
    }
  }

  /**
   * Update tax regime
   */
  async updateRegime(regime) {
    await this.updateProfile({ regime });
  }

  // ==================== TAX CALCULATION ====================

  /**
   * Calculate tax
   */
  async calculateTax(customDeductions = []) {
    try {
      this.showLoading('tax-calculation');
      
      const response = await this.request('/tax/calculate', {
        method: 'POST',
        body: JSON.stringify({
          taxYear: this.currentTaxYear,
          customDeductions
        })
      });
      const data = await response.json();
      
      if (data.success) {
        this.displayTaxCalculation(data.data);
      }
    } catch (error) {
      console.error('Tax calculation error:', error);
      this.showNotification('Failed to calculate tax', 'error');
    } finally {
      this.hideLoading('tax-calculation');
    }
  }

  /**
   * Display tax calculation
   */
  displayTaxCalculation(calc) {
    const container = document.getElementById('tax-calculation-result');
    if (!container) return;

    container.innerHTML = `
      <div class="tax-summary-grid">
        <div class="tax-card">
          <h4>Gross Income</h4>
          <p class="amount">${this.formatCurrency(calc.grossIncome)}</p>
        </div>
        <div class="tax-card">
          <h4>Total Deductions</h4>
          <p class="amount">${this.formatCurrency(calc.totalDeductions)}</p>
        </div>
        <div class="tax-card">
          <h4>Taxable Income</h4>
          <p class="amount">${this.formatCurrency(calc.taxableIncome)}</p>
        </div>
        <div class="tax-card highlight">
          <h4>Total Tax</h4>
          <p class="amount">${this.formatCurrency(calc.totalTax)}</p>
          <span class="rate">Effective Rate: ${calc.effectiveRate}%</span>
        </div>
      </div>

      <div class="tax-breakdown">
        <h4>Tax Breakdown</h4>
        <table class="tax-table">
          <thead>
            <tr>
              <th>Income Slab</th>
              <th>Rate</th>
              <th>Taxable Amount</th>
              <th>Tax</th>
            </tr>
          </thead>
          <tbody>
            ${calc.taxCalculation.map(t => `
              <tr>
                <td>${t.range}</td>
                <td>${t.rate}%</td>
                <td>${this.formatCurrency(t.taxableAmount)}</td>
                <td>${this.formatCurrency(t.tax)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3">Base Tax</td>
              <td>${this.formatCurrency(calc.baseTax)}</td>
            </tr>
            <tr>
              <td colspan="3">Surcharge</td>
              <td>${this.formatCurrency(calc.surcharge)}</td>
            </tr>
            <tr>
              <td colspan="3">Health & Education Cess (4%)</td>
              <td>${this.formatCurrency(calc.cess)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="3">Total Tax Liability</td>
              <td>${this.formatCurrency(calc.totalTax)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="tax-payable">
        <div class="tax-card ${calc.taxPayable > 0 ? 'due' : 'refund'}">
          <h4>${calc.taxPayable > 0 ? 'Tax Payable' : 'Tax Refund'}</h4>
          <p class="amount">${this.formatCurrency(calc.taxPayable > 0 ? calc.taxPayable : calc.taxRefund)}</p>
          <small>After TDS (${this.formatCurrency(calc.tdsDeducted)}) and Advance Tax (${this.formatCurrency(calc.advanceTaxPaid)})</small>
        </div>
      </div>

      ${calc.deductions.length > 0 ? `
        <div class="deductions-breakdown">
          <h4>Deductions Summary</h4>
          <table class="tax-table">
            <thead>
              <tr>
                <th>Deduction</th>
                <th>Section</th>
                <th>Claimed</th>
                <th>Limit</th>
                <th>Allowed</th>
              </tr>
            </thead>
            <tbody>
              ${calc.deductions.map(d => `
                <tr>
                  <td>${d.name}</td>
                  <td>${d.section || '-'}</td>
                  <td>${this.formatCurrency(d.claimed)}</td>
                  <td>${d.limit ? this.formatCurrency(d.limit) : 'No limit'}</td>
                  <td>${this.formatCurrency(d.allowed)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
  }

  /**
   * Compare tax regimes
   */
  async compareRegimes() {
    try {
      this.showLoading('regime-comparison');
      
      const response = await this.request(`/tax/compare-regimes?taxYear=${this.currentTaxYear}`);
      const data = await response.json();
      
      if (data.success) {
        this.displayRegimeComparison(data.data);
      }
    } catch (error) {
      console.error('Regime comparison error:', error);
      this.showNotification('Failed to compare regimes', 'error');
    } finally {
      this.hideLoading('regime-comparison');
    }
  }

  /**
   * Display regime comparison
   */
  displayRegimeComparison(comparison) {
    const container = document.getElementById('regime-comparison');
    if (!container) return;

    container.innerHTML = `
      <div class="regime-comparison-grid">
        <div class="regime-card ${comparison.recommendation === 'new' ? 'recommended' : ''}">
          <h4>New Regime</h4>
          <div class="regime-details">
            <p>Taxable Income: ${this.formatCurrency(comparison.newRegime.taxableIncome)}</p>
            <p>Deductions: ${this.formatCurrency(comparison.newRegime.deductions)}</p>
            <p class="tax-amount">Tax: ${this.formatCurrency(comparison.newRegime.totalTax)}</p>
            <p class="rate">Effective Rate: ${comparison.newRegime.effectiveRate}%</p>
          </div>
          ${comparison.recommendation === 'new' ? '<span class="badge">Recommended</span>' : ''}
        </div>
        <div class="regime-card ${comparison.recommendation === 'old' ? 'recommended' : ''}">
          <h4>Old Regime</h4>
          <div class="regime-details">
            <p>Taxable Income: ${this.formatCurrency(comparison.oldRegime.taxableIncome)}</p>
            <p>Deductions: ${this.formatCurrency(comparison.oldRegime.deductions)}</p>
            <p class="tax-amount">Tax: ${this.formatCurrency(comparison.oldRegime.totalTax)}</p>
            <p class="rate">Effective Rate: ${comparison.oldRegime.effectiveRate}%</p>
          </div>
          ${comparison.recommendation === 'old' ? '<span class="badge">Recommended</span>' : ''}
        </div>
      </div>
      <div class="regime-recommendation">
        <p class="savings-message">${comparison.message}</p>
      </div>
    `;
  }

  // ==================== REPORTS ====================

  /**
   * Generate report
   */
  async generateReport(reportType, startDate, endDate, currency = 'INR') {
    try {
      this.showLoading('report-generation');
      
      const response = await this.request('/reports/generate', {
        method: 'POST',
        body: JSON.stringify({
          reportType,
          startDate,
          endDate,
          currency
        })
      });
      const data = await response.json();
      
      if (data.success) {
        this.showNotification('Report generated successfully', 'success');
        await this.loadReports();
        this.displayReport(data.data);
        return data.data;
      }
    } catch (error) {
      console.error('Report generation error:', error);
      this.showNotification('Failed to generate report', 'error');
    } finally {
      this.hideLoading('report-generation');
    }
  }

  /**
   * Handle report form submission
   */
  async handleReportGeneration(form) {
    const formData = new FormData(form);
    await this.generateReport(
      formData.get('reportType'),
      formData.get('startDate'),
      formData.get('endDate'),
      formData.get('currency') || 'INR'
    );
  }

  /**
   * Generate quick report
   */
  async generateQuickReport(period, reportType = 'expense_summary') {
    try {
      this.showLoading('report-generation');
      
      const response = await this.request(`/reports/quick/${period}`, {
        method: 'POST',
        body: JSON.stringify({ reportType })
      });
      const data = await response.json();
      
      if (data.success) {
        this.showNotification(`${period} report generated`, 'success');
        await this.loadReports();
        this.displayReport(data.data);
      }
    } catch (error) {
      console.error('Quick report error:', error);
      this.showNotification('Failed to generate quick report', 'error');
    } finally {
      this.hideLoading('report-generation');
    }
  }

  /**
   * Load user's reports
   */
  async loadReports(page = 1, limit = 10) {
    try {
      const response = await this.request(`/reports?page=${page}&limit=${limit}`);
      const data = await response.json();
      
      if (data.success) {
        this.reports = data.data;
        this.displayReportsList(data.data, data.pagination);
      }
    } catch (error) {
      console.error('Failed to load reports:', error);
    }
  }

  /**
   * Display reports list
   */
  displayReportsList(reports, pagination) {
    const container = document.getElementById('reports-list');
    if (!container) return;

    if (reports.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No reports generated yet</p>
          <p class="hint">Generate your first financial report above</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <table class="reports-table">
        <thead>
          <tr>
            <th>Report</th>
            <th>Type</th>
            <th>Period</th>
            <th>Generated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${reports.map(report => `
            <tr data-report-id="${report._id}">
              <td>${report.title}</td>
              <td><span class="badge">${this.formatReportType(report.reportType)}</span></td>
              <td>${this.formatDateRange(report.dateRange)}</td>
              <td>${this.formatDate(report.generatedAt)}</td>
              <td class="actions">
                <button class="btn-icon" onclick="taxReports.viewReport('${report._id}')" title="View">
                  <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                </button>
                <button class="btn-icon" onclick="taxReports.downloadPDF('${report._id}')" title="Download PDF">
                  <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                </button>
                <button class="btn-icon danger" onclick="taxReports.deleteReport('${report._id}')" title="Delete">
                  <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      ${pagination && pagination.pages > 1 ? `
        <div class="pagination">
          ${Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => `
            <button class="page-btn ${p === pagination.page ? 'active' : ''}" onclick="taxReports.loadReports(${p})">
              ${p}
            </button>
          `).join('')}
        </div>
      ` : ''}
    `;
  }

  /**
   * View report
   */
  async viewReport(reportId) {
    try {
      const response = await this.request(`/reports/${reportId}`);
      const data = await response.json();
      
      if (data.success) {
        this.displayReport(data.data);
      }
    } catch (error) {
      console.error('Failed to load report:', error);
      this.showNotification('Failed to load report', 'error');
    }
  }

  /**
   * Display report
   */
  displayReport(report) {
    const container = document.getElementById('report-view');
    if (!container) return;

    let content = `
      <div class="report-header">
        <h3>${report.title}</h3>
        <p class="report-period">${this.formatDateRange(report.dateRange)}</p>
        <div class="report-actions">
          <button class="btn btn-primary" onclick="taxReports.downloadPDF('${report._id}')">
            Download PDF
          </button>
        </div>
      </div>
    `;

    // Summary section
    content += `
      <div class="report-summary">
        <div class="summary-card income">
          <h4>Total Income</h4>
          <p>${this.formatCurrency(report.totalIncome)}</p>
        </div>
        <div class="summary-card expense">
          <h4>Total Expenses</h4>
          <p>${this.formatCurrency(report.totalExpenses)}</p>
        </div>
        <div class="summary-card ${report.netIncome >= 0 ? 'profit' : 'loss'}">
          <h4>Net ${report.netIncome >= 0 ? 'Savings' : 'Loss'}</h4>
          <p>${this.formatCurrency(Math.abs(report.netIncome))}</p>
        </div>
      </div>
    `;

    // Income breakdown
    if (report.incomeBreakdown && report.incomeBreakdown.length > 0) {
      content += this.renderBreakdownTable('Income Breakdown', report.incomeBreakdown, 'income');
    }

    // Expense breakdown
    if (report.expenseBreakdown && report.expenseBreakdown.length > 0) {
      content += this.renderBreakdownTable('Expense Breakdown', report.expenseBreakdown, 'expense');
    }

    // Monthly trends
    if (report.monthlyTrends && report.monthlyTrends.length > 0) {
      content += this.renderMonthlyTrends(report.monthlyTrends);
    }

    // Tax summary
    if (report.taxSummary) {
      content += this.renderTaxSummary(report.taxSummary);
    }

    container.innerHTML = content;
  }

  /**
   * Render breakdown table
   */
  renderBreakdownTable(title, data, type) {
    return `
      <div class="breakdown-section">
        <h4>${title}</h4>
        <table class="breakdown-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Amount</th>
              <th>% of Total</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(item => `
              <tr>
                <td>${this.capitalize(item.category)}</td>
                <td>${this.formatCurrency(item.amount)}</td>
                <td>${item.percentage || '-'}%</td>
                <td>${item.count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Render monthly trends
   */
  renderMonthlyTrends(trends) {
    return `
      <div class="trends-section">
        <h4>Monthly Trends</h4>
        <table class="trends-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Income</th>
              <th>Expenses</th>
              <th>Net Savings</th>
            </tr>
          </thead>
          <tbody>
            ${trends.map(t => `
              <tr>
                <td>${t.month}</td>
                <td>${this.formatCurrency(t.income)}</td>
                <td>${this.formatCurrency(t.expenses)}</td>
                <td class="${t.netSavings >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(t.netSavings)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Render tax summary
   */
  renderTaxSummary(summary) {
    return `
      <div class="tax-summary-section">
        <h4>Tax Summary</h4>
        <div class="tax-summary-grid">
          <div class="tax-item">
            <span>Gross Income</span>
            <span>${this.formatCurrency(summary.grossIncome)}</span>
          </div>
          <div class="tax-item">
            <span>Total Deductions</span>
            <span>${this.formatCurrency(summary.totalDeductions)}</span>
          </div>
          <div class="tax-item">
            <span>Taxable Income</span>
            <span>${this.formatCurrency(summary.taxableIncome)}</span>
          </div>
          <div class="tax-item highlight">
            <span>Tax Liability</span>
            <span>${this.formatCurrency(summary.taxLiability)}</span>
          </div>
          <div class="tax-item">
            <span>Effective Rate</span>
            <span>${summary.effectiveRate}%</span>
          </div>
          <div class="tax-item">
            <span>Tax Regime</span>
            <span>${this.capitalize(summary.regime)}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Download report as PDF
   */
  async downloadPDF(reportId) {
    try {
      this.showNotification('Generating PDF...', 'info');
      
      const response = await this.request(`/reports/${reportId}/pdf`);
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${reportId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      this.showNotification('PDF downloaded', 'success');
    } catch (error) {
      console.error('PDF download error:', error);
      this.showNotification('Failed to download PDF', 'error');
    }
  }

  /**
   * Delete report
   */
  async deleteReport(reportId) {
    if (!confirm('Are you sure you want to delete this report?')) return;
    
    try {
      const response = await this.request(`/reports/${reportId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      
      if (data.success) {
        this.showNotification('Report deleted', 'success');
        await this.loadReports();
        
        // Clear report view if viewing deleted report
        const container = document.getElementById('report-view');
        if (container) container.innerHTML = '';
      }
    } catch (error) {
      console.error('Delete report error:', error);
      this.showNotification('Failed to delete report', 'error');
    }
  }

  // ==================== UTILITIES ====================

  /**
   * Refresh all data
   */
  async refreshAll() {
    await Promise.all([
      this.loadTaxProfile(),
      this.calculateTax(),
      this.loadReports()
    ]);
  }

  /**
   * Format currency
   */
  formatCurrency(amount, currency = 'INR') {
    const symbols = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
    const symbol = symbols[currency] || currency;
    const formatted = Math.abs(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return amount < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
  }

  /**
   * Format date
   */
  formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Format date range
   */
  formatDateRange(range) {
    if (!range) return '-';
    return `${this.formatDate(range.startDate)} - ${this.formatDate(range.endDate)}`;
  }

  /**
   * Format report type
   */
  formatReportType(type) {
    const types = {
      income_statement: 'Income Statement',
      expense_summary: 'Expense Summary',
      profit_loss: 'P&L',
      tax_report: 'Tax Report',
      category_breakdown: 'Categories',
      monthly_comparison: 'Monthly',
      annual_summary: 'Annual'
    };
    return types[type] || type;
  }

  /**
   * Capitalize string
   */
  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Show loading state
   */
  showLoading(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      el.classList.add('loading');
      el.dataset.originalContent = el.innerHTML;
      el.innerHTML = '<div class="spinner"></div>';
    }
  }

  /**
   * Hide loading state
   */
  hideLoading(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      el.classList.remove('loading');
    }
  }

  /**
   * Show notification
   */
  showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container') || this.createNotificationContainer();
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <span>${message}</span>
      <button onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(notification);
    
    setTimeout(() => notification.remove(), 5000);
  }

  /**
   * Create notification container
   */
  createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    document.body.appendChild(container);
    return container;
  }
}

// Initialize on DOM ready
let taxReports;
document.addEventListener('DOMContentLoaded', () => {
  taxReports = new TaxReportsManager();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TaxReportsManager;
}
