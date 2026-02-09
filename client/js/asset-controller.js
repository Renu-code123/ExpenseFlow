/**
 * Asset Lifecycle & Procurement Controller
 */

document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    loadOrders();
    setupPRForm();
});

async function loadDashboard() {
    try {
        const res = await fetch('/api/procurement/assets/dashboard', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        updateStats(data.stats);
        renderAssets(data.assets);
        initCharts(data.stats);
    } catch (err) {
        console.error('Failed to load asset dashboard:', err);
    }
}

function updateStats(stats) {
    document.getElementById('total-book-value').textContent = `₹${stats.totalBookValue.toLocaleString()}`;
    document.getElementById('accumulated-depreciation').textContent = `₹${stats.totalDepreciation.toLocaleString()}`;
}

function renderAssets(assets) {
    const grid = document.getElementById('assets-grid');
    if (!assets || assets.length === 0) {
        grid.innerHTML = '<div class="empty-state">No active assets found. Assets are auto-created when procurement items are received.</div>';
        return;
    }

    grid.innerHTML = assets.map(asset => `
        <div class="asset-card glass-card">
            <div class="asset-icon ${asset.category}">
                <i class="fas ${getCategoryIcon(asset.category)}"></i>
            </div>
            <div class="asset-info">
                <h3>${asset.name}</h3>
                <span class="asset-serial">${asset.serialNumber || 'No Serial'}</span>
                <div class="asset-value">
                    <label>Book Value</label>
                    <div class="value">₹${asset.currentBookValue.toLocaleString()}</div>
                </div>
                <div class="asset-life">
                    <div class="progress-bar">
                        <div class="progress" style="width: ${calculateLifeUsed(asset)}%"></div>
                    </div>
                    <small>${asset.usefulLifeYears}Y Useful Life</small>
                </div>
            </div>
            <div class="asset-footer">
                <span class="status-pill ${asset.status}">${asset.status}</span>
                <button class="btn-icon" onclick="viewDepreciation('${asset._id}')"><i class="fas fa-history"></i></button>
            </div>
        </div>
    `).join('');
}

function getCategoryIcon(cat) {
    const icons = {
        'electronics': 'fa-laptop',
        'furniture': 'fa-couch',
        'machinery': 'fa-tools',
        'vehicles': 'fa-car',
        'real_estate': 'fa-building'
    };
    return icons[cat] || 'fa-box';
}

function calculateLifeUsed(asset) {
    const purchase = new Date(asset.purchaseDate);
    const monthsOwned = (new Date() - purchase) / (1000 * 60 * 60 * 24 * 30);
    const totalMonths = asset.usefulLifeYears * 12;
    return Math.min(100, (monthsOwned / totalMonths) * 100);
}

async function loadOrders() {
    try {
        const res = await fetch('/api/procurement/orders', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        const list = document.getElementById('orders-list');
        list.innerHTML = data.map(order => `
            <tr>
                <td><strong>${order.orderNumber}</strong></td>
                <td>${order.title}</td>
                <td><span class="os-pill ${order.status}">${order.status.replace('_', ' ')}</span></td>
                <td>₹${order.totalAmount.toLocaleString()}</td>
                <td>
                    ${order.status === 'ordered' ? `<button class="btn-sm" onclick="receiveOrder('${order._id}')">Receive</button>` : ''}
                    ${order.status === 'draft' ? `<button class="btn-sm" onclick="submitOrder('${order._id}')">Submit</button>` : ''}
                </td>
            </tr>
        `).join('');

        document.getElementById('pending-pr-count').textContent = data.filter(o => o.status === 'pending_approval').length;
    } catch (err) {
        console.error('Failed to load orders:', err);
    }
}

function switchSection(sec) {
    document.querySelectorAll('.inventory-content section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`${sec}-section`).classList.remove('hidden');

    document.querySelectorAll('.side-nav .nav-btn').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');
}

function initCharts(stats) {
    const ctx = document.getElementById('assetCategoryChart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(stats.categoryDistribution),
            datasets: [{
                data: Object.values(stats.categoryDistribution),
                backgroundColor: ['#64ffda', '#48dbfb', '#ff9f43', '#ff6b6b', '#54a0ff'],
                borderWidth: 0
            }]
        },
        options: {
            plugins: { legend: { position: 'bottom', labels: { color: '#8892b0' } } }
        }
    });
}

function openPRModal() {
    document.getElementById('pr-modal').classList.remove('hidden');
}

function closePRModal() {
    document.getElementById('pr-modal').classList.add('hidden');
}

function addPRItemRow() {
    const div = document.createElement('div');
    div.className = 'item-row';
    div.innerHTML = `
        <input type="text" placeholder="Item name" class="item-name">
        <input type="number" placeholder="Qty" class="item-qty" value="1">
        <input type="number" placeholder="Unit Price" class="item-price">
        <button type="button" class="remove-item"><i class="fas fa-trash"></i></button>
    `;
    document.getElementById('pr-items-list').appendChild(div);
}

async function runDepreciation() {
    if (!confirm('This will calculate and record depreciation for the current month. Proceed?')) return;

    const res = await fetch('/api/procurement/admin/run-depreciation', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const result = await res.json();
    if (result.success) {
        alert(`Successfully processed ${result.processed} assets.`);
        loadDashboard();
    }
}

function setupPRForm() {
    const form = document.getElementById('pr-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const items = Array.from(document.querySelectorAll('.item-row')).map(row => ({
            name: row.querySelector('.item-name').value,
            quantity: parseInt(row.querySelector('.item-qty').value),
            unitPrice: parseFloat(row.querySelector('.item-price').value),
            totalPrice: parseInt(row.querySelector('.item-qty').value) * parseFloat(row.querySelector('.item-price').value),
            category: 'IT' // Default for now
        }));

        const prData = {
            title: document.getElementById('pr-title').value,
            department: document.getElementById('pr-dept').value,
            items
        };

        const res = await fetch('/api/procurement/requisition', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(prData)
        });

        if (res.ok) {
            closePRModal();
            loadOrders();
        }
    });
}
