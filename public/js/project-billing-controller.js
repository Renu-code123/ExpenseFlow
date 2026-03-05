/**
 * Project Costing & Billing Controller
 */

document.addEventListener('DOMContentLoaded', () => {
    loadProjects();
    loadInvoices();
    setupProjectForm();
});

async function loadProjects() {
    try {
        const res = await fetch('/api/project-billing/projects', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderProjects(data.projects, data.stats);
    } catch (err) {
        console.error('Failed to load projects:', err);
    }
}

function renderProjects(projects, stats) {
    const grid = document.getElementById('projects-grid');
    if (!projects || projects.length === 0) {
        grid.innerHTML = '<div class="empty-state">No commercial projects found.</div>';
        return;
    }

    grid.innerHTML = projects.map(project => {
        const stat = stats.find(s => s.projectName === project.name) || {};
        return `
            <div class="project-card glass-card">
                <div class="card-status ${project.status}">${project.status}</div>
                <div class="project-main">
                    <h3>${project.name}</h3>
                    <p class="client-name"><i class="fas fa-user-tie"></i> ${project.client.name}</p>
                </div>
                <div class="project-financials">
                    <div class="fin-row">
                        <span>Burn Rate</span>
                        <span class="${stat.isOverBudget ? 'text-danger' : 'text-success'}">${(stat.burnRatePercentage || 0).toFixed(1)}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress" style="width: ${Math.min(100, stat.burnRatePercentage || 0)}%"></div>
                    </div>
                    <div class="fin-grid mt-15">
                        <div class="fin-item">
                            <label>Expenses</label>
                            <strong>₹${(stat.totalExpenses || 0).toLocaleString()}</strong>
                        </div>
                        <div class="fin-item">
                            <label>Billable</label>
                            <strong class="text-accent">₹${(stat.totalBillable || 0).toLocaleString()}</strong>
                        </div>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn-secondary btn-sm" onclick="generateInvoice('${project._id}')">
                        <i class="fas fa-file-invoice"></i> Bill Client
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function loadInvoices() {
    try {
        const res = await fetch('/api/project-billing/invoices', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        const list = document.getElementById('invoices-list');
        list.innerHTML = data.map(inv => `
            <tr>
                <td><strong>${inv.invoiceNumber}</strong></td>
                <td>${inv.projectId.name}</td>
                <td>₹${inv.totalAmount.toLocaleString()}</td>
                <td><span class="status-badge ${inv.status}">${inv.status}</span></td>
                <td>
                    <button class="btn-icon"><i class="fas fa-download"></i></button>
                    <button class="btn-icon"><i class="fas fa-paper-plane"></i></button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Failed to load invoices:', err);
    }
}

async function generateInvoice(projectId) {
    if (!confirm('This will compile all unbilled expenses into a new invoice. Proceed?')) return;

    try {
        const res = await fetch(`/api/project-billing/generate-invoice/${projectId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();

        if (data.success) {
            alert(`Invoice ${data.data.invoiceNumber} generated!`);
            loadInvoices();
            loadProjects();
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error('Failed to generate invoice:', err);
    }
}

function openProjectModal() {
    document.getElementById('project-modal').classList.remove('hidden');
}

function closeProjectModal() {
    document.getElementById('project-modal').classList.add('hidden');
}

function setupProjectForm() {
    const form = document.getElementById('project-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const projData = {
            name: document.getElementById('proj-name').value,
            budget: { total: parseFloat(document.getElementById('proj-budget').value) },
            markupPercentage: parseFloat(document.getElementById('proj-markup').value),
            client: { name: document.getElementById('proj-client').value }
        };

        const res = await fetch('/api/project-billing/projects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(projData)
        });

        if (res.ok) {
            closeProjectModal();
            loadProjects();
        }
    });
}
