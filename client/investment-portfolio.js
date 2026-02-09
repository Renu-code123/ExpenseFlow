// Investment Portfolio Logic

const INVESTMENT_API_URL = 'api/investments';
let investmentsData = {
    holdings: [],
    summary: {}
};

// ========================
// Initialization
// ========================

// Add navigation listener to load investments when section is active
document.addEventListener('DOMContentLoaded', () => {
    // Initial check (if reload on investments page)
    if (window.location.hash === '#investments') {
        showSection('investments');
        loadInvestments();
    }

    // Listen for hash changes
    window.addEventListener('hashchange', () => {
        if (window.location.hash === '#investments') {
            loadInvestments();
        }
    });

    const investmentForm = document.getElementById('investment-form');
    if (investmentForm) {
        investmentForm.addEventListener('submit', handleAddInvestment);
    }
});

// ========================
// API Interactions
// ========================

async function loadInvestments() {
    const listContainer = document.getElementById('investments-list');
    if (!listContainer) return;

    // Show loading
    listContainer.innerHTML = `
        <div class="widget-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Loading portfolio...</span>
        </div>
    `;

    try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch(INVESTMENT_API_URL, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch investments');

        const data = await response.json();
        investmentsData = data.data;

        renderPortfolio();
    } catch (error) {
        console.error('Error loading investments:', error);
        listContainer.innerHTML = `<div class="error-msg">Failed to load portfolio. <br>${error.message}</div>`;
    }
}

async function handleAddInvestment(e) {
    e.preventDefault();

    const type = document.getElementById('inv-type').value;
    const symbol = document.getElementById('inv-symbol').value;
    const name = document.getElementById('inv-name').value;
    const quantity = document.getElementById('inv-quantity').value;
    const buyPrice = document.getElementById('inv-buy-price').value;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(INVESTMENT_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                type,
                symbol,
                name,
                quantity,
                buyPrice
            })
        });

        if (!response.ok) throw new Error('Failed to add investment');

        // Success
        closeInvestmentModal();
        if (typeof showNotification === 'function') {
            showNotification('Investment added successfully!', 'success');
        }

        // Reload data
        loadInvestments();

    } catch (error) {
        console.error('Error adding investment:', error);
        alert('Failed to add investment');
    }
}

async function removeInvestment(id) {
    if (!confirm('Are you sure you want to remove this holding?')) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${INVESTMENT_API_URL}/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to remove investment');

        // Reload data
        loadInvestments();
        if (typeof showNotification === 'function') {
            showNotification('Investment removed', 'success');
        }
    } catch (error) {
        console.error('Error removing investment:', error);
        alert('Failed to remove investment');
    }
}

// ========================
// Rendering
// ========================

function renderPortfolio() {
    // 1. Update Summary Stats
    const summary = investmentsData.summary;
    const totalValEl = document.getElementById('portfolio-total-value');
    const totalPLEl = document.getElementById('portfolio-total-pl');
    const totalPLPercentEl = document.getElementById('portfolio-pl-percent');

    if (totalValEl) totalValEl.textContent = formatCurrency(summary.totalValue);
    if (totalPLEl) {
        totalPLEl.textContent = (summary.totalProfitLoss >= 0 ? '+' : '') + formatCurrency(summary.totalProfitLoss);
        totalPLEl.className = `stat-value ${summary.totalProfitLoss >= 0 ? 'income' : 'expense'}`;
    }
    if (totalPLPercentEl) {
        totalPLPercentEl.textContent = `${summary.totalProfitLossPercent.toFixed(2)}%`;
        totalPLPercentEl.className = `trend-text ${summary.totalProfitLossPercent >= 0 ? 'positive' : 'negative'}`;
    }

    // 2. Render List
    const listContainer = document.getElementById('investments-list');
    if (!listContainer) return;

    if (!investmentsData.holdings || investmentsData.holdings.length === 0) {
        listContainer.innerHTML = '<div class="no-data">No investments found. Add some to get started!</div>';
        return;
    }

    listContainer.innerHTML = investmentsData.holdings.map(inv => {
        const isProfit = inv.profitLoss >= 0;
        const plClass = isProfit ? 'positive' : 'negative';

        // Icon based on type
        let icon = 'money-bill-wave';
        if (inv.type === 'crypto') icon = 'bitcoin';
        else if (inv.type === 'stock') icon = 'chart-line';
        else if (inv.type === 'gold') icon = 'coins';

        return `
        <div class="investment-item">
            <div class="inv-icon-wrapper ${inv.type}">
                <i class="fas fa-${icon}"></i>
            </div>
            <div class="inv-details">
                <div class="inv-top">
                    <span class="inv-symbol">${inv.symbol}</span>
                    <span class="inv-price">${formatCurrency(inv.currentPrice || inv.buyPrice)}</span>
                </div>
                <div class="inv-name-qty">
                    <span>${inv.name}</span>
                    <span>${inv.quantity} units</span>
                </div>
            </div>
            <div class="inv-performance">
                <span class="inv-value">${formatCurrency(inv.currentValue)}</span>
                <span class="inv-pl ${plClass}">
                    ${isProfit ? '+' : ''}${formatCurrency(inv.profitLoss)} (${inv.profitLossPercent.toFixed(2)}%)
                </span>
            </div>
            <button class="inv-delete-btn" onclick="removeInvestment('${inv.id}')">
                <i class="fas fa-trash"></i>
            </button>
        </div>
        `;
    }).join('');
}

// ========================
// Helpers
// ========================

function formatCurrency(amount) {
    return '₹' + (amount || 0).toLocaleString('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
    });
}

function updateSymbolPlaceholder() {
    const typeSelect = document.getElementById('inv-type');
    const symbolHint = document.getElementById('symbol-hint');
    const symbolInput = document.getElementById('inv-symbol');

    if (!typeSelect || !symbolInput) return;

    const type = typeSelect.value;
    if (type === 'crypto') {
        symbolInput.placeholder = 'e.g., BTC, ETH, SOL';
        if (symbolHint) symbolHint.style.display = 'block';
    } else {
        symbolInput.placeholder = 'e.g., AAPL, RELIANCE';
        if (symbolHint) symbolHint.style.display = 'none';
    }
}

// ========================
// Modal Control
// ========================

function openInvestmentModal() {
    const modal = document.getElementById('investment-modal');
    if (modal) {
        modal.classList.add('active');
        document.getElementById('investment-form').reset();
        updateSymbolPlaceholder();
    }
}

function closeInvestmentModal() {
    const modal = document.getElementById('investment-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}
