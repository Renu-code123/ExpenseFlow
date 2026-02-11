/**
 * Project Controller
 * Manages project lifecycle, costing visualizations, and ROI tracking.
 */

let projectMatrixChart = null;
let costStructureChart = null;

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

async function initDashboard() {
    await fetchStats();
    await loadROIMatrix();
    await loadProjectsList();
}

async function fetchStats() {
    try {
        const response = await fetch('/api/projects/analytics/stats', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const stats = await response.json();

        document.getElementById('active-projects-count').textContent = stats.active;
        document.getElementById('total-budget-sum').textContent = `₹${stats.totalBudget.toLocaleString()}`;
    } catch (err) {
        console.error('Error fetching stats:', err);
    }
}

async function loadROIMatrix() {
    try {
        const response = await fetch('/api/projects/analytics/roi-matrix', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const matrix = await response.json();

        const avgROI = matrix.reduce((sum, m) => sum + m.roi, 0) / (matrix.length || 1);
        document.getElementById('avg-roi-val').textContent = `${avgROI.toFixed(1)}%`;

        renderMatrixChart(matrix);
    } catch (err) {
        console.error('Error loading ROI Matrix:', err);
    }
}

function renderMatrixChart(data) {
    const ctx = document.getElementById('roiMatrixChart').getContext('2d');

    if (projectMatrixChart) projectMatrixChart.destroy();

    projectMatrixChart = new Chart(ctx, {
        type: 'bubble',
        data: {
            datasets: [{
                label: 'Project Performance',
                data: data.map(p => ({
                    x: p.revenue,
                    y: p.roi,
                    r: Math.sqrt(p.cost) / 10,
                    name: p.projectName
                })),
                backgroundColor: 'rgba(72, 219, 251, 0.5)',
                borderColor: '#48dbfb',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Revenue (₹)', color: '#8892b0' }, ticks: { color: '#8892b0' } },
                y: { title: { display: true, text: 'ROI (%)', color: '#8892b0' }, ticks: { color: '#8892b0' } }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.raw.name}: ${ctx.raw.y.toFixed(1)}% ROI`
                    }
                }
            }
        }
    });
}

async function loadProjectsList() {
    try {
        const response = await fetch('/api/projects', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const projects = await response.json();

        const tbody = document.getElementById('projects-table-body');
        tbody.innerHTML = '';

        for (const p of projects) {
            // Fetch analysis for each project row (real-time)
            const analysisRes = await fetch(`/api/projects/${p._id}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const { analysis } = await analysisRes.json();

            const budgetUtil = (((analysis.costs.labor.internal + analysis.costs.expenses.total) / p.budget.total) * 100).toFixed(1);

            const row = `
                <tr>
                    <td><strong>${p.name}</strong><br><small>${p.code || ''}</small></td>
                    <td><span class="badge ${p.status}">${p.status}</span></td>
                    <td>
                        <div class="progress-bar-container">
                            <div class="progress-bar" style="width: ${budgetUtil}%"></div>
                            <span>${budgetUtil}%</span>
                        </div>
                    </td>
                    <td>₹${analysis.revenue.billed.toLocaleString()}</td>
                    <td class="${analysis.metrics.netMargin < 0 ? 'text-red' : 'text-green'}">
                        ${analysis.metrics.netMargin.toFixed(1)}%
                    </td>
                    <td>${analysis.metrics.roi.toFixed(1)}%</td>
                    <td>
                        Cost to Complete:<br>
                        <strong>₹${analysis.projections.estimatedCostToComplete.toLocaleString()}</strong>
                    </td>
                    <td>
                        <button onclick="recalculateProject('${p._id}')" class="btn-icon"><i class="fas fa-sync"></i></button>
                        <button onclick="editProject('${p._id}')" class="btn-icon"><i class="fas fa-edit"></i></button>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        }
    } catch (err) {
        console.error('Error loading projects list:', err);
    }
}

async function recalculateProject(id) {
    await fetch(`/api/projects/${id}/recalculate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    loadProjectsList();
    loadROIMatrix();
}

function openProjectModal() {
    document.getElementById('project-modal').style.display = 'block';
}

function closeProjectModal() {
    document.getElementById('project-modal').style.display = 'none';
}

document.getElementById('project-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const projectData = {
        name: document.getElementById('p-name').value,
        code: document.getElementById('p-code').value,
        description: document.getElementById('p-desc').value,
        budget: { total: document.getElementById('p-budget').value },
        billing: { type: document.getElementById('p-billing').value },
        timeline: { startDate: document.getElementById('p-start').value, endDate: document.getElementById('p-end').value }
    };

    try {
        const response = await fetch('/api/projects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(projectData)
        });

        if (response.ok) {
            closeProjectModal();
            loadProjectsList();
            fetchStats();
        }
    } catch (err) {
        console.error('Error creating project:', err);
    }
});
