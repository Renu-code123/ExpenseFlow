class Dashboard {
    constructor() {
        this.init();
    }

    init() {
        this.loadMockData();
        this.setupEventListeners();
        this.initializeChart();
        this.displayFinancialHealthScore();
        this.displayBudgetVsActual();
        this.displayExpenseTrends();
        this.displayCashFlowForecast();
        this.displayBudgetAutomation();
        this.displayCategoryDeepDive();
        this.displayComparativeAnalysis();
        this.displayGoalTracking();
        this.displayScenarioPlanning();
        this.displayCustomReportBuilder();
        this.displayScheduledReports();
        this.displayInteractiveDashboard();
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

    // Budget vs Actual Analysis
    displayBudgetVsActual() {
        // Example: Compare actual expenses to budgeted limits
        const budgets = [
            { category: 'Food', spent: 285, limit: 400 },
            { category: 'Transport', spent: 120, limit: 200 },
            { category: 'Entertainment', spent: 95, limit: 150 }
        ];
        const container = document.getElementById('budget-actual-content');
        if (!container) return;
        container.innerHTML = budgets.map(b => {
            const variance = b.spent - b.limit;
            const percent = b.limit > 0 ? ((b.spent - b.limit) / b.limit) * 100 : 0;
            const trend = percent > 0 ? '↑' : percent < 0 ? '↓' : '-';
            return `
                <div style="margin-bottom:18px;padding:12px 18px;border-radius:8px;background:#f7f7f7;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                    <strong>${b.category}</strong> <span style="float:right;">$${b.spent} / $${b.limit}</span><br>
                    <span style="color:${percent>0?'#F44336':'#4CAF50'};font-weight:600;">${variance>0?'+':''}${variance} (${percent.toFixed(1)}%) ${trend}</span>
                </div>
            `;
        }).join('');
    }

    // Expense Trend Analysis
    displayExpenseTrends() {
        // Example: Year-over-year monthly expenses
        const trends = [
            { month: 'Jan', year: 2025, amount: 320 },
            { month: 'Feb', year: 2025, amount: 340 },
            { month: 'Mar', year: 2025, amount: 310 },
            { month: 'Jan', year: 2026, amount: 350 },
            { month: 'Feb', year: 2026, amount: 370 },
            { month: 'Mar', year: 2026, amount: 330 }
        ];
        const container = document.getElementById('expense-trends-content');
        if (!container) return;
        // Group by month, compare years
        const months = ['Jan','Feb','Mar'];
        container.innerHTML = months.map(m => {
            const lastYear = trends.find(t => t.month===m && t.year===2025)?.amount || 0;
            const thisYear = trends.find(t => t.month===m && t.year===2026)?.amount || 0;
            const diff = thisYear - lastYear;
            const percent = lastYear > 0 ? ((thisYear - lastYear) / lastYear) * 100 : 0;
            return `
                <div style="margin-bottom:14px;padding:10px 16px;border-radius:6px;background:#e3f2fd;">
                    <strong>${m}</strong>: <span style="color:${diff>0?'#F44336':'#4CAF50'};font-weight:600;">${diff>0?'+':''}${diff} (${percent.toFixed(1)}%)</span> vs last year
                </div>
            `;
        }).join('');
    }

    // Cash Flow Forecasting (12+ months)
    displayCashFlowForecast() {
        // Example: Simple linear forecast based on average monthly net
        const months = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
        const history = [320,340,310,350,370,330,360,380,400,390,410,420]; // last 12 months
        const avgNet = history.reduce((a,b)=>a+b,0)/history.length;
        let forecast = [];
        for(let i=0;i<12;i++){
            forecast.push(Math.round(avgNet + (Math.random()-0.5)*40)); // add some noise
        }
        const container = document.getElementById('cash-flow-content');
        if(!container) return;
        container.innerHTML = months.map((m,i)=>{
            return `<div style="margin-bottom:10px;padding:8px 14px;border-radius:6px;background:#e8f5e9;">
                <strong>${m}</strong>: <span style="font-weight:600;">$${forecast[i]}</span> forecast</div>`;
        }).join('');
    }

    // Budget Automation (ML stub)
    displayBudgetAutomation() {
        // Example: Auto-generate budgets based on history
        const categories = ['Food','Transport','Entertainment','Utilities','Health'];
        const history = {
            Food: [285,300,295,310],
            Transport: [120,130,125,140],
            Entertainment: [95,110,105,120],
            Utilities: [80,85,90,95],
            Health: [60,65,70,75]
        };
        const autoBudgets = categories.map(cat=>{
            const avg = history[cat].reduce((a,b)=>a+b,0)/history[cat].length;
            return {category:cat,limit:Math.round(avg*1.1)}; // 10% buffer
        });
        const container = document.getElementById('budget-auto-content');
        if(!container) return;
        container.innerHTML = autoBudgets.map(b=>{
            return `<div style="margin-bottom:10px;padding:8px 14px;border-radius:6px;background:#fffde7;">
                <strong>${b.category}</strong>: <span style="font-weight:600;">$${b.limit}</span> auto-budget</div>`;
        }).join('');
    }

    // Category Deep Dive
    displayCategoryDeepDive() {
        // Example: Drill-down with subcategories
        const categories = {
            Food: {Groceries:180, Dining:105},
            Transport: {Fuel:70, Public:50},
            Entertainment: {Streaming:55, Events:40}
        };
        const container = document.getElementById('category-dive-content');
        if(!container) return;
        container.innerHTML = Object.keys(categories).map(cat=>{
            const subs = categories[cat];
            return `<div style="margin-bottom:14px;padding:10px 16px;border-radius:6px;background:#f3e5f5;">
                <strong>${cat}</strong><ul style="margin:8px 0 0 18px;">`+
                Object.keys(subs).map(sub=>`<li>${sub}: $${subs[sub]}</li>`).join('')+
                `</ul></div>`;
        }).join('');
    }

    // Comparative Analysis
    displayComparativeAnalysis() {
        // Example: Compare user spending to industry averages
        const user = {Food:285,Transport:120,Entertainment:95};
        const industry = {Food:300,Transport:140,Entertainment:110};
        const container = document.getElementById('comparative-content');
        if(!container) return;
        container.innerHTML = Object.keys(user).map(cat=>{
            const diff = user[cat]-industry[cat];
            const percent = industry[cat]>0?((user[cat]-industry[cat])/industry[cat])*100:0;
            return `<div style="margin-bottom:10px;padding:8px 14px;border-radius:6px;background:#e1f5fe;">
                <strong>${cat}</strong>: <span style="color:${diff>0?'#F44336':'#4CAF50'};font-weight:600;">${diff>0?'+':''}${diff} (${percent.toFixed(1)}%)</span> vs industry</div>`;
        }).join('');
    }

    // Goal Tracking Dashboard
    displayGoalTracking() {
        // Example: Visual progress for savings goals
        const goals = [
            {name:'Emergency Fund',current:2500,target:5000},
            {name:'Vacation',current:750,target:2000},
            {name:'New Laptop',current:800,target:1200}
        ];
        const container = document.getElementById('goal-tracking-content');
        if(!container) return;
        container.innerHTML = goals.map(g=>{
            const percent = g.target>0?(g.current/g.target)*100:0;
            return `<div style="margin-bottom:14px;padding:10px 16px;border-radius:6px;background:#fff3e0;">
                <strong>${g.name}</strong>: <span style="font-weight:600;">$${g.current} / $${g.target}</span>
                <div style="margin-top:6px;width:100%;height:10px;background:#eee;border-radius:5px;">
                    <div style="height:10px;background:#64ffda;border-radius:5px;width:${percent}%"></div>
                </div>
                <span style="font-size:0.9em;">${percent.toFixed(1)}% complete</span>
            </div>`;
        }).join('');
    }

    // Scenario Planning (What-if)
    displayScenarioPlanning() {
        // Example: What-if analysis for budget changes
        const scenarios = [
            {change:'Increase Food budget by 10%',impact:'Food limit: $440'},
            {change:'Reduce Transport budget by 20%',impact:'Transport limit: $160'},
            {change:'Increase Entertainment budget by 15%',impact:'Entertainment limit: $172'}
        ];
        const container = document.getElementById('scenario-content');
        if(!container) return;
        container.innerHTML = scenarios.map(s=>{
            return `<div style="margin-bottom:10px;padding:8px 14px;border-radius:6px;background:#fce4ec;">
                <strong>${s.change}</strong>: <span style="font-weight:600;">${s.impact}</span></div>`;
        }).join('');
    }

    // Custom Report Builder (UI stub)
    displayCustomReportBuilder() {
        // Example: Drag-and-drop UI placeholder
        const container = document.getElementById('custom-report-content');
        if(!container) return;
        container.innerHTML = `<div style="padding:18px;background:#f5f5f5;border-radius:10px;">
            <strong>Custom Report Builder</strong><br>
            <span style="font-size:0.95em;">Drag and drop metrics to build your own report (UI coming soon)</span>
        </div>`;
    }

    // Scheduled Reports (UI stub)
    displayScheduledReports() {
        // Example: Scheduled report list
        const container = document.getElementById('scheduled-reports-content');
        if(!container) return;
        container.innerHTML = `<div style="padding:18px;background:#e0f7fa;border-radius:10px;">
            <strong>Scheduled Reports</strong><br>
            <span style="font-size:0.95em;">No scheduled reports yet. Set up recurring emails in settings.</span>
        </div>`;
    }

    // Interactive Dashboard (UI stub)
    displayInteractiveDashboard() {
        // Example: Real-time update placeholder
        const container = document.getElementById('interactive-content');
        if(!container) return;
        container.innerHTML = `<div style="padding:18px;background:#f1f8e9;border-radius:10px;">
            <strong>Interactive Dashboard</strong><br>
            <span style="font-size:0.95em;">Real-time updates and drill-down coming soon.</span>
        </div>`;
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});