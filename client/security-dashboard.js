class SecurityDashboard {
    constructor() {
        this.currentPage = 1;
        this.limit = 20;
        this.filters = {};
        this.searchTerm = '';
        this.init();
    }

    async init() {
        try {
            await this.loadStatistics();
            await this.loadAuditLogs();
        } catch (error) {
            console.error('Failed to initialize security dashboard:', error);
            this.showError('Failed to load security dashboard. Please try again.');
        }
    }

    async loadStatistics() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/audit/statistics', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to load statistics');

            const stats = await response.json();
            
            document.getElementById('stat-total').textContent = stats.totalLogs || 0;
            document.getElementById('stat-critical').textContent = stats.criticalCount || 0;
            document.getElementById('stat-flagged').textContent = stats.flaggedCount || 0;
            document.getElementById('stat-resources').textContent = stats.uniqueResources || 0;
        } catch (error) {
            console.error('Failed to load statistics:', error);
        }
    }

    async loadAuditLogs() {
        try {
            const token = localStorage.getItem('token');
            const queryParams = new URLSearchParams({
                page: this.currentPage,
                limit: this.limit,
                ...this.filters
            });

            if (this.searchTerm) {
                queryParams.append('q', this.searchTerm);
            }

            const endpoint = this.searchTerm ? '/api/audit/search' : '/api/audit/logs';
            const response = await fetch(`${endpoint}?${queryParams}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to load audit logs');

            const data = await response.json();
            this.renderAuditTable(data.logs || data);
            this.renderPagination(data.pagination);
        } catch (error) {
            console.error('Failed to load audit logs:', error);
            this.showError('Failed to load audit logs. Please try again.');
        }
    }

    renderAuditTable(logs) {
        const container = document.getElementById('audit-table-content');
        
        if (!logs || logs.length === 0) {
            container.innerHTML = '<div class="loading"><p>No audit logs found.</p></div>';
            return;
        }

        const table = `
            <table class="audit-table">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Action</th>
                        <th>Resource</th>
                        <th>Severity</th>
                        <th>IP Address</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map(log => this.renderLogRow(log)).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = table;
    }

    renderLogRow(log) {
        const timestamp = new Date(log.createdAt).toLocaleString();
        const flaggedBadge = log.flagged ? 
            `<span class="flagged-badge"><i class="fas fa-flag"></i> Flagged</span>` : '';
        
        return `
            <tr onclick="securityDashboard.viewDetails('${log._id}')">
                <td>${timestamp}</td>
                <td>
                    <span class="action-badge">${log.action}</span>
                </td>
                <td>${log.resource || 'N/A'}</td>
                <td>
                    <span class="severity-badge ${log.severity}">${log.severity}</span>
                </td>
                <td>${log.ipAddress || 'Unknown'}</td>
                <td>${flaggedBadge}</td>
                <td>
                    <button class="btn btn-primary" onclick="event.stopPropagation(); securityDashboard.viewDetails('${log._id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${!log.flagged ? `
                        <button class="btn btn-danger" onclick="event.stopPropagation(); securityDashboard.flagLog('${log._id}')">
                            <i class="fas fa-flag"></i>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    }

    renderPagination(pagination) {
        if (!pagination) return;
        
        const container = document.getElementById('pagination');
        const { currentPage, totalPages } = pagination;
        
        let html = '';
        
        // Previous button
        html += `
            <button ${currentPage === 1 ? 'disabled' : ''} 
                    onclick="securityDashboard.changePage(${currentPage - 1})">
                <i class="fas fa-chevron-left"></i>
            </button>
        `;
        
        // Page numbers
        for (let i = 1; i <= Math.min(totalPages, 10); i++) {
            html += `
                <button class="${i === currentPage ? 'active' : ''}" 
                        onclick="securityDashboard.changePage(${i})">
                    ${i}
                </button>
            `;
        }
        
        // Next button
        html += `
            <button ${currentPage === totalPages ? 'disabled' : ''} 
                    onclick="securityDashboard.changePage(${currentPage + 1})">
                <i class="fas fa-chevron-right"></i>
            </button>
        `;
        
        container.innerHTML = html;
    }

    async viewDetails(logId) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/audit/logs?_id=${logId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to load log details');

            const data = await response.json();
            const log = data.logs[0];
            
            if (!log) throw new Error('Log not found');
            
            this.showDetailModal(log);
        } catch (error) {
            console.error('Failed to load log details:', error);
            this.showError('Failed to load log details. Please try again.');
        }
    }

    showDetailModal(log) {
        const modal = document.getElementById('detail-modal');
        const modalBody = document.getElementById('modal-body');
        
        const timestamp = new Date(log.createdAt).toLocaleString();
        const delta = this.renderDelta(log.delta);
        
        modalBody.innerHTML = `
            <div style="margin-bottom: 15px;">
                <strong>ID:</strong> ${log._id}
            </div>
            <div style="margin-bottom: 15px;">
                <strong>Timestamp:</strong> ${timestamp}
            </div>
            <div style="margin-bottom: 15px;">
                <strong>Action:</strong> <span class="action-badge">${log.action}</span>
            </div>
            <div style="margin-bottom: 15px;">
                <strong>Resource:</strong> ${log.resource || 'N/A'}
            </div>
            <div style="margin-bottom: 15px;">
                <strong>Resource ID:</strong> ${log.resourceId || 'N/A'}
            </div>
            <div style="margin-bottom: 15px;">
                <strong>Severity:</strong> <span class="severity-badge ${log.severity}">${log.severity}</span>
            </div>
            <div style="margin-bottom: 15px;">
                <strong>IP Address:</strong> ${log.ipAddress || 'Unknown'}
            </div>
            <div style="margin-bottom: 15px;">
                <strong>User Agent:</strong> ${log.userAgent || 'Unknown'}
            </div>
            ${log.flagged ? `
                <div style="margin-bottom: 15px;">
                    <strong>Flag Reason:</strong> 
                    <span class="flagged-badge">${log.flagReason || 'No reason provided'}</span>
                </div>
            ` : ''}
            ${log.reviewed ? `
                <div style="margin-bottom: 15px;">
                    <strong>Reviewed:</strong> Yes
                </div>
                <div style="margin-bottom: 15px;">
                    <strong>Review Notes:</strong> ${log.reviewNotes || 'No notes'}
                </div>
            ` : ''}
            <div style="margin-bottom: 15px;">
                <strong>Hash:</strong> <code style="font-size: 11px; word-break: break-all;">${log.hash}</code>
            </div>
            ${delta ? `
                <div style="margin-bottom: 15px;">
                    <strong>Changes:</strong>
                    <div class="diff-view">${delta}</div>
                </div>
            ` : ''}
            <div style="margin-top: 20px; display: flex; gap: 10px;">
                ${!log.flagged ? `
                    <button class="btn btn-danger" onclick="securityDashboard.flagLog('${log._id}')">
                        <i class="fas fa-flag"></i> Flag as Suspicious
                    </button>
                ` : ''}
                ${log.flagged && !log.reviewed ? `
                    <button class="btn btn-success" onclick="securityDashboard.reviewLog('${log._id}')">
                        <i class="fas fa-check"></i> Mark as Reviewed
                    </button>
                ` : ''}
                <button class="btn btn-secondary" onclick="securityDashboard.closeModal()">
                    Close
                </button>
            </div>
        `;
        
        modal.classList.add('active');
    }

    renderDelta(delta) {
        if (!delta || typeof delta !== 'object') return null;
        
        return Object.entries(delta)
            .map(([key, value]) => {
                if (typeof value === 'object' && value.old !== undefined && value.new !== undefined) {
                    return `
                        <div>
                            <strong>${key}:</strong><br>
                            <span class="diff-removed">${JSON.stringify(value.old)}</span> →
                            <span class="diff-added">${JSON.stringify(value.new)}</span>
                        </div>
                    `;
                }
                return `<div><strong>${key}:</strong> ${JSON.stringify(value)}</div>`;
            })
            .join('<br>');
    }

    closeModal() {
        document.getElementById('detail-modal').classList.remove('active');
    }

    async flagLog(logId) {
        const reason = prompt('Enter reason for flagging this log:');
        if (!reason) return;
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/audit/flag/${logId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ reason })
            });

            if (!response.ok) throw new Error('Failed to flag log');

            alert('Log flagged successfully');
            this.closeModal();
            this.refresh();
        } catch (error) {
            console.error('Failed to flag log:', error);
            alert('Failed to flag log. Please try again.');
        }
    }

    async reviewLog(logId) {
        const notes = prompt('Enter review notes:');
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/audit/review/${logId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ notes })
            });

            if (!response.ok) throw new Error('Failed to review log');

            alert('Log reviewed successfully');
            this.closeModal();
            this.refresh();
        } catch (error) {
            console.error('Failed to review log:', error);
            alert('Failed to review log. Please try again.');
        }
    }

    async verifyChain() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/audit/verify-chain', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to verify chain');

            const result = await response.json();
            
            const container = document.getElementById('chain-integrity');
            const statusDiv = document.getElementById('chain-status');
            
            container.style.display = 'block';
            
            if (result.chainBroken) {
                statusDiv.className = 'chain-status broken';
                statusDiv.innerHTML = `
                    <i class="fas fa-times-circle" style="font-size: 24px; color: #DC2626;"></i>
                    <div>
                        <strong>Chain Integrity Compromised</strong><br>
                        <small>${result.failed} of ${result.total} logs failed verification</small>
                    </div>
                `;
            } else {
                statusDiv.className = 'chain-status verified';
                statusDiv.innerHTML = `
                    <i class="fas fa-check-circle" style="font-size: 24px; color: #10B981;"></i>
                    <div>
                        <strong>Chain Integrity Verified</strong><br>
                        <small>All ${result.verified} logs verified successfully</small>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Failed to verify chain:', error);
            alert('Failed to verify chain integrity. Please try again.');
        }
    }

    async exportPDF() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/audit/export/pdf', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(this.filters)
            });

            if (!response.ok) throw new Error('Failed to export PDF');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-trail-${Date.now()}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            alert('PDF exported successfully');
        } catch (error) {
            console.error('Failed to export PDF:', error);
            alert('Failed to export PDF. Please try again.');
        }
    }

    applyFilters() {
        this.filters = {};
        
        const resource = document.getElementById('filter-resource').value;
        const action = document.getElementById('filter-action').value;
        const severity = document.getElementById('filter-severity').value;
        const flagged = document.getElementById('filter-flagged').value;
        const startDate = document.getElementById('filter-start-date').value;
        const endDate = document.getElementById('filter-end-date').value;
        
        if (resource) this.filters.resource = resource;
        if (action) this.filters.action = action;
        if (severity) this.filters.severity = severity;
        if (flagged) this.filters.flagged = flagged;
        if (startDate) this.filters.startDate = startDate;
        if (endDate) this.filters.endDate = endDate;
        
        this.currentPage = 1;
        this.loadAuditLogs();
    }

    search() {
        const searchBox = document.getElementById('search-box');
        this.searchTerm = searchBox.value.trim();
        this.currentPage = 1;
        this.loadAuditLogs();
    }

    changePage(page) {
        this.currentPage = page;
        this.loadAuditLogs();
    }

    async refresh() {
        await this.loadStatistics();
        await this.loadAuditLogs();
        alert('Dashboard refreshed');
    }

    showError(message) {
        const container = document.getElementById('audit-table-content');
        container.innerHTML = `
            <div class="loading">
                <p style="color: #DC2626;">${message}</p>
            </div>
        `;
    }
}

// Initialize dashboard
const securityDashboard = new SecurityDashboard();
