// Reports & Export Dashboard - Accessibility Enhanced JavaScript

// Global variables
let currentFocusIndex = -1;
let sortableHeaders = [];
let reportsData = [];

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeAccessibility();
    initializeEventListeners();
    loadReportsData();
    setupKeyboardNavigation();
});

// Initialize accessibility features
function initializeAccessibility() {
    // Announce page load to screen readers
    announceToScreenReader('Reports & Export Dashboard loaded');

    // Set up live regions for dynamic content
    setupLiveRegions();

    // Initialize ARIA attributes
    initializeAriaAttributes();
}

// Set up live regions for screen reader announcements
function setupLiveRegions() {
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.setAttribute('id', 'sr-live-region');
    liveRegion.className = 'sr-only';
    document.body.appendChild(liveRegion);
}

// Initialize ARIA attributes
function initializeAriaAttributes() {
    // Set up table sorting
    const tableHeaders = document.querySelectorAll('.reports-table th[tabindex="0"]');
    sortableHeaders = Array.from(tableHeaders);

    sortableHeaders.forEach((header, index) => {
        header.setAttribute('aria-sort', 'none');
        header.setAttribute('role', 'columnheader');
        header.setAttribute('aria-describedby', `sort-desc-${index}`);
    });
}

// Announce messages to screen readers
function announceToScreenReader(message) {
    const liveRegion = document.getElementById('sr-live-region');
    const statusMessages = document.getElementById('status-messages');
    
    if (liveRegion) {
        liveRegion.textContent = message;
        // Clear after announcement
        setTimeout(() => {
            liveRegion.textContent = '';
        }, 1000);
    }
    
    if (statusMessages) {
        statusMessages.textContent = message;
        setTimeout(() => {
            statusMessages.textContent = '';
        }, 1000);
    }
}

// Initialize event listeners
function initializeEventListeners() {
    // Quick export buttons
    document.querySelectorAll('.export-card').forEach(card => {
        card.addEventListener('click', handleQuickExport);
        card.addEventListener('keydown', handleCardKeydown);
    });

    // Form submission
    const builderForm = document.querySelector('.builder-form');
    if (builderForm) {
        builderForm.addEventListener('submit', handleFormSubmit);
    }

    // Modal management
    const scheduleBtn = document.querySelector('.schedule-btn');
    if (scheduleBtn) {
        scheduleBtn.addEventListener('click', openScheduleModal);
    }

    const scheduleModal = document.getElementById('scheduleModal');
    if (scheduleModal) {
        const closeBtn = scheduleModal.querySelector('.modal-close');
        const cancelBtn = scheduleModal.querySelector('.btn-cancel');
        const scheduleForm = scheduleModal.querySelector('#scheduleForm');

        if (closeBtn) closeBtn.addEventListener('click', closeScheduleModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeScheduleModal);
        if (scheduleForm) scheduleForm.addEventListener('submit', handleScheduleSubmit);

        // Close modal on escape
        scheduleModal.addEventListener('keydown', handleModalKeydown);
    }

    const previewModal = document.getElementById('previewModal');
    if (previewModal) {
        const closeBtn = previewModal.querySelector('.modal-close');
        if (closeBtn) closeBtn.addEventListener('click', closePreviewModal);
        previewModal.addEventListener('keydown', handleModalKeydown);
    }

    // Table sorting
    sortableHeaders.forEach(header => {
        header.addEventListener('click', handleSort);
        header.addEventListener('keydown', handleSortKeydown);
    });

    // Form validation
    setupFormValidation();
}

// Set up keyboard navigation
function setupKeyboardNavigation() {
    // Table navigation
    const table = document.querySelector('.reports-table');
    if (table) {
        table.addEventListener('keydown', handleTableKeydown);
    }

    // Grid navigation for export cards
    const exportGrid = document.querySelector('.quick-export-grid');
    if (exportGrid) {
        exportGrid.addEventListener('keydown', handleGridKeydown);
    }
}

// Handle quick export
function handleQuickExport(event) {
    const card = event.currentTarget;
    const exportType = card.getAttribute('onclick').match(/quickExport\('(\w+)'\)/)[1];

    announceToScreenReader(`${exportType} report export initiated`);

    // Directly show success message instead of loading
    setTimeout(() => {
        announceToScreenReader(`${exportType} report exported successfully`);
        alert(`${exportType} report has been exported successfully!`);
    }, 500);
}

// Handle card keyboard navigation
function handleCardKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.currentTarget.click();
    }
}

// Handle form submission
function handleFormSubmit(event) {
    event.preventDefault();

    if (validateForm(event.target)) {
        announceToScreenReader('Custom report configuration saved');
        alert('Custom report configuration has been saved successfully!');
    }
}

