/**
 * Asset Controller
 * Handles Asset Lifecycle UI and Analytics
 */

let categoryChart = null;
let projectionChart = null;
let currentAssetId = null;

document.addEventListener('DOMContentLoaded', () => {
    initAssetBox();
});

async function initAssetBox() {
    await fetchAssetSummary();
    await loadAssets();
}

async function fetchAssetSummary() {
    try {
        const response = await fetch('/api/assets/summary', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const summary = await response.json();

        document.getElementById('total-asset-count').textContent = summary.totalCount;
        document.getElementById('total-book-value').textContent = `₹${summary.totalBookValue.toLocaleString()}`;
        document.getElementById('total-accumulated-dep').textContent = `₹${summary.totalAccumulatedDep.toLocaleString()}`;

        renderCategoryChart(summary.byCategory);
    } catch (err) {
        console.error('Error fetching summary:', err);
    }
}

function renderCategoryChart(data) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    if (categoryChart) categoryChart.destroy();

    categoryChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: Object.values(data),
                backgroundColor: ['#48dbfb', '#64ffda', '#ff9f43', '#ff6b6b', '#8892b0']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#8892b0' } } }
        }
    });
}

async function loadAssets() {
    const status = document.getElementById('status-filter').value;
    try {
        const url = status === 'All' ? '/api/assets' : `/api/assets?status=${status}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const assets = await response.json();

        const tbody = document.getElementById('assets-table-body');
        tbody.innerHTML = '';

        assets.forEach(a => {
            const age = Math.floor((new Date() - new Date(a.purchaseDate)) / (1000 * 60 * 60 * 24 * 365));
            const lifeRemaining = Math.max(0, a.usefulLife - age);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${a.name}</strong><br><small>${a.assetCode}</small></td>
                <td>${a.category}</td>
                <td>₹${a.purchasePrice.toLocaleString()}</td>
                <td>${lifeRemaining} Years</td>
                <td>₹${a.currentBookValue.toLocaleString()}</td>
                <td>
                    <button class="btn-sm btn-secondary" onclick="viewAssetDetails('${a._id}')">Details</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Error loading assets:', err);
    }
}

async function viewAssetDetails(id) {
    currentAssetId = id;
    try {
        const response = await fetch(`/api/assets/${id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { asset, schedule, projections } = await response.json();

        document.getElementById('detail-asset-name').textContent = asset.name;
        document.getElementById('asset-detail-container').classList.remove('hidden');

        renderHistoryTable(schedule);
        renderProjectionChart(projections);

        window.scrollTo({ top: document.getElementById('asset-detail-container').offsetTop - 50, behavior: 'smooth' });
    } catch (err) {
        console.error('Error viewing details:', err);
    }
}

function renderHistoryTable(schedule) {
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = schedule.map(s => `
        <tr>
            <td>${s.period.month}/${s.period.year}</td>
            <td>${s.methodUsed}</td>
            <td>₹${s.depreciationAmount.toFixed(0)}</td>
            <td>₹${s.closingBookValue.toFixed(0)}</td>
        </tr>
    `).join('');
}

function renderProjectionChart(projections) {
    const ctx = document.getElementById('projectionChart').getContext('2d');
    if (projectionChart) projectionChart.destroy();

    projectionChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: projections.filter((_, i) => i % 12 === 0).map(p => `Year ${p.month / 12}`),
            datasets: [{
                label: 'Projected Book Value',
                data: projections.filter((_, i) => i % 12 === 0).map(p => p.remainingValue),
                borderColor: '#48dbfb',
                backgroundColor: 'rgba(72, 219, 251, 0.1)',
                fill: true
            }]
        },
        options: {
            scales: {
                y: { ticks: { color: '#8892b0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { ticks: { color: '#8892b0' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

async function runDepreciationCycle() {
    if (!confirm('Run batch depreciation for all active assets for the current month?')) return;

    const now = new Date();
    try {
        const response = await fetch('/api/assets/run-depreciation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ year: now.getFullYear(), month: now.getMonth() + 1 })
        });

        if (response.ok) {
            alert('Monthly depreciation cycle completed successfully.');
            initAssetBox();
            if (currentAssetId) viewAssetDetails(currentAssetId);
        }
    } catch (err) {
        console.error('Error running dep cycle:', err);
    }
}

function openAssetModal() { document.getElementById('asset-modal').style.display = 'block'; }
function closeAssetModal() { document.getElementById('asset-modal').style.display = 'none'; }
function closeDetails() { document.getElementById('asset-detail-container').classList.add('hidden'); }

document.getElementById('asset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const assetData = {
        name: document.getElementById('a-name').value,
        assetCode: document.getElementById('a-code').value,
        category: document.getElementById('a-cat').value,
        purchaseDate: document.getElementById('a-date').value,
        purchasePrice: Number(document.getElementById('a-price').value),
        salvageValue: Number(document.getElementById('a-salvage').value || 0),
        usefulLife: Number(document.getElementById('a-life').value),
        depreciationMethod: document.getElementById('a-method').value
    };

    try {
        const response = await fetch('/api/assets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(assetData)
        });

        if (response.ok) {
            closeAssetModal();
            initAssetBox();
        }
    } catch (err) {
        console.error('Error registering asset:', err);
    }
});
