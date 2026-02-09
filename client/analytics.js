// Analytics Page JavaScript
class AnalyticsManager {
    constructor() {
        this.charts = {};
        this.currentPeriod = 'daily';
        this.currentTimeRange = 30;
        this.apiBase = '/api/analytics';
        this.token = localStorage.getItem('token');
        this.init();
    }

    init() {
        this.loadAnalyticsData();
        this.bindEvents();
    }

    async loadAnalyticsData() {
        try {
            await Promise.all([
                this.loadSummary(),
                this.loadTrends(),
                this.loadCategories(),
                this.loadMerchants(),
                this.loadIncomeExpense(),
                this.loadInsights()
            ]);
            this.initializeCharts();
        } catch (error) {
            console.error('Error loading analytics:', error);
            this.fallbackToMockData();
        }
    }

    async apiCall(endpoint, params = {}) {
        const url = new URL(this.apiBase + endpoint, window.location.origin);
        Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error('API call failed');
        return response.json();
    }

    async loadSummary() {
        try {
            this.summaryData = await this.apiCall('/summary', { timeRange: this.currentTimeRange });
            this.updateSummaryCards();
        } catch (error) {
            console.error('Error loading summary:', error);
        }
    }

    async loadTrends() {
        try {
            this.trendsData = await this.apiCall('/trends', { 
                period: this.currentPeriod, 
                timeRange: this.currentTimeRange 
            });
        } catch (error) {
            console.error('Error loading trends:', error);
        }
    }

    async loadCategories() {
        try {
            this.categoriesData = await this.apiCall('/categories', { timeRange: this.currentTimeRange });
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    }

    async loadMerchants() {
        try {
            this.merchantsData = await this.apiCall('/merchants', { timeRange: this.currentTimeRange });
            this.updateMerchantsDisplay();
        } catch (error) {
            console.error('Error loading merchants:', error);
        }
    }

    async loadIncomeExpense() {
        try {
            this.incomeExpenseData = await this.apiCall('/income-expense', { months: 6 });
        } catch (error) {
            console.error('Error loading income/expense:', error);
        }
    }

    async loadInsights() {
        try {
            this.insightsData = await this.apiCall('/insights');
            this.updateInsightsDisplay();
        } catch (error) {
            console.error('Error loading insights:', error);
        }
    }

    fallbackToMockData() {
        this.mockData = this.generateMockData();
        this.summaryData = {
            totalIncome: 45250,
            totalExpenses: 32180,
            netSavings: 13070,
            avgDaily: 1073
        };
        this.categoriesData = this.mockData.categoryData;
        this.merchantsData = this.mockData.merchantData;
        this.trendsData = this.mockData.dailySpending;
        this.incomeExpenseData = this.mockData.monthlyData;
        this.initializeCharts();
        this.updateSummaryCards();
        this.updateMerchantsDisplay();
    }

    generateMockData() {
        const categories = [
            { name: 'Food & Dining', icon: '🍔', color: '#f87171' },
            { name: 'Shopping', icon: '🛒', color: '#60a5fa' },
            { name: 'Transportation', icon: '🚗', color: '#4ade80' },
            { name: 'Entertainment', icon: '🎬', color: '#a78bfa' },
            { name: 'Healthcare', icon: '💊', color: '#fb7185' },
            { name: 'Bills & Utilities', icon: '⚡', color: '#fbbf24' }
        ];

        const merchants = ['Amazon', 'Swiggy', 'Uber', 'Zomato', 'Netflix', 'Spotify'];
        
        return {
            categories,
            merchants,
            dailySpending: this.generateDailyData(30),
            monthlyData: this.generateMonthlyData(12),
            categoryData: this.generateCategoryData(categories),
            merchantData: this.generateMerchantData(merchants)
        };
    }

    generateDailyData(days) {
        const data = [];
        const today = new Date();
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            
            data.push({
                date: date.toISOString().split('T')[0],
                expense: Math.floor(Math.random() * 2000) + 500,
                income: i % 7 === 0 ? Math.floor(Math.random() * 5000) + 3000 : 0
            });
        }
        
        return data;
    }

