/**
 * Payroll Management Controller
 */

let payrollTrendsChart = null;
let currentPayrollRuns = [];
let currentEmployees = [];

document.addEventListener('DOMContentLoaded', () => {
    initializeYearDropdown();
    loadPayrollDashboard();
    loadPayrollRuns();
    loadEmployees();
    setupForms();
});

function initializeYearDropdown() {
    const yearSelect = document.getElementById('payroll-year');
    const currentYear = new Date().getFullYear();

    for (let i = currentYear; i >= currentYear - 5; i--) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        if (i === currentYear) option.selected = true;
        yearSelect.appendChild(option);
    }

    // Set current month
    const monthSelect = document.getElementById('payroll-month');
    monthSelect.value = new Date().getMonth() + 1;
}

async function loadPayrollDashboard() {
    try {
        const res = await fetch('/api/payroll/dashboard', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        updateDashboardStats(data);
        renderPayrollTrends(data.monthlyTrends);
    } catch (err) {
        console.error('Failed to load payroll dashboard:', err);
    }
}

function updateDashboardStats(data) {
    document.getElementById('active-employees').textContent = data.activeEmployeeCount || 0;
    document.getElementById('pending-approvals').textContent = data.pendingApprovals || 0;

    if (data.currentPayroll) {
        document.getElementById('monthly-payout').textContent =
            `₹${data.currentPayroll.summary.totalNetPay.toLocaleString()}`;
        document.getElementById('tax-deducted').textContent =
            `₹${data.currentPayroll.summary.totalTax.toLocaleString()}`;
    } else {
        document.getElementById('monthly-payout').textContent = '₹0';
        document.getElementById('tax-deducted').textContent = '₹0';
    }
}

function renderPayrollTrends(trends) {
    const ctx = document.getElementById('payrollTrendsChart').getContext('2d');

    if (payrollTrendsChart) {
        payrollTrendsChart.destroy();
    }

    const labels = trends.map(t => `${getMonthName(t.month)} ${t.year}`);
    const netPayData = trends.map(t => t.totalNetPay);
    const taxData = trends.map(t => t.totalTax);

    payrollTrendsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Net Payout',
                    data: netPayData,
                    borderColor: '#64ffda',
                    backgroundColor: 'rgba(100, 255, 218, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Tax Deducted',
                    data: taxData,
                    borderColor: '#ff9f43',
                    backgroundColor: 'rgba(255, 159, 67, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#8892b0' }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#8892b0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: {
                        color: '#8892b0',
                        callback: value => '₹' + value.toLocaleString()
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

async function loadPayrollRuns() {
    try {
        const res = await fetch('/api/payroll/runs', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        currentPayrollRuns = data;
        renderPayrollRuns(data);
    } catch (err) {
        console.error('Failed to load payroll runs:', err);
    }
}

function renderPayrollRuns(runs) {
    const list = document.getElementById('payroll-runs-list');

    if (!runs || runs.length === 0) {
        list.innerHTML = '<div class="empty-state">No payroll runs found.</div>';
        return;
    }

    list.innerHTML = runs.map(run => `
        <div class="payroll-run-card glass-card" onclick="viewPayrollDetails('${run._id}')">
            <div class="run-header">
                <div class="run-period">
                    <strong>${getMonthName(run.payrollPeriod.month)} ${run.payrollPeriod.year}</strong>
                    <span class="run-id">${run.runId}</span>
                </div>
                <span class="status-badge ${run.status}">${run.status.replace('_', ' ')}</span>
            </div>
            <div class="run-summary">
                <div class="summary-item">
                    <label>Employees</label>
                    <strong>${run.summary.totalEmployees}</strong>
                </div>
                <div class="summary-item">
                    <label>Gross Pay</label>
                    <strong>₹${run.summary.totalGrossPay.toLocaleString()}</strong>
                </div>
                <div class="summary-item">
                    <label>Net Pay</label>
                    <strong class="text-accent">₹${run.summary.totalNetPay.toLocaleString()}</strong>
                </div>
            </div>
            ${run.status === 'draft' || run.status === 'pending_approval' ? `
                <div class="run-actions">
                    <button class="btn-sm btn-primary" onclick="approvePayroll(event, '${run._id}')">
                        <i class="fas fa-check"></i> Approve
                    </button>
                </div>
            ` : ''}
            ${run.status === 'approved' ? `
                <div class="run-actions">
                    <button class="btn-sm btn-success" onclick="processPayroll(event, '${run._id}')">
                        <i class="fas fa-play"></i> Process
                    </button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

async function loadEmployees() {
    try {
        const res = await fetch('/api/payroll/salary-structures', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        currentEmployees = data;
        renderEmployees(data);
    } catch (err) {
        console.error('Failed to load employees:', err);
    }
}

function renderEmployees(employees) {
    const list = document.getElementById('employees-list');

    if (!employees || employees.length === 0) {
        list.innerHTML = '<div class="empty-state">No employees found.</div>';
        return;
    }

    list.innerHTML = employees.map(emp => `
        <div class="employee-card glass-card">
            <div class="emp-header">
                <div class="emp-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="emp-info">
                    <strong>${emp.employeeName}</strong>
                    <span>${emp.employeeId}</span>
                    <span class="emp-designation">${emp.designation || 'N/A'}</span>
                </div>
                <span class="status-pill ${emp.isActive ? 'active' : 'inactive'}">
                    ${emp.isActive ? 'Active' : 'Inactive'}
                </span>
            </div>
            <div class="emp-salary">
                <div class="salary-item">
                    <label>CTC</label>
                    <strong>₹${emp.ctc.toLocaleString()}/yr</strong>
                </div>
                <div class="salary-item">
                    <label>Monthly Gross</label>
                    <strong>₹${Math.round(emp.grossSalary).toLocaleString()}</strong>
                </div>
                <div class="salary-item">
                    <label>Net Salary</label>
                    <strong class="text-accent">₹${Math.round(emp.netSalary).toLocaleString()}</strong>
                </div>
            </div>
        </div>
    `).join('');
}

async function viewPayrollDetails(runId) {
    try {
        const res = await fetch(`/api/payroll/runs/${runId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        const modal = document.getElementById('payroll-details-modal');
        const content = document.getElementById('payroll-details-content');

        content.innerHTML = `
            <div class="payroll-details">
                <div class="details-header">
                    <h4>${getMonthName(data.payrollPeriod.month)} ${data.payrollPeriod.year}</h4>
                    <span class="status-badge ${data.status}">${data.status.replace('_', ' ')}</span>
                </div>
                <div class="details-summary">
                    <div class="summary-card">
                        <label>Total Employees</label>
                        <h3>${data.summary.totalEmployees}</h3>
                    </div>
                    <div class="summary-card">
                        <label>Gross Pay</label>
                        <h3>₹${data.summary.totalGrossPay.toLocaleString()}</h3>
                    </div>
                    <div class="summary-card">
                        <label>Deductions</label>
                        <h3>₹${data.summary.totalDeductions.toLocaleString()}</h3>
                    </div>
                    <div class="summary-card">
                        <label>Net Pay</label>
                        <h3 class="text-accent">₹${data.summary.totalNetPay.toLocaleString()}</h3>
                    </div>
                </div>
                <div class="entries-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Gross</th>
                                <th>Deductions</th>
                                <th>Net Pay</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.entries.map(entry => `
                                <tr>
                                    <td>
                                        <strong>${entry.employeeName}</strong><br>
                                        <small>${entry.employeeId}</small>
                                    </td>
                                    <td>₹${entry.grossPay.toLocaleString()}</td>
                                    <td>₹${entry.totalDeductions.toLocaleString()}</td>
                                    <td><strong>₹${entry.netPay.toLocaleString()}</strong></td>
                                    <td><span class="status-pill ${entry.paymentStatus}">${entry.paymentStatus}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    } catch (err) {
        console.error('Failed to load payroll details:', err);
    }
}

async function approvePayroll(event, runId) {
    event.stopPropagation();

    if (!confirm('Approve this payroll run?')) return;

    try {
        const res = await fetch(`/api/payroll/runs/${runId}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (res.ok) {
            loadPayrollRuns();
            loadPayrollDashboard();
        }
    } catch (err) {
        console.error('Failed to approve payroll:', err);
    }
}

async function processPayroll(event, runId) {
    event.stopPropagation();

    if (!confirm('Process payments for this payroll run?')) return;

    try {
        const res = await fetch(`/api/payroll/runs/${runId}/process`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (res.ok) {
            loadPayrollRuns();
            loadPayrollDashboard();
        }
    } catch (err) {
        console.error('Failed to process payroll:', err);
    }
}

function filterRuns(filter) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    let filtered = currentPayrollRuns;

    if (filter === 'pending') {
        filtered = currentPayrollRuns.filter(r =>
            r.status === 'draft' || r.status === 'pending_approval' || r.status === 'approved'
        );
    } else if (filter === 'completed') {
        filtered = currentPayrollRuns.filter(r => r.status === 'completed');
    }

    renderPayrollRuns(filtered);
}

function getMonthName(month) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1];
}

// Modal Functions
function openGeneratePayrollModal() {
    document.getElementById('generate-payroll-modal').classList.remove('hidden');
}

function closeGeneratePayrollModal() {
    document.getElementById('generate-payroll-modal').classList.add('hidden');
}

function openSalaryStructureModal() {
    document.getElementById('salary-structure-modal').classList.remove('hidden');
}

function closeSalaryStructureModal() {
    document.getElementById('salary-structure-modal').classList.add('hidden');
}

function closePayrollDetailsModal() {
    document.getElementById('payroll-details-modal').classList.add('hidden');
}

function addComponent() {
    const container = document.getElementById('components-container');
    const componentDiv = document.createElement('div');
    componentDiv.className = 'component-row';
    componentDiv.innerHTML = `
        <div class="form-row">
            <div class="form-group">
                <input type="text" placeholder="Component Name" class="comp-name">
            </div>
            <div class="form-group">
                <select class="comp-type">
                    <option value="earning">Earning</option>
                    <option value="deduction">Deduction</option>
                </select>
            </div>
            <div class="form-group">
                <input type="number" placeholder="Amount" class="comp-amount">
            </div>
            <button type="button" class="btn-icon" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    container.appendChild(componentDiv);
}

function setupForms() {
    // Generate Payroll Form
    document.getElementById('generate-payroll-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const month = parseInt(document.getElementById('payroll-month').value);
        const year = parseInt(document.getElementById('payroll-year').value);

        try {
            const res = await fetch('/api/payroll/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ month, year })
            });

            if (res.ok) {
                closeGeneratePayrollModal();
                loadPayrollRuns();
                loadPayrollDashboard();
            }
        } catch (err) {
            console.error('Failed to generate payroll:', err);
        }
    });

    // Salary Structure Form
    document.getElementById('salary-structure-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const components = [];
        document.querySelectorAll('.component-row').forEach(row => {
            components.push({
                componentName: row.querySelector('.comp-name').value,
                componentType: row.querySelector('.comp-type').value,
                calculationType: 'fixed',
                amount: parseFloat(row.querySelector('.comp-amount').value),
                isTaxable: true
            });
        });

        const structureData = {
            employeeId: document.getElementById('emp-id').value,
            employeeName: document.getElementById('emp-name').value,
            designation: document.getElementById('emp-designation').value,
            department: document.getElementById('emp-department').value,
            ctc: parseFloat(document.getElementById('emp-ctc').value),
            taxRegime: document.getElementById('emp-tax-regime').value,
            effectiveFrom: new Date(),
            components,
            bankDetails: {
                accountNumber: document.getElementById('emp-account').value,
                ifscCode: document.getElementById('emp-ifsc').value
            }
        };

        try {
            const res = await fetch('/api/payroll/salary-structures', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(structureData)
            });

            if (res.ok) {
                closeSalaryStructureModal();
                loadEmployees();
                loadPayrollDashboard();
            }
        } catch (err) {
            console.error('Failed to create salary structure:', err);
        }
    });
}