// Form validation
function validateForm(form) {
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;

    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            field.setAttribute('aria-invalid', 'true');
            field.setAttribute('aria-describedby', field.getAttribute('aria-describedby') + ' error-' + field.id);
            showFieldError(field, 'This field is required');
            isValid = false;
        } else {
            field.setAttribute('aria-invalid', 'false');
            hideFieldError(field);
        }
    });

    return isValid;
}

function showFieldError(field, message) {
    let errorElement = document.getElementById('error-' + field.id);
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = 'error-' + field.id;
        errorElement.className = 'error-message';
        errorElement.setAttribute('role', 'alert');
        errorElement.style.color = '#ff5722';
        errorElement.style.fontSize = '0.875rem';
        errorElement.style.marginTop = '0.25rem';
        field.parentNode.appendChild(errorElement);
    }
    errorElement.textContent = message;
}

function hideFieldError(field) {
    const errorElement = document.getElementById('error-' + field.id);
    if (errorElement) {
        errorElement.remove();
    }
}

// Set up form validation
function setupFormValidation() {
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('blur', () => {
                validateField(input);
            });
            input.addEventListener('input', () => {
                if (input.hasAttribute('aria-invalid')) {
                    validateField(input);
                }
            });
        });
    });
}

function validateField(field) {
    if (field.hasAttribute('required') && !field.value.trim()) {
        field.setAttribute('aria-invalid', 'true');
        showFieldError(field, 'This field is required');
    } else {
        field.setAttribute('aria-invalid', 'false');
        hideFieldError(field);
    }
}

// Modal management
function openScheduleModal() {
    const modal = document.getElementById('scheduleModal');
    if (modal) {
        modal.setAttribute('aria-hidden', 'false');
        modal.style.display = 'flex';

        // Focus management
        const firstInput = modal.querySelector('input');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }

        announceToScreenReader('Schedule report modal opened');
    }
}

function closeScheduleModal() {
    const modal = document.getElementById('scheduleModal');
    if (modal) {
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = 'none';

        // Return focus to trigger button
        const scheduleBtn = document.querySelector('.schedule-btn');
        if (scheduleBtn) {
            scheduleBtn.focus();
        }

        announceToScreenReader('Schedule report modal closed');
    }
}

function closePreviewModal() {
    const modal = document.getElementById('previewModal');
    if (modal) {
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = 'none';

        // Return focus to preview button
        const previewBtn = document.querySelector('.btn-preview');
        if (previewBtn) {
            previewBtn.focus();
        }

        announceToScreenReader('Report preview modal closed');
    }
}

function handleModalKeydown(event) {
    if (event.key === 'Escape') {
        const modal = event.currentTarget;
        if (modal.id === 'scheduleModal') {
            closeScheduleModal();
        } else if (modal.id === 'previewModal') {
            closePreviewModal();
        }
    }
}

// Handle schedule form submission
function handleScheduleSubmit(event) {
    event.preventDefault();

    if (validateForm(event.target)) {
        announceToScreenReader('Scheduling automated report');
        showLoading('Scheduling report...');

        setTimeout(() => {
            hideLoading();
            closeScheduleModal();
            announceToScreenReader('Report scheduled successfully');
            alert('Report scheduled successfully!');
        }, 2000);
    }
}

// Preview report
function previewReport() {
    announceToScreenReader('Opening report preview');
    showLoading('Loading preview...');

    setTimeout(() => {
        hideLoading();
        openPreviewModal();
    }, 1500);
}

function openPreviewModal() {
    const modal = document.getElementById('previewModal');
    const previewContent = document.getElementById('previewContent');

    if (modal && previewContent) {
        // Mock preview content
        previewContent.innerHTML = `
            <h3>Report Preview</h3>
            <p>This is a preview of your custom report. In a real implementation, this would show the actual report data.</p>
            <div style="margin: 1rem 0; padding: 1rem; background: var(--bg-tertiary); border-radius: 8px;">
                <h4>Sample Data</h4>
                <ul>
                    <li>Total Expenses: $1,250.00</li>
                    <li>Number of Transactions: 45</li>
                    <li>Top Category: Food & Dining</li>
                </ul>
            </div>
        `;

        modal.setAttribute('aria-hidden', 'false');
        modal.style.display = 'flex';

        announceToScreenReader('Report preview loaded');
    }
}

// Table sorting
function handleSort(event) {
    const header = event.currentTarget;
    const column = header.textContent.trim().split(' ')[0].toLowerCase();

    // Update ARIA sort attribute
    sortableHeaders.forEach(h => h.setAttribute('aria-sort', 'none'));
    header.setAttribute('aria-sort', 'ascending');

    announceToScreenReader(`Sorting by ${column}`);

    // In real implementation, sort the data
    sortReports(column);
}

function handleSortKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleSort(event);
    }
}

function sortReports(column) {
    // Mock sorting - in real implementation, sort the actual data
    announceToScreenReader(`Reports sorted by ${column}`);
}

