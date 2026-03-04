/**
 * Audit Controller
 * Handles all audit trail UI logic
 */

let actionChart = null;
let severityChart = null;
let currentPage = 1;
let currentFilters = {};
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    loadAuditLogs();
    loadStatistics();
    loadCriticalEvents();
});

async function loadDashboard() {
    try {
        const res = await fetch('/api/audit-trail/dashboard', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        updateDashboardStats(data);
    } catch (err) {
        console.error('Failed to load dashboard:', err);
    }
}

function updateDashboardStats(data) {
    document.getElementById('total-logs-24h').textContent = data.summary.total24h.toLocaleString();
    document.getElementById('critical-events').textContent = data.summary.critical24h.toLocaleString();
    document.getElementById('total-logs-7d').textContent = data.summary.total7d.toLocaleString();
}

async function loadAuditLogs() {
    try {
        const res = await fetch('/api/audit-trail/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                filters: currentFilters,
                options: {
                    page: currentPage,
                    limit: 50
                }
            })
        });
        const { data } = await res.json();

        renderAuditLogs(data.logs);
        updatePagination(data.pagination);
    } catch (err) {
        console.error('Failed to load audit logs:', err);
    }
}

function renderAuditLogs(logs) {
    const tbody = document.getElementById('audit-logs-tbody');

    if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No audit logs found.</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(log => `
        <tr class="audit-row severity-${log.severity}">
            <td>${new Date(log.timestamp).toLocaleString()}</td>
            <td>${log.userName || 'Unknown'}</td>
            <td><span class="action-badge ${log.action}">${log.action}</span></td>
            <td>${log.entityType}${log.entityId ? ` (${log.entityId.substring(0, 8)}...)` : ''}</td>
            <td><span class="severity-badge ${log.severity}">${log.severity}</span></td>
            <td><span class="category-badge ${log.category}">${log.category}</span></td>
            <td>${log.metadata?.ipAddress || 'N/A'}</td>
            <td>
                <button class="btn-sm btn-secondary" onclick='showLogDetails(${JSON.stringify(log).replace(/'/g, "&apos;")})'>
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function updatePagination(pagination) {
    document.getElementById('page-info').textContent =
        `Page ${pagination.page} of ${pagination.pages}`;
}

function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        loadAuditLogs();
    }
}

function nextPage() {
    currentPage++;
    loadAuditLogs();
}

async function loadStatistics() {
    try {
        const res = await fetch('/api/audit-trail/statistics', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderActionChart(data.byAction);
        renderSeverityChart(data.bySeverity);
    } catch (err) {
        console.error('Failed to load statistics:', err);
    }
}

function renderActionChart(actionStats) {
    const ctx = document.getElementById('actionChart').getContext('2d');

    if (actionChart) {
        actionChart.destroy();
    }

    actionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: actionStats.map(s => s._id),
            datasets: [{
                label: 'Count',
                data: actionStats.map(s => s.count),
                backgroundColor: '#48dbfb',
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: '#8892b0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: { color: '#8892b0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function renderSeverityChart(severityStats) {
    const ctx = document.getElementById('severityChart').getContext('2d');

    if (severityChart) {
        severityChart.destroy();
    }

    const colors = {
        'low': '#64ffda',
        'medium': '#48dbfb',
        'high': '#ff9f43',
        'critical': '#ff6b6b'
    };

    severityChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: severityStats.map(s => s._id),
            datasets: [{
                data: severityStats.map(s => s.count),
                backgroundColor: severityStats.map(s => colors[s._id] || '#8892b0'),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#8892b0', font: { size: 10 } }
                }
            }
        }
    });
}

async function loadCriticalEvents() {
    try {
        const res = await fetch('/api/audit-trail/critical?days=7&limit=10', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderCriticalEvents(data);
    } catch (err) {
        console.error('Failed to load critical events:', err);
    }
}

function renderCriticalEvents(events) {
    const container = document.getElementById('critical-events-list');

    if (!events || events.length === 0) {
        container.innerHTML = '<div class="empty-state">No critical events in the last 7 days.</div>';
        return;
    }

    container.innerHTML = events.map(event => `
        <div class="critical-event-card glass-card-sm severity-${event.severity}">
            <div class="event-header">
                <span class="severity-badge ${event.severity}">${event.severity}</span>
                <span class="event-time">${new Date(event.timestamp).toLocaleString()}</span>
            </div>
            <div class="event-content">
                <strong>${event.userName || 'Unknown User'}</strong> performed 
                <span class="action-badge ${event.action}">${event.action}</span> on 
                <strong>${event.entityType}</strong>
            </div>
            <div class="event-meta">
                <span><i class="fas fa-network-wired"></i> ${event.metadata?.ipAddress || 'N/A'}</span>
                <span><i class="fas fa-tag"></i> ${event.category}</span>
            </div>
        </div>
    `).join('');
}

function applyFilters() {
    const filters = {};

    const actions = Array.from(document.getElementById('action-filter').selectedOptions).map(o => o.value);
    const severities = Array.from(document.getElementById('severity-filter').selectedOptions).map(o => o.value);
    const categories = Array.from(document.getElementById('category-filter').selectedOptions).map(o => o.value);
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    if (actions.length > 0) filters.action = actions;
    if (severities.length > 0) filters.severity = severities;
    if (categories.length > 0) filters.category = categories;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    currentFilters = filters;
    currentPage = 1;
    loadAuditLogs();
}

function resetFilters() {
    document.getElementById('action-filter').selectedIndex = -1;
    document.getElementById('severity-filter').selectedIndex = -1;
    document.getElementById('category-filter').selectedIndex = -1;
    document.getElementById('start-date').value = '';
    document.getElementById('end-date').value = '';
    document.getElementById('search-input').value = '';

    currentFilters = {};
    currentPage = 1;
    loadAuditLogs();
}

function handleSearch() {
    clearTimeout(searchTimeout);

    const searchTerm = document.getElementById('search-input').value;

    searchTimeout = setTimeout(() => {
        if (searchTerm.length >= 3) {
            currentFilters.searchTerm = searchTerm;
        } else {
            delete currentFilters.searchTerm;
        }
        currentPage = 1;
        loadAuditLogs();
    }, 500);
}

async function verifyIntegrity() {
    try {
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;

        const res = await fetch('/api/audit-trail/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ startDate, endDate, limit: 1000 })
        });
        const { data } = await res.json();

        if (data.valid) {
            alert(`✓ Integrity Verified\n\nTotal logs checked: ${data.totalLogs}\nNo tampering detected.`);
            document.getElementById('integrity-status').textContent = 'Verified';
            document.getElementById('integrity-status').style.color = '#64ffda';
        } else {
            alert(`✗ Integrity Compromised\n\nErrors found: ${data.errors.length}\n\n${data.errors.map(e => e.message).join('\n')}`);
            document.getElementById('integrity-status').textContent = 'Compromised';
            document.getElementById('integrity-status').style.color = '#ff6b6b';
        }
    } catch (err) {
        console.error('Failed to verify integrity:', err);
        alert('Failed to verify integrity');
    }
}

function showLogDetails(log) {
    const modal = document.getElementById('log-details-modal');
    const content = document.getElementById('log-details-content');

    content.innerHTML = `
        <div class="log-detail-section">
            <h4>Basic Information</h4>
            <div class="detail-grid">
                <div class="detail-item">
                    <label>Log ID:</label>
                    <span>${log.logId}</span>
                </div>
                <div class="detail-item">
                    <label>Timestamp:</label>
                    <span>${new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <div class="detail-item">
                    <label>User:</label>
                    <span>${log.userName} (${log.userEmail})</span>
                </div>
                <div class="detail-item">
                    <label>Action:</label>
                    <span class="action-badge ${log.action}">${log.action}</span>
                </div>
            </div>
        </div>
        <div class="log-detail-section">
            <h4>Entity Information</h4>
            <div class="detail-grid">
                <div class="detail-item">
                    <label>Type:</label>
                    <span>${log.entityType}</span>
                </div>
                <div class="detail-item">
                    <label>ID:</label>
                    <span>${log.entityId || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <label>Name:</label>
                    <span>${log.entityName || 'N/A'}</span>
                </div>
            </div>
        </div>
        <div class="log-detail-section">
            <h4>Metadata</h4>
            <div class="detail-grid">
                <div class="detail-item">
                    <label>IP Address:</label>
                    <span>${log.metadata?.ipAddress || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <label>User Agent:</label>
                    <span>${log.metadata?.userAgent || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <label>Status Code:</label>
                    <span>${log.metadata?.statusCode || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <label>API Endpoint:</label>
                    <span>${log.metadata?.apiEndpoint || 'N/A'}</span>
                </div>
            </div>
        </div>
        ${log.changes && (log.changes.before || log.changes.after) ? `
            <div class="log-detail-section">
                <h4>Changes</h4>
                <pre class="changes-pre">${JSON.stringify(log.changes, null, 2)}</pre>
            </div>
        ` : ''}
        <div class="log-detail-section">
            <h4>Cryptographic Hash</h4>
            <div class="hash-display">
                <code>${log.hash}</code>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
}

function closeLogDetailsModal() {
    document.getElementById('log-details-modal').classList.add('hidden');
}

function openComplianceModal() {
    document.getElementById('compliance-modal').classList.remove('hidden');
}

function closeComplianceModal() {
    document.getElementById('compliance-modal').classList.add('hidden');
}

document.getElementById('compliance-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const reportType = document.getElementById('report-type').value;
    const startDate = document.getElementById('report-start-date').value;
    const endDate = document.getElementById('report-end-date').value;

    const formatCheckboxes = document.querySelectorAll('input[name="format"]:checked');
    const exportFormats = Array.from(formatCheckboxes).map(cb => cb.value);

    if (exportFormats.length === 0) {
        alert('Please select at least one export format');
        return;
    }

    try {
        const res = await fetch('/api/audit-trail/compliance/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                reportType,
                startDate,
                endDate,
                exportFormats
            })
        });

        const { data } = await res.json();

        alert(`Report generated successfully!\n\nReport ID: ${data.reportId}\nTotal Logs: ${data.summary.totalLogs}\nCritical Events: ${data.summary.criticalEvents}`);
        closeComplianceModal();
    } catch (err) {
        console.error('Failed to generate report:', err);
        alert('Failed to generate compliance report');
    }
});
