/**
 * Inventory Hub Controller
 * Handles all inventory management UI logic
 */

let stockDistChart = null;
let abcChart = null;
let currentStockItems = [];
let currentWarehouses = [];

document.addEventListener('DOMContentLoaded', () => {
    loadInventoryDashboard();
    loadWarehouses();
    loadStockItems();
    loadBackOrders();
    loadReplenishmentAlerts();
    setupForms();
});

async function loadInventoryDashboard() {
    try {
        const res = await fetch('/api/inventory/dashboard', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        updateDashboardStats(data);
        loadABCClassification();
    } catch (err) {
        console.error('Failed to load inventory dashboard:', err);
    }
}

function updateDashboardStats(data) {
    document.getElementById('total-warehouses').textContent = data.summary.totalWarehouses;
    document.getElementById('total-items').textContent = data.summary.totalStockItems;
    document.getElementById('inventory-value').textContent = `₹${data.summary.totalInventoryValue.toLocaleString()}`;
    document.getElementById('low-stock-count').textContent = data.summary.stockStatusCounts.low_stock + data.summary.stockStatusCounts.out_of_stock;
}

async function loadWarehouses() {
    try {
        const res = await fetch('/api/inventory/warehouses', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        currentWarehouses = data;
        renderWarehouses(data);
        populateWarehouseDropdowns(data);
    } catch (err) {
        console.error('Failed to load warehouses:', err);
    }
}

function renderWarehouses(warehouses) {
    const list = document.getElementById('warehouses-list');

    if (!warehouses || warehouses.length === 0) {
        list.innerHTML = '<div class="empty-state">No warehouses created yet.</div>';
        return;
    }

    list.innerHTML = warehouses.map(wh => `
        <div class="warehouse-card glass-card-sm">
            <div class="wh-header">
                <div class="wh-icon ${wh.warehouseType}">
                    <i class="fas fa-warehouse"></i>
                </div>
                <div class="wh-info">
                    <strong>${wh.warehouseName}</strong>
                    <span>${wh.warehouseCode}</span>
                </div>
                <span class="status-pill ${wh.status}">${wh.status}</span>
            </div>
            <div class="wh-location">
                <i class="fas fa-map-marker-alt"></i>
                <span>${wh.location?.city || 'N/A'}</span>
            </div>
        </div>
    `).join('');
}

function populateWarehouseDropdowns(warehouses) {
    const selects = ['stock-warehouse', 'warehouse-filter'];

    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            const options = warehouses.map(wh =>
                `<option value="${wh._id}">${wh.warehouseName} (${wh.warehouseCode})</option>`
            ).join('');

            if (selectId === 'warehouse-filter') {
                select.innerHTML = '<option value="">All Warehouses</option>' + options;
            } else {
                select.innerHTML = options;
            }
        }
    });
}

