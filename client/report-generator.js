/**
 * Professional Report Generator - Frontend Integration
 * ExpenseFlow Report Suite
 */

class ReportGenerator {
  constructor() {
    this.baseUrl = '/api/expenses';
    this.previewData = null;
    this.isGenerating = false;
  }

  /**
   * Get auth token from storage
   */
  getAuthToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  }

  /**
   * Make authenticated API request
   */
  async apiRequest(endpoint, options = {}) {
    const token = this.getAuthToken();
    if (!token) {
      throw new Error('Authentication required. Please log in.');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      // Try to parse error message
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.message || errorData.error || errorMsg;
      } catch (e) { }
      throw new Error(errorMsg);
    }

    return response;
  }

  /**
   * Get report preview with charts
   */
  async getPreview(options = {}) {
    const body = {
      startDate: options.startDate || this.getDefaultStartDate(),
      endDate: options.endDate || new Date().toISOString().split('T')[0],
      category: 'all', // Simplify for now or map from options
      type: 'all'
    };

    const response = await this.apiRequest('/report/preview', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const result = await response.json();

    if (result.success) {
      this.previewData = result.data;
      return result.data;
    }

    throw new Error(result.error || 'Failed to generate preview');
  }

  /**
   * Download PDF report
   */
  async downloadPDF(options = {}) {
    if (this.isGenerating) return;
    this.isGenerating = true;

    try {
      const body = {
        format: 'pdf',
        startDate: options.startDate || this.getDefaultStartDate(),
        endDate: options.endDate || new Date().toISOString().split('T')[0],
        currency: options.currency || 'USD',
        title: 'Expense Report'
      };

      // For file download, we handle response differently
      const token = this.getAuthToken();
      const response = await fetch(`${this.baseUrl}/export`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Failed to download PDF');

      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.getFilename('pdf', options);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      return true;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Download Excel report
   */
  async downloadExcel(options = {}) {
    if (this.isGenerating) return;
    this.isGenerating = true;

    try {
      const body = {
        format: 'excel',
        startDate: options.startDate || this.getDefaultStartDate(),
        endDate: options.endDate || new Date().toISOString().split('T')[0],
        currency: options.currency || 'USD'
      };

      const token = this.getAuthToken();
      const response = await fetch(`${this.baseUrl}/export`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Failed to download Excel');

      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.getFilename('xlsx', options);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      return true;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Get available report templates
   */
  async getTemplates() {
    const response = await this.apiRequest('/templates');
    const result = await response.json();
    return result.success ? result.data : [];
  }

  /**
   * Get available report types
   */
  async getReportTypes() {
    const response = await this.apiRequest('/types/available');
    const result = await response.json();
    return result.success ? result.data : [];
  }

  /**
   * Schedule recurring report
   */
  async scheduleReport(scheduleOptions) {
    const response = await this.apiRequest('/schedule', {
      method: 'POST',
      body: JSON.stringify(scheduleOptions)
    });
    const result = await response.json();

    if (result.success) {
      return result.data;
    }
    throw new Error(result.error || 'Failed to schedule report');
  }

  /**
   * Generate quick report for predefined periods
   */
  async generateQuickReport(type, reportType = 'expense_summary') {
    const response = await this.apiRequest(`/quick/${type}`, {
      method: 'POST',
      body: JSON.stringify({ reportType })
    });
    const result = await response.json();

    if (result.success) {
      return result.data;
    }
    throw new Error(result.error || 'Failed to generate quick report');
  }

  /**
   * Get default start date (first day of current month)
   */
  getDefaultStartDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  }

  /**
   * Generate filename for downloads
   */
  getFilename(extension, options) {
    const startDate = options.startDate || this.getDefaultStartDate();
    const endDate = options.endDate || new Date().toISOString().split('T')[0];
    return `ExpenseFlow_Report_${startDate}_to_${endDate}.${extension}`;
  }

  /**
   * Format currency for display
   */
  formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  /**
   * Render preview to DOM element
   */
  renderPreview(containerId) {
    const container = document.getElementById(containerId);
    if (!container || !this.previewData) return;

    const { summary, categoryBreakdown, monthlyTrends, charts } = this.previewData;

    container.innerHTML = `
      <div class="report-preview">
        <div class="preview-header">
          <h3>Report Preview</h3>
          <p class="date-range">${this.previewData.dateRange?.start || ''} - ${this.previewData.dateRange?.end || ''}</p>
        </div>
        
        <div class="preview-summary">
          <div class="summary-card income">
            <span class="label">Total Income</span>
            <span class="value">${this.formatCurrency(summary?.totalIncome || 0)}</span>
          </div>
          <div class="summary-card expense">
            <span class="label">Total Expenses</span>
            <span class="value">${this.formatCurrency(summary?.totalExpenses || 0)}</span>
          </div>
          <div class="summary-card balance ${(summary?.netSavings || 0) >= 0 ? 'positive' : 'negative'}">
            <span class="label">Net Savings</span>
            <span class="value">${this.formatCurrency(summary?.netSavings || 0)}</span>
          </div>
        </div>

        ${charts?.categoryPie ? `
          <div class="preview-chart">
            <h4>Spending by Category</h4>
            <img src="${charts.categoryPie}" alt="Category Breakdown Chart" />
          </div>
        ` : ''}

        ${charts?.monthlyTrend ? `
          <div class="preview-chart">
            <h4>Monthly Trends</h4>
            <img src="${charts.monthlyTrend}" alt="Monthly Trends Chart" />
          </div>
        ` : ''}

        <div class="preview-categories">
          <h4>Top Categories</h4>
          <div class="category-list">
            ${(categoryBreakdown || []).slice(0, 5).map(cat => `
              <div class="category-item">
                <span class="category-name">${cat.category}</span>
                <span class="category-amount">${this.formatCurrency(cat.total)}</span>
                <span class="category-percent">${cat.percentage?.toFixed(1) || 0}%</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }
}

// Report Modal Controller
class ReportModalController {
  constructor() {
    this.reportGenerator = new ReportGenerator();
    this.modalElement = null;
    this.init();
  }

  init() {
    this.createModal();
    this.bindEvents();
  }

  createModal() {
    const modal = document.createElement('div');
    modal.id = 'report-generator-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content report-modal">
        <div class="modal-header">
          <h2><i class="fas fa-file-pdf"></i> Generate Professional Report</h2>
          <button class="close-modal" aria-label="Close">&times;</button>
        </div>
        
        <div class="modal-body">
          <div class="report-options">
            <div class="form-group">
              <label for="report-start-date">Start Date</label>
              <input type="date" id="report-start-date" class="form-control">
            </div>
            
            <div class="form-group">
              <label for="report-end-date">End Date</label>
              <input type="date" id="report-end-date" class="form-control">
            </div>
            
            <div class="form-group">
              <label for="report-type">Report Type</label>
              <select id="report-type" class="form-control">
                <option value="comprehensive">Comprehensive Report</option>
                <option value="executive_summary">Executive Summary</option>
                <option value="detailed_analysis">Detailed Analysis</option>
                <option value="tax_preparation">Tax Preparation</option>
                <option value="budget_review">Budget Review</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="report-currency">Currency</label>
              <select id="report-currency" class="form-control">
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="INR">INR (₹)</option>
                <option value="CAD">CAD (C$)</option>
                <option value="AUD">AUD (A$)</option>
              </select>
            </div>

            <div class="form-group checkbox-group">
              <label>
                <input type="checkbox" id="include-charts" checked>
                Include Charts & Visualizations
              </label>
            </div>

            <div class="form-group checkbox-group">
              <label>
                <input type="checkbox" id="include-transactions" checked>
                Include Transaction Details
              </label>
            </div>
          </div>

          <div class="report-preview-container" id="report-preview-container">
            <p class="preview-placeholder">Click "Preview" to see your report</p>
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="btn btn-secondary" id="preview-report-btn">
            <i class="fas fa-eye"></i> Preview
          </button>
          <button class="btn btn-primary" id="download-pdf-btn">
            <i class="fas fa-file-pdf"></i> Download PDF
          </button>
          <button class="btn btn-success" id="download-excel-btn">
            <i class="fas fa-file-excel"></i> Download Excel
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalElement = modal;

    // Set default dates
    const startInput = document.getElementById('report-start-date');
    const endInput = document.getElementById('report-end-date');

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    startInput.value = firstDayOfMonth.toISOString().split('T')[0];
    endInput.value = now.toISOString().split('T')[0];
  }

  bindEvents() {
    // Close modal
    this.modalElement.querySelector('.close-modal').addEventListener('click', () => this.close());
    this.modalElement.addEventListener('click', (e) => {
      if (e.target === this.modalElement) this.close();
    });

    // Preview button
    document.getElementById('preview-report-btn').addEventListener('click', () => this.handlePreview());

    // Download buttons
    document.getElementById('download-pdf-btn').addEventListener('click', () => this.handleDownloadPDF());
    document.getElementById('download-excel-btn').addEventListener('click', () => this.handleDownloadExcel());
  }

  getOptions() {
    return {
      startDate: document.getElementById('report-start-date').value,
      endDate: document.getElementById('report-end-date').value,
      reportType: document.getElementById('report-type').value,
      currency: document.getElementById('report-currency').value,
      includeCharts: document.getElementById('include-charts').checked,
      includeTransactions: document.getElementById('include-transactions').checked
    };
  }

  async handlePreview() {
    const btn = document.getElementById('preview-report-btn');
    const container = document.getElementById('report-preview-container');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    container.innerHTML = '<p class="loading">Generating preview...</p>';

    try {
      await this.reportGenerator.getPreview(this.getOptions());
      this.reportGenerator.renderPreview('report-preview-container');
    } catch (error) {
      container.innerHTML = `<p class="error">Error: ${error.message}</p>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-eye"></i> Preview';
    }
  }

  async handleDownloadPDF() {
    const btn = document.getElementById('download-pdf-btn');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

    try {
      await this.reportGenerator.downloadPDF(this.getOptions());
      this.showNotification('PDF report downloaded successfully!', 'success');
    } catch (error) {
      this.showNotification(`Error: ${error.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-file-pdf"></i> Download PDF';
    }
  }

  async handleDownloadExcel() {
    const btn = document.getElementById('download-excel-btn');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

    try {
      await this.reportGenerator.downloadExcel(this.getOptions());
      this.showNotification('Excel report downloaded successfully!', 'success');
    } catch (error) {
      this.showNotification(`Error: ${error.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-file-excel"></i> Download Excel';
    }
  }

  showNotification(message, type = 'info') {
    // Use existing notification system if available
    if (window.showNotification) {
      window.showNotification(message, type);
    } else {
      alert(message);
    }
  }

  open() {
    this.modalElement.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  close() {
    this.modalElement.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Initialize and expose globally
let reportModalController = null;

function openReportGenerator() {
  if (!reportModalController) {
    reportModalController = new ReportModalController();
  }
  reportModalController.open();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReportGenerator, ReportModalController, openReportGenerator };
}

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Add report button to navigation if dashboard exists
  const dashboardNav = document.querySelector('.dashboard-nav, .nav-menu, .sidebar-menu');
  if (dashboardNav) {
    const reportBtn = document.createElement('button');
    reportBtn.className = 'nav-item report-generator-btn';
    reportBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Generate Report';
    reportBtn.onclick = openReportGenerator;
    dashboardNav.appendChild(reportBtn);
  }
});
