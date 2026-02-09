class BudgetManager {
    constructor() {
        this.budgets = [];
        this.init();
    }

    init() {
        this.loadMockBudgets();
        this.setupEventListeners();
        this.renderBudgets();
        this.initializeChart();
        this.loadInsights();
    }

    loadMockBudgets() {
        this.budgets = [
            {
                id: 1,
                category: 'food',
                name: '🍽️ Food & Dining',
                amount: 600,
                spent: 425.50,
                period: 'monthly',
                alertThreshold: 80,
                notes: 'Includes groceries and dining out'
            },
            {
                id: 2,
                category: 'transport',
                name: '🚗 Transportation',
                amount: 300,
                spent: 185.20,
                period: 'monthly',
                alertThreshold: 75,
                notes: 'Gas, public transport, parking'
            },
            {
                id: 3,
                category: 'entertainment',
                name: '🎬 Entertainment',
                amount: 200,
                spent: 156.80,
                period: 'monthly',
                alertThreshold: 80,
                notes: 'Movies, games, subscriptions'
            },
            {
                id: 4,
                category: 'shopping',
                name: '🛒 Shopping',
                amount: 400,
                spent: 320.15,
                period: 'monthly',
                alertThreshold: 85,
                notes: 'Clothing, electronics, misc'
            },
            {
                id: 5,
                category: 'utilities',
                name: '💡 Bills & Utilities',
                amount: 250,
                spent: 245.00,
                period: 'monthly',
                alertThreshold: 90,
                notes: 'Electricity, water, internet'
            },
            {
                id: 6,
                category: 'healthcare',
                name: '🏥 Healthcare',
                amount: 150,
                spent: 85.30,
                period: 'monthly',
                alertThreshold: 70,
                notes: 'Medical expenses, insurance'
            }
        ];
        
        this.updateOverviewCards();
    }

    updateOverviewCards() {
        const totalBudget = this.budgets.reduce((sum, budget) => sum + budget.amount, 0);
        const totalSpent = this.budgets.reduce((sum, budget) => sum + budget.spent, 0);
        const remaining = totalBudget - totalSpent;
        const healthPercentage = Math.round((totalSpent / totalBudget) * 100);

        document.getElementById('total-budget').textContent = `$${totalBudget.toFixed(2)}`;
        document.getElementById('total-spent').textContent = `$${totalSpent.toFixed(2)}`;
        document.getElementById('remaining-budget').textContent = `$${remaining.toFixed(2)}`;
        document.getElementById('budget-health').textContent = `${healthPercentage}%`;
    }

    renderBudgets() {
        const budgetList = document.getElementById('budget-list');
        const filter = document.getElementById('budget-filter').value;
        
        let filteredBudgets = this.budgets;
        
        if (filter !== 'all') {
            filteredBudgets = this.budgets.filter(budget => {
                const percentage = (budget.spent / budget.amount) * 100;
                switch (filter) {
                    case 'over':
                        return percentage > 100;
                    case 'warning':
                        return percentage >= budget.alertThreshold && percentage <= 100;
                    case 'safe':
                        return percentage < budget.alertThreshold;
                    default:
                        return true;
                }
            });
        }

        budgetList.innerHTML = filteredBudgets.map(budget => {
            const percentage = Math.round((budget.spent / budget.amount) * 100);
            const remaining = budget.amount - budget.spent;
            
            let statusClass = 'safe';
            let statusText = 'On Track';
            
            if (percentage > 100) {
                statusClass = 'danger';
                statusText = 'Over Budget';
            } else if (percentage >= budget.alertThreshold) {
                statusClass = 'warning';
                statusText = 'Near Limit';
            }

            return `
                <div class="budget-item">
                    <div class="budget-item-header">
                        <span class="budget-category">${budget.name}</span>
                        <div class="budget-actions">
                            <button class="action-btn" onclick="budgetManager.editBudget(${budget.id})" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn" onclick="budgetManager.deleteBudget(${budget.id})" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="budget-progress">
                        <div class="progress-info">
                            <span class="spent-amount">$${budget.spent.toFixed(2)}</span>
                            <span class="budget-limit">/ $${budget.amount.toFixed(2)}</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill ${statusClass}" style="width: ${Math.min(percentage, 100)}%"></div>
                        </div>
                    </div>
                    
                    <div class="budget-status">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                        <span class="percentage">${percentage}%</span>
                    </div>
                    
                    ${remaining < 0 ? 
                        `<div style="color: #ef5350; font-size: 0.9rem; margin-top: 8px;">
                            <i class="fas fa-exclamation-triangle"></i> 
                            Over by $${Math.abs(remaining).toFixed(2)}
                        </div>` : 
                        `<div style="color: #43e97b; font-size: 0.9rem; margin-top: 8px;">
                            <i class="fas fa-check-circle"></i> 
                            $${remaining.toFixed(2)} remaining
                        </div>`
                    }
                </div>
            `;
        }).join('');
    }

    initializeChart() {
        const ctx = document.getElementById('budget-chart').getContext('2d');
        
        const chartData = this.budgets.map(budget => ({
            category: budget.name.split(' ')[1] || budget.category,
            budgeted: budget.amount,
            spent: budget.spent
        }));

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.map(item => item.category),
                datasets: [
                    {
                        label: 'Budgeted',
                        data: chartData.map(item => item.budgeted),
                        backgroundColor: 'rgba(100, 255, 218, 0.3)',
                        borderColor: '#64ffda',
                        borderWidth: 1
                    },
                    {
                        label: 'Spent',
                        data: chartData.map(item => item.spent),
                        backgroundColor: 'rgba(245, 87, 108, 0.3)',
                        borderColor: '#f5576c',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#cccccc'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#cccccc',
                            callback: function(value) {
                                return '$' + value;
                            }
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

    loadInsights() {
        const insights = [
            {
                text: "You're spending 15% more on food this month compared to last month.",
                type: 'warning'
            },
            {
                text: "Great job! You're under budget in 4 out of 6 categories.",
                type: 'success'
            },
            {
                text: "Consider reducing entertainment expenses to stay within budget.",
                type: 'tip'
            },
            {
                text: "Your utilities budget is almost maxed out. Monitor usage closely.",
                type: 'alert'
            }
        ];

        const insightsList = document.getElementById('budget-insights');
        insightsList.innerHTML = insights.map(insight => `
            <div class="insight-item">
                <div class="insight-text">${insight.text}</div>
            </div>
        `).join('');
    }

    setupEventListeners() {
        // Create budget button
        document.getElementById('create-budget-btn').addEventListener('click', () => {
            this.openBudgetModal();
        });

        // Modal controls
        document.getElementById('budget-modal-close').addEventListener('click', () => {
            this.closeBudgetModal();
        });

        document.getElementById('budget-cancel-btn').addEventListener('click', () => {
            this.closeBudgetModal();
        });

        // Budget form
        document.getElementById('budget-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveBudget();
        });

        // Filter
        document.getElementById('budget-filter').addEventListener('change', () => {
            this.renderBudgets();
        });

        // Close modal when clicking outside
        document.getElementById('budget-modal').addEventListener('click', (e) => {
            if (e.target.id === 'budget-modal') {
                this.closeBudgetModal();
            }
        });
    }

    openBudgetModal(budgetId = null) {
        const modal = document.getElementById('budget-modal');
        const form = document.getElementById('budget-form');
        
        if (budgetId) {
            const budget = this.budgets.find(b => b.id === budgetId);
            if (budget) {
                document.getElementById('budget-modal-title').textContent = 'Edit Budget';
                document.getElementById('budget-id').value = budget.id;
                document.getElementById('budget-category').value = budget.category;
                document.getElementById('budget-amount').value = budget.amount;
                document.getElementById('budget-period').value = budget.period;
                document.getElementById('budget-alert').value = budget.alertThreshold;
                document.getElementById('budget-notes').value = budget.notes || '';
            }
        } else {
            document.getElementById('budget-modal-title').textContent = 'Create Budget';
            form.reset();
            document.getElementById('budget-alert').value = 80;
        }
        
        modal.style.display = 'flex';
    }

    closeBudgetModal() {
        document.getElementById('budget-modal').style.display = 'none';
    }

    saveBudget() {
        const formData = new FormData(document.getElementById('budget-form'));
        const budgetData = {
            category: document.getElementById('budget-category').value,
            amount: parseFloat(document.getElementById('budget-amount').value),
            period: document.getElementById('budget-period').value,
            alertThreshold: parseInt(document.getElementById('budget-alert').value),
            notes: document.getElementById('budget-notes').value
        };

        const budgetId = document.getElementById('budget-id').value;
        
        if (budgetId) {
            // Edit existing budget
            const budgetIndex = this.budgets.findIndex(b => b.id === parseInt(budgetId));
            if (budgetIndex !== -1) {
                this.budgets[budgetIndex] = { ...this.budgets[budgetIndex], ...budgetData };
            }
        } else {
            // Create new budget
            const categoryNames = {
                'food': '🍽️ Food & Dining',
                'transport': '🚗 Transportation',
                'shopping': '🛒 Shopping',
                'entertainment': '🎬 Entertainment',
                'utilities': '💡 Bills & Utilities',
                'healthcare': '🏥 Healthcare',
                'education': '📚 Education',
                'travel': '✈️ Travel',
                'other': '📋 Other'
            };

            const newBudget = {
                id: Date.now(),
                name: categoryNames[budgetData.category] || budgetData.category,
                spent: 0,
                ...budgetData
            };
            
            this.budgets.push(newBudget);
        }

        this.updateOverviewCards();
        this.renderBudgets();
        this.closeBudgetModal();
        
        // Show success message
        this.showNotification('Budget saved successfully!', 'success');
    }

    editBudget(budgetId) {
        this.openBudgetModal(budgetId);
    }

    deleteBudget(budgetId) {
        if (confirm('Are you sure you want to delete this budget?')) {
            this.budgets = this.budgets.filter(b => b.id !== budgetId);
            this.updateOverviewCards();
            this.renderBudgets();
            this.showNotification('Budget deleted successfully!', 'success');
        }
    }

    showNotification(message, type = 'info') {
        // Simple notification system
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#43e97b' : '#64ffda'};
            color: #0f0f23;
            padding: 12px 20px;
            border-radius: 8px;
            font-weight: 600;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Initialize budget manager when page loads
let budgetManager;
document.addEventListener('DOMContentLoaded', () => {
    budgetManager = new BudgetManager();
});