    generateMonthlyData(months) {
        const data = [];
        const today = new Date();
        
        for (let i = months - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setMonth(date.getMonth() - i);
            
            data.push({
                month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                expense: Math.floor(Math.random() * 30000) + 20000,
                income: Math.floor(Math.random() * 20000) + 35000
            });
        }
        
        return data;
    }

    generateCategoryData(categories) {
        return categories.map(cat => ({
            ...cat,
            amount: Math.floor(Math.random() * 15000) + 2000,
            transactions: Math.floor(Math.random() * 50) + 10,
            trend: Math.floor(Math.random() * 40) - 20
        }));
    }

    generateMerchantData(merchants) {
        return merchants.map(merchant => ({
            name: merchant,
            amount: Math.floor(Math.random() * 10000) + 1000,
            transactions: Math.floor(Math.random() * 30) + 5
        })).sort((a, b) => b.amount - a.amount);
    }

    initializeCharts() {
        this.createSpendingTrendChart();
        this.createCategoryChart();
        this.createIncomeExpenseChart();
        this.updateMerchantsDisplay();
    }

    createSpendingTrendChart() {
        const ctx = document.getElementById('spendingTrendChart').getContext('2d');
        const data = this.trendsData || this.generateMockData().dailySpending.slice(-14);
        
        this.charts.spendingTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => {
                    const date = d._id ? new Date(d._id) : new Date(d.date);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }),
                datasets: [{
                    label: 'Daily Spending',
                    data: data.map(d => d.totalAmount || d.expense),
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { 
                            color: '#a0a0a0',
                            callback: function(value) {
                                return '₹' + value.toLocaleString();
                            }
                        }
                    },
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#a0a0a0' }
                    }
                }
            }
        });
    }

    createCategoryChart() {
        const ctx = document.getElementById('categoryChart').getContext('2d');
        const categoryData = this.categoriesData || this.generateMockData().categoryData.slice(0, 6);
        
        const colors = ['#f87171', '#60a5fa', '#4ade80', '#a78bfa', '#fb7185', '#fbbf24'];
        
        this.charts.category = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: categoryData.map(c => c.category || c.name),
                datasets: [{
                    data: categoryData.map(c => c.amount),
                    backgroundColor: colors.slice(0, categoryData.length),
                    borderWidth: 0,
                    hoverBorderWidth: 3,
                    hoverBorderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#e0e0e0',
                            padding: 20,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${context.label}: ₹${context.parsed.toLocaleString()} (${percentage}%)`;
                            }
                        }
                    }
                },
                cutout: '60%'
            }
        });
    }

    createIncomeExpenseChart() {
        const ctx = document.getElementById('incomeExpenseChart').getContext('2d');
        const data = this.incomeExpenseData || this.generateMockData().monthlyData.slice(-6);
        
        this.charts.incomeExpense = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => {
                    if (d.month) return d.month;
                    const date = new Date(d._id || d.date);
                    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                }),
                datasets: [
                    {
                        label: 'Income',
                        data: data.map(d => d.income || 0),
                        backgroundColor: 'rgba(74, 222, 128, 0.8)',
                        borderColor: '#4ade80',
                        borderWidth: 1,
                        borderRadius: 6
                    },
                    {
                        label: 'Expenses',
                        data: data.map(d => d.expense || d.totalAmount || 0),
                        backgroundColor: 'rgba(248, 113, 113, 0.8)',
                        borderColor: '#f87171',
                        borderWidth: 1,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#e0e0e0' }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { 
                            color: '#a0a0a0',
                            callback: function(value) {
                                return '₹' + (value / 1000) + 'K';
                            }
                        }
                    },
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#a0a0a0' }
                    }
                }
            }
        });
    }

    updateMerchantsDisplay() {
        const merchantsList = document.querySelector('.merchants-list');
        if (!merchantsList || !this.merchantsData) return;
        
        const topMerchants = this.merchantsData.slice(0, 4);
        const maxAmount = Math.max(...topMerchants.map(m => m.amount));
        
        merchantsList.innerHTML = topMerchants.map(merchant => `
            <div class="merchant-item">
                <span class="merchant-name">${merchant.name}</span>
                <span class="merchant-amount">₹${merchant.amount.toLocaleString()}</span>
                <div class="merchant-bar" style="width: ${(merchant.amount / maxAmount) * 100}%"></div>
            </div>
        `).join('');
    }

    updateInsightsDisplay() {
        const insightsGrid = document.querySelector('.insights-grid');
        if (!insightsGrid || !this.insightsData) return;
        
        insightsGrid.innerHTML = this.insightsData.map(insight => `
            <div class="insight-card">
                <div class="insight-icon">${insight.icon}</div>
                <div class="insight-content">
                    <h4>${insight.title}</h4>
                    <p>${insight.message}</p>
                </div>
            </div>
        `).join('');
    }

    bindEvents() {
        // Time range selector
        document.getElementById('timeRange').addEventListener('change', async (e) => {
            this.currentTimeRange = parseInt(e.target.value);
            await this.updateTimeRange();
        });

        // Chart period buttons
        document.querySelectorAll('.chart-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentPeriod = e.target.dataset.period;
                await this.loadTrends();
                this.updateSpendingChart();
            });
        });

        // Report type selector
        document.getElementById('reportType').addEventListener('change', async (e) => {
            await this.updateReportTable(e.target.value);
        });
    }

    async updateTimeRange() {
        await this.loadAnalyticsData();
    }

    updateSummaryCards() {
        if (!this.summaryData) return;
        
        const cards = document.querySelectorAll('.summary-card');
        if (cards.length >= 4) {
            cards[0].querySelector('.amount').textContent = `₹${this.summaryData.totalIncome.toLocaleString()}`;
            cards[1].querySelector('.amount').textContent = `₹${this.summaryData.totalExpenses.toLocaleString()}`;
            cards[2].querySelector('.amount').textContent = `₹${this.summaryData.netSavings.toLocaleString()}`;
            cards[3].querySelector('.amount').textContent = `₹${Math.round(this.summaryData.avgDaily).toLocaleString()}`;
        }
    }

    updateChartsData() {
        if (this.charts.spendingTrend && this.trendsData) {
            this.charts.spendingTrend.data.labels = this.trendsData.map(d => 
                new Date(d._id).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            );
            this.charts.spendingTrend.data.datasets[0].data = this.trendsData.map(d => d.totalAmount);
            this.charts.spendingTrend.update();
        }
        
        if (this.charts.category && this.categoriesData) {
            this.charts.category.data.labels = this.categoriesData.map(c => c.category);
            this.charts.category.data.datasets[0].data = this.categoriesData.map(c => c.amount);
            this.charts.category.update();
        }
        
        if (this.charts.incomeExpense && this.incomeExpenseData) {
            this.charts.incomeExpense.data.labels = this.incomeExpenseData.map(d => d.month);
            this.charts.incomeExpense.data.datasets[0].data = this.incomeExpenseData.map(d => d.income || 0);
            this.charts.incomeExpense.data.datasets[1].data = this.incomeExpenseData.map(d => d.expense || 0);
            this.charts.incomeExpense.update();
        }
    }

    updateSpendingChart() {
        // Update chart based on selected period
        let data, labels;
        
        switch (this.currentPeriod) {
            case 'weekly':
                data = this.generateWeeklyData();
                break;
            case 'monthly':
                data = this.mockData.monthlyData.slice(-6);
                labels = data.map(d => d.month);
                break;
            default:
                data = this.mockData.dailySpending.slice(-14);
                labels = data.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        }
        
        if (this.charts.spendingTrend) {
            this.charts.spendingTrend.data.labels = labels;
            this.charts.spendingTrend.data.datasets[0].data = data.map(d => d.expense);
            this.charts.spendingTrend.update();
        }
    }

    generateWeeklyData() {
        const weeks = [];
        const today = new Date();
        
        for (let i = 7; i >= 0; i--) {
            const weekStart = new Date(today);
            weekStart.setDate(weekStart.getDate() - (i * 7));
            
            weeks.push({
                week: `Week ${8 - i}`,
                expense: Math.floor(Math.random() * 8000) + 3000
            });
        }
        
        return weeks;
    }

    async updateReportTable(reportType) {
        const tbody = document.getElementById('reportTableBody');
        let data = [];
        
        try {
            const reportData = await this.apiCall(`/report/${reportType}`, { timeRange: this.currentTimeRange });
            
            switch (reportType) {
                case 'category':
                    data = reportData.map(item => ({
                        name: item._id,
                        amount: item.totalAmount,
                        transactions: item.transactionCount,
                        percentage: '0',
                        trend: Math.floor(Math.random() * 40) - 20,
                        icon: this.getCategoryIcon(item._id)
                    }));
                    break;
                case 'monthly':
                case 'yearly':
                    data = reportData.map(item => ({
                        name: item._id,
                        amount: item.totalAmount,
                        transactions: item.transactionCount,
                        percentage: '0',
                        trend: Math.floor(Math.random() * 40) - 20,
                        icon: '📊'
                    }));
                    break;
            }
        } catch (error) {
            console.error('Error loading report:', error);
            data = this.categoriesData || [];
        }
        
        tbody.innerHTML = data.slice(0, 5).map(item => `
            <tr>
                <td><span class="category-icon">${item.icon || '📊'}</span> ${item.name || item.category}</td>
                <td class="amount">₹${item.amount.toLocaleString()}</td>
                <td>${item.transactions}</td>
                <td>${item.percentage || '0'}%</td>
                <td>₹${Math.floor(item.amount / item.transactions)}</td>
                <td><span class="trend ${item.trend > 0 ? 'up' : item.trend < 0 ? 'down' : 'neutral'}">
                    ${item.trend > 0 ? '↗️' : item.trend < 0 ? '↘️' : '➡️'} ${Math.abs(item.trend)}%
                </span></td>
            </tr>
        `).join('');
    }

    getCategoryIcon(category) {
        const icons = {
            'Food & Dining': '🍔',
            'Shopping': '🛒',
            'Transportation': '🚗',
            'Entertainment': '🎬',
            'Healthcare': '💊',
            'Bills & Utilities': '⚡'
        };
        return icons[category] || '📊';
    }

    generateMonthlyReport() {
        return this.mockData.monthlyData.map(month => ({
            name: month.month,
            amount: month.expense,
            transactions: Math.floor(Math.random() * 100) + 50,
            trend: Math.floor(Math.random() * 40) - 20
        }));
    }

    generateYearlyReport() {
        const currentYear = new Date().getFullYear();
        return Array.from({ length: 3 }, (_, i) => ({
            name: (currentYear - i).toString(),
            amount: Math.floor(Math.random() * 300000) + 200000,
            transactions: Math.floor(Math.random() * 1000) + 500,
            trend: Math.floor(Math.random() * 30) - 15
        }));
    }
}

// Chart type toggle function
function toggleChartType(chartId) {
    const analytics = window.analyticsManager;
    if (chartId === 'categoryChart' && analytics.charts.category) {
        const chart = analytics.charts.category;
        chart.config.type = chart.config.type === 'doughnut' ? 'bar' : 'doughnut';
        chart.update();
    }
}

// Export functionality
function exportReport() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(20);
    doc.text('ExpenseFlow Analytics Report', 20, 30);
    
    // Add date
    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 45);
    
    // Add summary
    doc.setFontSize(14);
    doc.text('Financial Summary', 20, 65);
    doc.setFontSize(10);
    doc.text('Total Income: ₹45,250', 20, 80);
    doc.text('Total Expenses: ₹32,180', 20, 90);
    doc.text('Net Savings: ₹13,070', 20, 100);
    doc.text('Average Daily Spend: ₹1,073', 20, 110);
    
    // Add insights
    doc.setFontSize(14);
    doc.text('Key Insights', 20, 130);
    doc.setFontSize(10);
    doc.text('• You spend 40% more on weekends', 20, 145);
    doc.text('• You are 15% under budget this month', 20, 155);
    doc.text('• Reduce food delivery by 20% to save ₹2,500 monthly', 20, 165);
    
    // Save the PDF
    doc.save('expense-analytics-report.pdf');
    
    // Show success message
    showNotification('Report exported successfully!', 'success');
}

// Generate report function
async function generateReport() {
    const reportType = document.getElementById('reportType').value;
    showNotification(`Generating ${reportType} report...`, 'info');
    
    try {
        await window.analyticsManager.updateReportTable(reportType);
        showNotification('Report generated successfully!', 'success');
    } catch (error) {
        showNotification('Error generating report', 'error');
    }
}

// Notification function
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#4ade80' : type === 'error' ? '#f87171' : '#60a5fa'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Initialize analytics when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.analyticsManager = new AnalyticsManager();
});

// Add CSS animation for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);