// Table keyboard navigation
function handleTableKeydown(event) {
    const table = event.currentTarget;
    const rows = table.querySelectorAll('tbody tr');
    const headers = table.querySelectorAll('th[tabindex="0"]');

    if (!rows.length) return;

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            navigateTable(rows, 1);
            break;
        case 'ArrowUp':
            event.preventDefault();
            navigateTable(rows, -1);
            break;
        case 'ArrowRight':
            event.preventDefault();
            navigateHeaders(headers, 1);
            break;
        case 'ArrowLeft':
            event.preventDefault();
            navigateHeaders(headers, -1);
            break;
        case 'Enter':
            if (event.target.tagName === 'TH') {
                event.target.click();
            }
            break;
    }
}

function navigateTable(rows, direction) {
    const activeRow = document.activeElement.closest('tr');
    let newIndex = -1;

    if (activeRow) {
        const currentIndex = Array.from(rows).indexOf(activeRow);
        newIndex = Math.max(0, Math.min(rows.length - 1, currentIndex + direction));
    }

    if (newIndex >= 0) {
        const targetRow = rows[newIndex];
        const firstCell = targetRow.querySelector('td');
        if (firstCell) {
            firstCell.focus();
            announceToScreenReader(`Row ${newIndex + 1} selected`);
        }
    }
}

function navigateHeaders(headers, direction) {
    const activeHeader = document.activeElement;
    let newIndex = -1;

    if (activeHeader && activeHeader.tagName === 'TH') {
        const currentIndex = Array.from(headers).indexOf(activeHeader);
        newIndex = Math.max(0, Math.min(headers.length - 1, currentIndex + direction));
    }

    if (newIndex >= 0) {
        headers[newIndex].focus();
        announceToScreenReader(`Column ${headers[newIndex].textContent.trim()} selected`);
    }
}

// Grid navigation for export cards
function handleGridKeydown(event) {
    const grid = event.currentTarget;
    const cards = grid.querySelectorAll('.export-card');

    if (!cards.length) return;

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            navigateGrid(cards, 2); // Assuming 2 columns
            break;
        case 'ArrowUp':
            event.preventDefault();
            navigateGrid(cards, -2);
            break;
        case 'ArrowRight':
            event.preventDefault();
            navigateGrid(cards, 1);
            break;
        case 'ArrowLeft':
            event.preventDefault();
            navigateGrid(cards, -1);
            break;
        case 'Enter':
        case ' ':
            event.preventDefault();
            event.target.click();
            break;
    }
}

function navigateGrid(cards, direction) {
    const activeCard = document.activeElement.closest('.export-card');
    let newIndex = -1;

    if (activeCard) {
        const currentIndex = Array.from(cards).indexOf(activeCard);
        newIndex = Math.max(0, Math.min(cards.length - 1, currentIndex + direction));
    }

    if (newIndex >= 0) {
        cards[newIndex].focus();
        announceToScreenReader(`${cards[newIndex].querySelector('h3').textContent} selected`);
    }
}

// Loading management
function showLoading(message) {
    const overlay = document.getElementById('loadingOverlay');
    const statusText = overlay.querySelector('span');

    if (overlay && statusText) {
        statusText.textContent = message;
        overlay.setAttribute('aria-hidden', 'false');
        overlay.style.display = 'flex';
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.display = 'none';
    }
}

// Load mock reports data
function loadReportsData() {
    // Mock data - in real implementation, fetch from API
    reportsData = [
        { name: 'Monthly Summary', type: 'Summary', date: '2024-01-15', size: '2.3 MB' },
        { name: 'Q4 Tax Report', type: 'Tax', date: '2024-01-10', size: '1.8 MB' },
        { name: 'Expense Analysis', type: 'Analysis', date: '2024-01-08', size: '3.1 MB' }
    ];

    renderReportsTable();
}

function renderReportsTable() {
    const tbody = document.getElementById('reportsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    reportsData.forEach(report => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${report.name}</td>
            <td>${report.type}</td>
            <td>${report.date}</td>
            <td>${report.size}</td>
            <td>
                <button class="btn-preview" onclick="previewReport()" aria-label="Preview ${report.name}">Preview</button>
                <button class="btn-generate" onclick="downloadReport('${report.name}')" aria-label="Download ${report.name}">Download</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    announceToScreenReader(`${reportsData.length} reports loaded`);
}

// Download report function
function downloadReport(reportName) {
    announceToScreenReader(`Downloading ${reportName}`);
    // In real implementation, trigger download
    alert(`${reportName} would be downloaded here`);
}

// Utility functions for accessibility
function trapFocus(container) {
    const focusableElements = container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    container.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            if (e.shiftKey) {
                if (document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                }
            } else {
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        }
    });
}

// Export functions for global access
window.quickExport = handleQuickExport;
window.previewReport = previewReport;
window.openScheduleModal = openScheduleModal;
window.closeScheduleModal = closeScheduleModal;
window.closePreviewModal = closePreviewModal;
window.sortReports = sortReports;
window.downloadReport = downloadReport;