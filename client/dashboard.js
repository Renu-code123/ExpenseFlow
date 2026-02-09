class Dashboard {
    constructor() {
        this.init();
    }

    init() {
        this.loadMockData();
        this.setupEventListeners();
        this.initializeChart();
    }

    loadMockData() {
        // Mock data for demo
        document.getElementById('total-balance').textContent = '$5,247.83';
        document.getElementById('month-income').textContent = '$8,500.00';
        document.getElementById('month-expenses').textContent = '$3,252.17';
        document.getElementById('savings-rate').textContent = '62%';
        document.getElementById('user-name').textContent = 'Welcome, John Doe';
        
        this.loadMockTransactions();
        this.loadMockBudgets();
        this.loadMockGoals();
    }

    loadMockTransactions() {
        const transactions = [
            { description: 'Grocery Shopping', amount: -85.50, category: 'food', date: '2024-01-20' },
            { description: 'Salary Deposit', amount: 3500.00, category: 'income', date: '2024-01-19' },
            { description: 'Netflix Subscription', amount: -15.99, category: 'entertainment', date: '2024-01-18' },
            { description: 'Gas Station', amount: -45.20, category: 'transport', date: '2024-01-17' },
            { description: 'Coffee Shop', amount: -12.75, category: 'food', date: '2024-01-16' }
        ];
        
        const transactionsList = document.getElementById('transactions-list');
        transactionsList.innerHTML = transactions.map(t => `
            <div class="transaction-item">
                <div class="transaction-info">
                    <strong>${t.description}</strong>
                    <small>${new Date(t.date).toLocaleDateString()}</small>
                </div>
                <div class="transaction-amount ${t.amount > 0 ? 'income' : 'expense'}">
                    ${t.amount > 0 ? '+' : ''}$${Math.abs(t.amount).toFixed(2)}
                </div>
            </div>
        `).join('');
    }

    loadMockBudgets() {
        const budgets = [
            { category: 'Food', spent: 285, limit: 400, percentage: 71 },
            { category: 'Transport', spent: 120, limit: 200, percentage: 60 },
            { category: 'Entertainment', spent: 95, limit: 150, percentage: 63 }
        ];
        
        const budgetList = document.getElementById('budget-list');
        budgetList.innerHTML = budgets.map(b => `
            <div class="budget-item">
                <div class="budget-info">
                    <span class="budget-category">${b.category}</span>
                    <span class="budget-amount">$${b.spent} / $${b.limit}</span>
                </div>
                <div class="budget-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${b.percentage}%"></div>
                    </div>
                    <span class="progress-text">${b.percentage}%</span>
                </div>
            </div>
        `).join('');
    }

    loadMockGoals() {
        const goals = [
            { name: 'Emergency Fund', current: 2500, target: 5000, percentage: 50 },
            { name: 'Vacation', current: 750, target: 2000, percentage: 38 },
            { name: 'New Laptop', current: 800, target: 1200, percentage: 67 }
        ];
        
        const goalsList = document.getElementById('goals-list');
        goalsList.innerHTML = goals.map(g => `
            <div class="goal-item">
                <div class="goal-info">
                    <span class="goal-name">${g.name}</span>
                    <span class="goal-amount">$${g.current} / $${g.target}</span>
                </div>
                <div class="goal-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${g.percentage}%"></div>
                    </div>
                    <span class="progress-text">${g.percentage}%</span>
                </div>
            </div>
        `).join('');
    }

    initializeChart() {
        const ctx = document.getElementById('expense-chart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan 15', 'Jan 16', 'Jan 17', 'Jan 18', 'Jan 19', 'Jan 20', 'Jan 21'],
                datasets: [{
                    label: 'Daily Expenses',
                    data: [65, 45, 80, 35, 95, 85, 70],
                    borderColor: '#4CAF50',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#cccccc'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#cccccc'
                        }
                    }
                }
            }
        });
    }

    setupEventListeners() {
        // Remove logout functionality
        document.getElementById('logout-btn').style.display = 'none';
        
        // Modal controls
        document.getElementById('add-expense-btn').addEventListener('click', () => {
            this.openTransactionModal('expense');
        });
        
        document.getElementById('add-income-btn').addEventListener('click', () => {
            this.openTransactionModal('income');
        });
        
        document.getElementById('modal-close').addEventListener('click', () => {
            this.closeTransactionModal();
        });
        
        document.getElementById('cancel-btn').addEventListener('click', () => {
            this.closeTransactionModal();
        });
        
        // Other action buttons
        document.getElementById('view-analytics-btn').addEventListener('click', () => {
            alert('Analytics page coming soon!');
        });
        
        document.getElementById('export-data-btn').addEventListener('click', () => {
            alert('Export functionality coming soon!');
        });
    }

    openTransactionModal(type) {
        const modal = document.getElementById('transaction-modal');
        const typeSelect = document.getElementById('transaction-type');
        
        modal.style.display = 'flex';
        typeSelect.value = type;
        
        document.getElementById('modal-title').textContent = 
            type === 'expense' ? 'Add Expense' : 'Add Income';
    }

    closeTransactionModal() {
        const modal = document.getElementById('transaction-modal');
        modal.style.display = 'none';
        document.getElementById('transaction-form').reset();
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});