async function loadStockItems() {
    try {
        const res = await fetch('/api/inventory/stock', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        currentStockItems = data;
        renderStockItems(data);
        renderStockDistribution(data);
    } catch (err) {
        console.error('Failed to load stock items:', err);
    }
}

function renderStockItems(items) {
    const list = document.getElementById('stock-items-list');

    if (!items || items.length === 0) {
        list.innerHTML = '<div class="empty-state">No stock items found.</div>';
        return;
    }

    list.innerHTML = items.map(item => `
        <div class="stock-item-card glass-card-sm" onclick="viewStockDetails('${item.sku}')">
            <div class="item-header">
                <div class="item-info">
                    <strong>${item.itemName}</strong>
                    <span class="sku-badge">${item.sku}</span>
                </div>
                <span class="status-badge ${item.stockStatus}">${item.stockStatus.replace('_', ' ')}</span>
            </div>
            <div class="item-details">
                <div class="detail-row">
                    <label>Warehouse:</label>
                    <span>${item.warehouseId?.warehouseName || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <label>Available:</label>
                    <span class="quantity-badge">${item.quantity.available} ${item.quantity.unit}</span>
                </div>
                <div class="detail-row">
                    <label>Value:</label>
                    <span>₹${item.valuation.totalValue.toLocaleString()}</span>
                </div>
            </div>
            ${item.quantity.current <= item.reorderPoint ? `
                <div class="reorder-alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    Reorder needed: ${item.reorderPoint - item.quantity.current} units
                </div>
            ` : ''}
        </div>
    `).join('');
}

function renderStockDistribution(items) {
    const ctx = document.getElementById('stockDistChart').getContext('2d');

    if (stockDistChart) {
        stockDistChart.destroy();
    }

    const statusCounts = {
        in_stock: items.filter(i => i.stockStatus === 'in_stock').length,
        low_stock: items.filter(i => i.stockStatus === 'low_stock').length,
        out_of_stock: items.filter(i => i.stockStatus === 'out_of_stock').length
    };

    stockDistChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['In Stock', 'Low Stock', 'Out of Stock'],
            datasets: [{
                data: [statusCounts.in_stock, statusCounts.low_stock, statusCounts.out_of_stock],
                backgroundColor: ['#64ffda', '#ff9f43', '#ff6b6b'],
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

async function loadABCClassification() {
    try {
        const res = await fetch('/api/inventory/reports/abc-classification', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderABCChart(data);
    } catch (err) {
        console.error('Failed to load ABC classification:', err);
    }
}

function renderABCChart(data) {
    const ctx = document.getElementById('abcChart').getContext('2d');

    if (abcChart) {
        abcChart.destroy();
    }

    abcChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Class A', 'Class B', 'Class C'],
            datasets: [{
                label: 'Item Count',
                data: [
                    data.summary.classACount,
                    data.summary.classBCount,
                    data.summary.classCCount
                ],
                backgroundColor: ['#64ffda', '#48dbfb', '#ff9f43'],
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

async function loadBackOrders() {
    try {
        const res = await fetch('/api/inventory/backorders', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderBackOrders(data);
    } catch (err) {
        console.error('Failed to load back orders:', err);
    }
}

function renderBackOrders(backOrders) {
    const list = document.getElementById('backorders-list');
    const count = document.getElementById('backorders-count');

    count.textContent = backOrders.length;

    if (!backOrders || backOrders.length === 0) {
        list.innerHTML = '<div class="empty-state">No pending back orders.</div>';
        return;
    }

    list.innerHTML = backOrders.map(bo => `
        <div class="backorder-card glass-card-sm">
            <div class="bo-header">
                <div class="bo-info">
                    <strong>${bo.itemName}</strong>
                    <span class="sku-badge">${bo.sku}</span>
                </div>
                <span class="priority-badge ${bo.priority}">${bo.priority}</span>
            </div>
            <div class="bo-details">
                <div class="detail-item">
                    <label>Requested:</label>
                    <span>${bo.requestedQuantity}</span>
                </div>
                <div class="detail-item">
                    <label>Fulfilled:</label>
                    <span>${bo.fulfilledQuantity}</span>
                </div>
                <div class="detail-item">
                    <label>Pending:</label>
                    <span class="pending-qty">${bo.pendingQuantity}</span>
                </div>
            </div>
        </div>
    `).join('');
}

async function loadReplenishmentAlerts() {
    try {
        const res = await fetch('/api/inventory/replenishment/recommendations', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        renderReplenishmentAlerts(data.recommendations);
    } catch (err) {
        console.error('Failed to load replenishment alerts:', err);
    }
}

function renderReplenishmentAlerts(alerts) {
    const list = document.getElementById('replenishment-alerts');

    if (!alerts || alerts.length === 0) {
        list.innerHTML = '<div class="empty-state">No replenishment needed.</div>';
        return;
    }

    // Show top 5 alerts
    const topAlerts = alerts.slice(0, 5);

    list.innerHTML = topAlerts.map(alert => `
        <div class="alert-card ${alert.priority}">
            <div class="alert-icon">
                <i class="fas fa-exclamation-circle"></i>
            </div>
            <div class="alert-content">
                <strong>${alert.itemName}</strong>
                <p>Order ${alert.suggestedOrderQty} units</p>
                <span class="alert-reason">${alert.reason}</span>
            </div>
        </div>
    `).join('');
}

async function viewStockDetails(sku) {
    try {
        const res = await fetch(`/api/inventory/stock/${sku}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        const modal = document.getElementById('stock-details-modal');
        const content = document.getElementById('stock-details-content');

        content.innerHTML = `
            <div class="stock-details">
                <div class="details-grid">
                    <div class="detail-section">
                        <h4>Basic Information</h4>
                        <div class="detail-row">
                            <label>SKU:</label>
                            <span>${data.sku}</span>
                        </div>
                        <div class="detail-row">
                            <label>Item Name:</label>
                            <span>${data.itemName}</span>
                        </div>
                        <div class="detail-row">
                            <label>Category:</label>
                            <span>${data.category}</span>
                        </div>
                        <div class="detail-row">
                            <label>Warehouse:</label>
                            <span>${data.warehouseId.warehouseName}</span>
                        </div>
                    </div>
                    <div class="detail-section">
                        <h4>Stock Levels</h4>
                        <div class="detail-row">
                            <label>Current:</label>
                            <span>${data.quantity.current} ${data.quantity.unit}</span>
                        </div>
                        <div class="detail-row">
                            <label>Reserved:</label>
                            <span>${data.quantity.reserved} ${data.quantity.unit}</span>
                        </div>
                        <div class="detail-row">
                            <label>Available:</label>
                            <span class="text-accent">${data.quantity.available} ${data.quantity.unit}</span>
                        </div>
                        <div class="detail-row">
                            <label>Reorder Point:</label>
                            <span>${data.reorderPoint}</span>
                        </div>
                    </div>
                    <div class="detail-section">
                        <h4>Pricing & Valuation</h4>
                        <div class="detail-row">
                            <label>Cost Price:</label>
                            <span>₹${data.pricing.costPrice}</span>
                        </div>
                        <div class="detail-row">
                            <label>Selling Price:</label>
                            <span>₹${data.pricing.sellingPrice}</span>
                        </div>
                        <div class="detail-row">
                            <label>Total Value:</label>
                            <span class="text-accent">₹${data.valuation.totalValue.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                <div class="movements-section">
                    <h4>Recent Movements</h4>
                    <div class="movements-list">
                        ${data.movements.slice(-5).reverse().map(m => `
                            <div class="movement-item">
                                <span class="movement-type ${m.movementType}">${m.movementType}</span>
                                <span>${m.quantity} units</span>
                                <span>${new Date(m.movementDate).toLocaleDateString()}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    } catch (err) {
        console.error('Failed to load stock details:', err);
    }
}

async function generateReplenishment() {
    if (!confirm('Generate automated procurement requests for low stock items?')) return;

    try {
        const res = await fetch('/api/inventory/replenishment/auto-generate', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const { data } = await res.json();

        alert(`Generated ${data.generated} procurement requests. Total value: ₹${data.totalValue.toLocaleString()}`);
        loadReplenishmentAlerts();
    } catch (err) {
        console.error('Failed to generate replenishment:', err);
    }
}

function filterStockItems() {
    const warehouseFilter = document.getElementById('warehouse-filter').value;
    const statusFilter = document.getElementById('status-filter').value;

    let filtered = currentStockItems;

    if (warehouseFilter) {
        filtered = filtered.filter(item => item.warehouseId._id === warehouseFilter);
    }

    if (statusFilter) {
        filtered = filtered.filter(item => item.stockStatus === statusFilter);
    }

    renderStockItems(filtered);
}

// Modal Functions
function openAddStockModal() {
    document.getElementById('add-stock-modal').classList.remove('hidden');
}

function closeAddStockModal() {
    document.getElementById('add-stock-modal').classList.add('hidden');
}

function openWarehouseModal() {
    document.getElementById('warehouse-modal').classList.remove('hidden');
}

function closeWarehouseModal() {
    document.getElementById('warehouse-modal').classList.add('hidden');
}

function closeStockDetailsModal() {
    document.getElementById('stock-details-modal').classList.add('hidden');
}

function setupForms() {
    // Add Stock Form
    document.getElementById('add-stock-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const stockData = {
            sku: document.getElementById('stock-sku').value.toUpperCase(),
            itemName: document.getElementById('stock-name').value,
            category: document.getElementById('stock-category').value,
            warehouseId: document.getElementById('stock-warehouse').value,
            quantity: parseInt(document.getElementById('stock-quantity').value),
            costPrice: parseFloat(document.getElementById('stock-cost').value),
            reorderPoint: parseInt(document.getElementById('stock-reorder').value),
            safetyStock: parseInt(document.getElementById('stock-safety').value)
        };

        try {
            const res = await fetch('/api/inventory/stock/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(stockData)
            });

            if (res.ok) {
                closeAddStockModal();
                loadStockItems();
                loadInventoryDashboard();
            }
        } catch (err) {
            console.error('Failed to add stock:', err);
        }
    });

    // Warehouse Form
    document.getElementById('warehouse-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const warehouseData = {
            warehouseCode: document.getElementById('wh-code').value.toUpperCase(),
            warehouseName: document.getElementById('wh-name').value,
            warehouseType: document.getElementById('wh-type').value,
            location: {
                city: document.getElementById('wh-city').value
            }
        };

        try {
            const res = await fetch('/api/inventory/warehouses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(warehouseData)
            });

            if (res.ok) {
                closeWarehouseModal();
                loadWarehouses();
                loadInventoryDashboard();
            }
        } catch (err) {
            console.error('Failed to create warehouse:', err);
        }
    });
}
