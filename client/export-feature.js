// Export Functionality for ExpenseFlow
const EXPORT_API_URL = 'http://localhost:3000/api/export';

const formatExportCurrency = (value, { showPlus = false } = {}) => {
    const formatter = window.i18n?.formatCurrency;
    const numericValue = Number(value) || 0;
    const formatted = typeof formatter === 'function'
        ? formatter(numericValue)
        : (function(){ const sym = window.i18n?.getCurrencySymbol?.(window.i18n?.getCurrency?.() || '') || ''; return `${sym}${numericValue.toFixed(2)}`; })();
    if (showPlus && numericValue > 0 && !formatted.startsWith('+') && !formatted.startsWith('-')) {
        return `+${formatted}`;
    }
    return formatted;
};

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
 * Get export preview with statistics
 */
async function getExportPreview(filters = {}) {
    try {
        const params = new URLSearchParams();
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        if (filters.category) params.append('category', filters.category);
        if (filters.type) params.append('type', filters.type);

        const response = await fetch(`${EXPORT_API_URL}/preview?${params}`, {
            headers: await getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to get preview');

        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error('Error getting export preview:', error);
        throw error;
    }
}

/**
 * Export expenses as CSV
 */
async function exportCSV(filters = {}) {
    try {
        showExportNotification('Generating CSV...', 'info');

        const params = new URLSearchParams();
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        if (filters.category) params.append('category', filters.category);
        if (filters.type) params.append('type', filters.type);

        const response = await fetch(`${EXPORT_API_URL}/csv?${params}`, {
            headers: await getAuthHeaders()
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to export CSV');
        }

        // Get the blob and download
        const blob = await response.blob();
        const filename = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
            || `expenseflow_export_${new Date().toISOString().split('T')[0]}.csv`;

        downloadBlob(blob, filename);
        showExportNotification('CSV exported successfully!', 'success');

        return true;
    } catch (error) {
        console.error('Error exporting CSV:', error);
        showExportNotification(error.message, 'error');
        throw error;
    }
}

/**
 * Export expenses as PDF
 */
async function exportPDF(filters = {}) {
    try {
        showExportNotification('Generating PDF report...', 'info');

        const params = new URLSearchParams();
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        if (filters.category) params.append('category', filters.category);
        if (filters.type) params.append('type', filters.type);

        const response = await fetch(`${EXPORT_API_URL}/pdf?${params}`, {
            headers: await getAuthHeaders()
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to export PDF');
        }

        // Get the blob and download
        const blob = await response.blob();
        const filename = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
            || `expenseflow_report_${new Date().toISOString().split('T')[0]}.pdf`;

        downloadBlob(blob, filename);
        showExportNotification('PDF report exported successfully!', 'success');

        return true;
    } catch (error) {
        console.error('Error exporting PDF:', error);
        showExportNotification(error.message, 'error');
        throw error;
    }
}

/**
 * Export monthly summary as PDF
 */
async function exportMonthlySummaryPDF(year, month) {
    try {
        showExportNotification('Generating monthly report...', 'info');

        const response = await fetch(`${EXPORT_API_URL}/summary/pdf?year=${year}&month=${month}`, {
            headers: await getAuthHeaders()
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to export monthly summary');
        }

        const blob = await response.blob();
        const filename = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
            || `expenseflow_monthly_${year}_${month}.pdf`;

        downloadBlob(blob, filename);
        showExportNotification('Monthly report exported successfully!', 'success');

        return true;
    } catch (error) {
        console.error('Error exporting monthly summary:', error);
        showExportNotification(error.message, 'error');
        throw error;
    }
}

/**
 * Get monthly summary data
 */
async function getMonthlySummary(year, month) {
    try {
        const response = await fetch(`${EXPORT_API_URL}/summary?year=${year}&month=${month}`, {
            headers: await getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to get summary');

        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error('Error getting monthly summary:', error);
        throw error;
    }
}

// ========================
// UI Functions
// ========================

/**
 * Download blob as file
 */
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Open export modal
 */
function openExportModal() {
    const modal = document.getElementById('export-modal');
    if (!modal) return;

    // Reset form
    document.getElementById('export-format').value = 'csv';
    document.getElementById('export-start-date').value = '';
    document.getElementById('export-end-date').value = '';
    document.getElementById('export-category-filter').value = 'all';
    document.getElementById('export-type-filter').value = 'all';

    // Clear preview
    updateExportPreview(null);

    modal.classList.add('active');

    // Load initial preview
    loadExportPreview();
}

/**
 * Close export modal
 */
function closeExportModal() {
    const modal = document.getElementById('export-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * Load export preview based on current filters
 */
async function loadExportPreview() {
    const filters = getExportFilters();

    try {
        const preview = await getExportPreview(filters);
        updateExportPreview(preview);
    } catch (error) {
        updateExportPreview(null, 'Failed to load preview');
    }
}

/**
 * Get current export filters from form
 */
function getExportFilters() {
    return {
        startDate: document.getElementById('export-start-date')?.value || '',
        endDate: document.getElementById('export-end-date')?.value || '',
        category: document.getElementById('export-category-filter')?.value || 'all',
        type: document.getElementById('export-type-filter')?.value || 'all'
    };
}

/**
 * Update export preview display
 */
function updateExportPreview(preview, error = null) {
    const container = document.getElementById('export-preview');
    if (!container) return;

    if (error) {
        container.innerHTML = `<div class="export-preview-error">${error}</div>`;
        return;
    }

    if (!preview) {
        container.innerHTML = `<div class="export-preview-loading">Loading preview...</div>`;
        return;
    }

    container.innerHTML = `
    <div class="export-preview-stats">
      <div class="preview-stat">
        <span class="stat-label">Transactions</span>
        <span class="stat-value">${preview.transactionCount}</span>
      </div>
      <div class="preview-stat">
        <span class="stat-label">Period</span>
        <span class="stat-value">${preview.dateRange}</span>
      </div>
      <div class="preview-stat income">
        <span class="stat-label">Income</span>
                <span class="stat-value">${formatExportCurrency(preview.summary.totalIncome, { showPlus: true })}</span>
      </div>
      <div class="preview-stat expense">
        <span class="stat-label">Expenses</span>
                <span class="stat-value">${formatExportCurrency(-preview.summary.totalExpense)}</span>
      </div>
      <div class="preview-stat ${preview.summary.netBalance >= 0 ? 'positive' : 'negative'}">
        <span class="stat-label">Net</span>
                <span class="stat-value">${formatExportCurrency(preview.summary.netBalance, { showPlus: true })}</span>
      </div>
    </div>
    ${preview.transactionCount === 0 ? `
      <div class="export-preview-empty">
        <i class="fas fa-inbox"></i>
        <p>No transactions found for the selected filters</p>
      </div>
    ` : ''}
  `;
}

/**
 * Handle export button click
 */
async function handleExport() {
    const format = document.getElementById('export-format')?.value || 'csv';
    const filters = getExportFilters();

    const exportBtn = document.getElementById('export-submit-btn');
    if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
    }

    try {
        if (format === 'csv') {
            await exportCSV(filters);
        } else if (format === 'pdf') {
            await exportPDF(filters);
        }

        closeExportModal();
    } catch (error) {
        // Error already shown via notification
    } finally {
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.innerHTML = '<i class="fas fa-download"></i> Export';
        }
    }
}

/**
 * Handle quick export (CSV)
 */
async function quickExportCSV() {
    await exportCSV({});
}

/**
 * Handle quick export (PDF)
 */
async function quickExportPDF() {
    await exportPDF({});
}

/**
 * Show export notification
 */
function showExportNotification(message, type = 'info') {
    // Use existing notification system if available
    if (typeof showNotification === 'function') {
        showNotification(message, type);
        return;
    }

    const notification = document.createElement('div');
    notification.className = `export-notification ${type}`;
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

function initExportFeature() {
    // Export modal button
    const exportModalBtn = document.getElementById('open-export-modal');
    if (exportModalBtn) {
        exportModalBtn.addEventListener('click', openExportModal);
    }

    // Close modal button
    const closeBtn = document.getElementById('export-modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeExportModal);
    }

    // Cancel button
    const cancelBtn = document.getElementById('export-cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeExportModal);
    }

    // Export submit button
    const submitBtn = document.getElementById('export-submit-btn');
    if (submitBtn) {
        submitBtn.addEventListener('click', handleExport);
    }

    // Filter change handlers - reload preview
    const filterInputs = ['export-start-date', 'export-end-date', 'export-category-filter', 'export-type-filter'];
    filterInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('change', loadExportPreview);
        }
    });

    // Quick export buttons
    const quickCSVBtn = document.getElementById('export-csv');
    if (quickCSVBtn) {
        quickCSVBtn.addEventListener('click', quickExportCSV);
    }

    const quickPDFBtn = document.getElementById('export-pdf');
    if (quickPDFBtn) {
        quickPDFBtn.addEventListener('click', async () => {
            openExportModal();
            document.getElementById('export-format').value = 'pdf';
        });
    }

    // Close modal when clicking outside
    const modal = document.getElementById('export-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeExportModal();
            }
        });
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExportFeature);
} else {
    initExportFeature();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        exportCSV,
        exportPDF,
        exportMonthlySummaryPDF,
        getMonthlySummary,
        getExportPreview
    };
}
