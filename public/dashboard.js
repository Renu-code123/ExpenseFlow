class Dashboard {
    constructor() {
        this.init();
    }

    init() {
        this.loadMockData();
        this.setupEventListeners();
        this.initializeChart();
        this.displayFinancialHealthScore();
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
            this.openReportExportModal();
        });
        // Add event listeners for report export modal buttons
        const pdfBtn = document.getElementById('export-pdf-btn');
        if (pdfBtn) pdfBtn.addEventListener('click', () => this.exportReportPDF());
        const excelBtn = document.getElementById('export-excel-btn');
        if (excelBtn) excelBtn.addEventListener('click', () => this.exportReportExcel());
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

    openReportExportModal() {
        // Show modal for export options
        const modal = document.getElementById('report-export-modal');
        if (modal) modal.style.display = 'flex';
    }

    closeReportExportModal() {
        const modal = document.getElementById('report-export-modal');
        if (modal) modal.style.display = 'none';
    }

    exportReportPDF() {
        // Example: Export dashboard data to PDF using jsPDF
        if (window.jsPDF) {
            const doc = new jsPDF();
            doc.text('ExpenseFlow Financial Report', 20, 20);
            doc.text('Total Balance: ' + document.getElementById('total-balance').textContent, 20, 40);
            doc.text('Monthly Income: ' + document.getElementById('month-income').textContent, 20, 60);
            doc.text('Monthly Expenses: ' + document.getElementById('month-expenses').textContent, 20, 80);
            doc.text('Savings Rate: ' + document.getElementById('savings-rate').textContent, 20, 100);
            doc.save('ExpenseFlow_Report.pdf');
        } else {
            alert('jsPDF library not loaded.');
        }
        this.closeReportExportModal();
    }

    exportReportExcel() {
        // Example: Export dashboard data to Excel using SheetJS
        if (window.XLSX) {
            const wb = XLSX.utils.book_new();
            const ws_data = [
                ['Metric', 'Value'],
                ['Total Balance', document.getElementById('total-balance').textContent],
                ['Monthly Income', document.getElementById('month-income').textContent],
                ['Monthly Expenses', document.getElementById('month-expenses').textContent],
                ['Savings Rate', document.getElementById('savings-rate').textContent]
            ];
            const ws = XLSX.utils.aoa_to_sheet(ws_data);
            XLSX.utils.book_append_sheet(wb, ws, 'Report');
            XLSX.writeFile(wb, 'ExpenseFlow_Report.xlsx');
        } else {
            alert('SheetJS (XLSX) library not loaded.');
        }
        this.closeReportExportModal();
    }

    // Financial Health Score Algorithm
    calculateFinancialHealthScore() {
        // Example metrics: savings rate, debt-to-income, expense ratio
        const income = this.getNumericValue('month-income');
        const expenses = this.getNumericValue('month-expenses');
        const balance = this.getNumericValue('total-balance');
        const debt = this.getNumericValue('total-debt'); // Add this metric to UI
        const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;
        const debtToIncome = income > 0 ? (debt / income) * 100 : 0;
        const expenseRatio = income > 0 ? (expenses / income) * 100 : 0;

        // Composite score (weighted)
        let score = 100;
        score -= Math.min(expenseRatio, 100) * 0.4;
        score -= Math.min(debtToIncome, 100) * 0.4;
        score += Math.max(savingsRate, 0) * 0.2;
        score = Math.max(0, Math.min(100, Math.round(score)));
        return {
            score,
            savingsRate: Math.round(savingsRate),
            debtToIncome: Math.round(debtToIncome),
            expenseRatio: Math.round(expenseRatio)
        };
    }

    getNumericValue(id) {
        const el = document.getElementById(id);
        if (!el) return 0;
        const val = el.textContent.replace(/[^\d.-]/g, '');
        return parseFloat(val) || 0;
    }

    displayFinancialHealthScore() {
        const result = this.calculateFinancialHealthScore();
        const scoreEl = document.getElementById('health-score-content');
        if (scoreEl) {
            scoreEl.innerHTML = `
                <div style="font-size:2.5em;font-weight:700;color:${result.score>80?'#4CAF50':result.score>60?'#FFC107':'#F44336'};">${result.score}/100</div>
                <div style="margin-top:12px;">Savings Rate: <strong>${result.savingsRate}%</strong></div>
                <div>Debt-to-Income: <strong>${result.debtToIncome}%</strong></div>
                <div>Expense Ratio: <strong>${result.expenseRatio}%</strong></div>
                <div style="margin-top:16px;">${result.score>80?'Excellent':result.score>60?'Good':'Needs Improvement'} Financial Health</div>
            `;
        }
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});