// Goals & Savings Page JavaScript
class GoalsManager {
    constructor() {
        this.goals = [];
        this.currentFilter = 'all';
        this.editingGoal = null;
        this.currentGoalId = null;
        
        this.init();
    }

    init() {
        this.loadGoals();
        this.bindEvents();
        this.setDefaultDate();
        this.updateSummaryCards();
    }

    // Mock data generation
    generateMockGoals() {
        const categories = {
            emergency: { name: 'Emergency Fund', icon: '🚨' },
            vacation: { name: 'Vacation', icon: '✈️' },
            car: { name: 'Vehicle', icon: '🚗' },
            house: { name: 'House/Property', icon: '🏠' },
            education: { name: 'Education', icon: '🎓' },
            retirement: { name: 'Retirement', icon: '👴' },
            other: { name: 'Other', icon: '🎯' }
        };

        const goals = [
            {
                id: 'goal_1',
                name: 'Emergency Fund',
                category: 'emergency',
                targetAmount: 100000,
                currentAmount: 75000,
                monthlyContribution: 10000,
                deadline: '2024-12-31',
                description: 'Build a 6-month emergency fund for financial security',
                status: 'active',
                createdAt: '2024-01-15',
                contributions: [
                    { date: '2024-01-15', amount: 25000, note: 'Initial deposit' },
                    { date: '2024-02-01', amount: 10000, note: 'Monthly contribution' },
                    { date: '2024-02-15', amount: 15000, note: 'Bonus money' },
                    { date: '2024-03-01', amount: 10000, note: 'Monthly contribution' },
                    { date: '2024-03-15', amount: 15000, note: 'Tax refund' }
                ]
            },
            {
                id: 'goal_2',
                name: 'Dream Vacation to Japan',
                category: 'vacation',
                targetAmount: 80000,
                currentAmount: 80000,
                monthlyContribution: 8000,
                deadline: '2024-06-01',
                description: 'Two-week trip to Japan including flights, hotels, and activities',
                status: 'completed',
                createdAt: '2023-10-01',
                completedAt: '2024-05-15',
                contributions: [
                    { date: '2023-10-01', amount: 20000, note: 'Initial savings' },
                    { date: '2023-11-01', amount: 8000, note: 'Monthly contribution' },
                    { date: '2023-12-01', amount: 8000, note: 'Monthly contribution' },
                    { date: '2024-01-01', amount: 8000, note: 'Monthly contribution' },
                    { date: '2024-02-01', amount: 8000, note: 'Monthly contribution' },
                    { date: '2024-03-01', amount: 8000, note: 'Monthly contribution' },
                    { date: '2024-04-01', amount: 8000, note: 'Monthly contribution' },
                    { date: '2024-05-01', amount: 12000, note: 'Final contribution' }
                ]
            },
            {
                id: 'goal_3',
                name: 'New Car Down Payment',
                category: 'car',
                targetAmount: 150000,
                currentAmount: 45000,
                monthlyContribution: 12000,
                deadline: '2025-03-01',
                description: 'Save for down payment on a new car',
                status: 'active',
                createdAt: '2024-01-01',
                contributions: [
                    { date: '2024-01-01', amount: 15000, note: 'Initial deposit' },
                    { date: '2024-02-01', amount: 12000, note: 'Monthly contribution' },
                    { date: '2024-03-01', amount: 12000, note: 'Monthly contribution' },
                    { date: '2024-04-01', amount: 6000, note: 'Partial contribution' }
                ]
            },
            {
                id: 'goal_4',
                name: 'Master\'s Degree Fund',
                category: 'education',
                targetAmount: 200000,
                currentAmount: 25000,
                monthlyContribution: 8000,
                deadline: '2025-08-01',
                description: 'Save for MBA program tuition and expenses',
                status: 'active',
                createdAt: '2024-02-01',
                contributions: [
                    { date: '2024-02-01', amount: 10000, note: 'Initial savings' },
                    { date: '2024-03-01', amount: 8000, note: 'Monthly contribution' },
                    { date: '2024-04-01', amount: 7000, note: 'Monthly contribution' }
                ]
            },
            {
                id: 'goal_5',
                name: 'Home Renovation',
                category: 'house',
                targetAmount: 120000,
                currentAmount: 30000,
                monthlyContribution: 0,
                deadline: '2024-10-01',
                description: 'Kitchen and bathroom renovation project',
                status: 'paused',
                createdAt: '2023-12-01',
                contributions: [
                    { date: '2023-12-01', amount: 20000, note: 'Initial savings' },
                    { date: '2024-01-15', amount: 10000, note: 'Additional funds' }
                ]
            }
        ];

        return goals;
    }

    loadGoals() {
        // In a real app, this would fetch from API
        this.goals = this.generateMockGoals();
        this.renderGoals();
        this.updateSummaryCards();
    }

    bindEvents() {
        // Filter tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.renderGoals();
            });
        });

        // Form submissions
        document.getElementById('goalForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveGoal();
        });

        document.getElementById('contributionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addContribution();
        });

        // Modal close events
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeGoalModal();
                this.closeGoalDetailsModal();
                this.closeContributionModal();
            }
        });
    }

    setDefaultDate() {
        const today = new Date();
        const nextYear = new Date(today);
        nextYear.setFullYear(today.getFullYear() + 1);
        
        document.getElementById('goalDeadline').value = nextYear.toISOString().split('T')[0];
        document.getElementById('contributionDate').value = today.toISOString().split('T')[0];
    }

    updateSummaryCards() {
        const totalGoals = this.goals.length;
        const activeGoals = this.goals.filter(g => g.status === 'active').length;
        const completedGoals = this.goals.filter(g => g.status === 'completed').length;
        
        const totalSaved = this.goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
        const totalTarget = this.goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
        const overallProgress = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;
        
        const avgMonthlySavings = this.goals
            .filter(g => g.status === 'active')
            .reduce((sum, goal) => sum + goal.monthlyContribution, 0);

        document.getElementById('totalGoals').textContent = totalGoals;
        document.querySelector('.total-goals .stat-detail').textContent = 
            `${activeGoals} Active, ${completedGoals} Completed`;
        
        document.getElementById('totalSaved').textContent = `₹${totalSaved.toLocaleString()}`;
        document.getElementById('targetAmount').textContent = `₹${totalTarget.toLocaleString()}`;
        document.querySelector('.target-amount .stat-detail').textContent = `${overallProgress}% achieved`;
        
        document.getElementById('monthlySavings').textContent = `₹${avgMonthlySavings.toLocaleString()}`;
    }

    renderGoals() {
        const goalsGrid = document.getElementById('goalsGrid');
        const emptyState = document.getElementById('emptyState');
        
        let filteredGoals = this.goals;
        if (this.currentFilter !== 'all') {
            filteredGoals = this.goals.filter(goal => goal.status === this.currentFilter);
        }

        if (filteredGoals.length === 0) {
            goalsGrid.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        goalsGrid.style.display = 'grid';
        emptyState.style.display = 'none';

        goalsGrid.innerHTML = filteredGoals.map(goal => {
            const progress = Math.round((goal.currentAmount / goal.targetAmount) * 100);
            const remaining = goal.targetAmount - goal.currentAmount;
            const categoryInfo = this.getCategoryInfo(goal.category);
            
            let timeRemaining = '';
            if (goal.deadline && goal.status === 'active') {
                const daysLeft = Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24));
                timeRemaining = daysLeft > 0 ? `${daysLeft} days left` : 'Overdue';
            }

            return `
                <div class="goal-card ${goal.status}" data-id="${goal.id}">
                    <div class="goal-header">
                        <div class="goal-info">
                            <h3>${goal.name}</h3>
                            <span class="goal-category">
                                ${categoryInfo.icon} ${categoryInfo.name}
                            </span>
                        </div>
                        <span class="goal-status ${goal.status}">${goal.status}</span>
                    </div>
                    
                    <div class="goal-progress">
                        <div class="progress-info">
                            <span class="progress-amount">₹${goal.currentAmount.toLocaleString()} / ₹${goal.targetAmount.toLocaleString()}</span>
                            <span class="progress-percentage">${progress}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${Math.min(progress, 100)}%"></div>
                        </div>
                        ${remaining > 0 ? `<div class="progress-remaining">₹${remaining.toLocaleString()} remaining</div>` : ''}
                    </div>
                    
                    <div class="goal-details">
                        <span>Monthly: ₹${goal.monthlyContribution.toLocaleString()}</span>
                        <span>${timeRemaining}</span>
                    </div>
                    
                    <div class="goal-actions">
                        ${goal.status === 'active' ? `
                            <button class="action-btn primary" onclick="goalsManager.openContributionModal('${goal.id}')">
                                <i class="fas fa-plus"></i> Add Money
                            </button>
                        ` : ''}
                        <button class="action-btn" onclick="goalsManager.showGoalDetails('${goal.id}')">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button class="action-btn" onclick="goalsManager.editGoal('${goal.id}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        ${goal.status === 'active' ? `
                            <button class="action-btn" onclick="goalsManager.toggleGoalStatus('${goal.id}', 'paused')">
                                <i class="fas fa-pause"></i> Pause
                            </button>
                        ` : goal.status === 'paused' ? `
                            <button class="action-btn" onclick="goalsManager.toggleGoalStatus('${goal.id}', 'active')">
                                <i class="fas fa-play"></i> Resume
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    getCategoryInfo(category) {
        const categories = {
            emergency: { name: 'Emergency Fund', icon: '🚨' },
            vacation: { name: 'Vacation', icon: '✈️' },
            car: { name: 'Vehicle', icon: '🚗' },
            house: { name: 'House/Property', icon: '🏠' },
            education: { name: 'Education', icon: '🎓' },
            retirement: { name: 'Retirement', icon: '👴' },
            other: { name: 'Other', icon: '🎯' }
        };
        return categories[category] || categories.other;
    }

    // Modal functions
    openGoalModal() {
        document.getElementById('modalTitle').textContent = 'Create New Goal';
        document.getElementById('goalForm').reset();
        this.setDefaultDate();
        this.editingGoal = null;
        document.getElementById('goalModal').style.display = 'block';
    }

    closeGoalModal() {
        document.getElementById('goalModal').style.display = 'none';
        this.editingGoal = null;
    }

    editGoal(goalId) {
        const goal = this.goals.find(g => g.id === goalId);
        if (!goal) return;

        document.getElementById('modalTitle').textContent = 'Edit Goal';
        document.getElementById('goalName').value = goal.name;
        document.getElementById('goalAmount').value = goal.targetAmount;
        document.getElementById('goalCategory').value = goal.category;
        document.getElementById('goalDeadline').value = goal.deadline;
        document.getElementById('monthlyContribution').value = goal.monthlyContribution;
        document.getElementById('goalDescription').value = goal.description;
        
        this.editingGoal = goal;
        document.getElementById('goalModal').style.display = 'block';
    }

    async saveGoal() {
        const formData = {
            name: document.getElementById('goalName').value,
            targetAmount: parseFloat(document.getElementById('goalAmount').value),
            category: document.getElementById('goalCategory').value,
            deadline: document.getElementById('goalDeadline').value,
            monthlyContribution: parseFloat(document.getElementById('monthlyContribution').value) || 0,
            description: document.getElementById('goalDescription').value
        };

        try {
            if (this.editingGoal) {
                // Update existing goal
                const index = this.goals.findIndex(g => g.id === this.editingGoal.id);
                if (index !== -1) {
                    this.goals[index] = { ...this.editingGoal, ...formData };
                }
                this.showNotification('Goal updated successfully!', 'success');
            } else {
                // Add new goal
                const newGoal = {
                    id: `goal_${Date.now()}`,
                    ...formData,
                    currentAmount: 0,
                    status: 'active',
                    createdAt: new Date().toISOString().split('T')[0],
                    contributions: []
                };
                this.goals.push(newGoal);
                this.showNotification('Goal created successfully!', 'success');
            }

            this.renderGoals();
            this.updateSummaryCards();
            this.closeGoalModal();
        } catch (error) {
            this.showNotification('Error saving goal', 'error');
        }
    }

    showGoalDetails(goalId) {
        const goal = this.goals.find(g => g.id === goalId);
        if (!goal) return;

        const progress = Math.round((goal.currentAmount / goal.targetAmount) * 100);
        const categoryInfo = this.getCategoryInfo(goal.category);
        
        let timeRemaining = 'No deadline set';
        if (goal.deadline) {
            const daysLeft = Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24));
            timeRemaining = daysLeft > 0 ? `${daysLeft} days remaining` : 'Overdue';
        }

        const detailsHtml = `
            <div class="detail-section">
                <h4>Goal Information</h4>
                <div class="detail-row">
                    <span class="detail-label">Name:</span>
                    <span class="detail-value">${goal.name}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Category:</span>
                    <span class="detail-value">${categoryInfo.icon} ${categoryInfo.name}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Target Amount:</span>
                    <span class="detail-value">₹${goal.targetAmount.toLocaleString()}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Current Amount:</span>
                    <span class="detail-value">₹${goal.currentAmount.toLocaleString()}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Progress:</span>
                    <span class="detail-value">${progress}%</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Monthly Contribution:</span>
                    <span class="detail-value">₹${goal.monthlyContribution.toLocaleString()}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Deadline:</span>
                    <span class="detail-value">${timeRemaining}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value">
                        <span class="goal-status ${goal.status}">${goal.status}</span>
                    </span>
                </div>
                ${goal.description ? `
                    <div class="detail-row">
                        <span class="detail-label">Description:</span>
                        <span class="detail-value">${goal.description}</span>
                    </div>
                ` : ''}
            </div>
            
            ${goal.contributions && goal.contributions.length > 0 ? `
                <div class="detail-section">
                    <h4>Contribution History</h4>
                    ${goal.contributions.slice(-5).reverse().map(contribution => `
                        <div class="contribution-item">
                            <div>
                                <div class="contribution-date">${new Date(contribution.date).toLocaleDateString()}</div>
                                ${contribution.note ? `<div style="font-size: 0.8rem; color: #a0a0a0;">${contribution.note}</div>` : ''}
                            </div>
                            <div class="contribution-amount">+₹${contribution.amount.toLocaleString()}</div>
                        </div>
                    `).join('')}
                    ${goal.contributions.length > 5 ? `<div style="text-align: center; margin-top: 10px; color: #a0a0a0; font-size: 0.9rem;">Showing last 5 contributions</div>` : ''}
                </div>
            ` : ''}
        `;

        document.getElementById('detailsModalTitle').textContent = goal.name;
        document.getElementById('goalDetailsContent').innerHTML = detailsHtml;
        document.getElementById('goalDetailsModal').style.display = 'block';
    }

    closeGoalDetailsModal() {
        document.getElementById('goalDetailsModal').style.display = 'none';
    }

    openContributionModal(goalId) {
        this.currentGoalId = goalId;
        document.getElementById('contributionForm').reset();
        document.getElementById('contributionDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('contributionModal').style.display = 'block';
    }

    closeContributionModal() {
        document.getElementById('contributionModal').style.display = 'none';
        this.currentGoalId = null;
    }

    async addContribution() {
        if (!this.currentGoalId) return;

        const amount = parseFloat(document.getElementById('contributionAmount').value);
        const date = document.getElementById('contributionDate').value;
        const note = document.getElementById('contributionNote').value;

        const goal = this.goals.find(g => g.id === this.currentGoalId);
        if (!goal) return;

        try {
            const contribution = {
                date: date,
                amount: amount,
                note: note || 'Manual contribution'
            };

            goal.contributions.push(contribution);
            goal.currentAmount += amount;

            // Check if goal is completed
            if (goal.currentAmount >= goal.targetAmount && goal.status === 'active') {
                goal.status = 'completed';
                goal.completedAt = new Date().toISOString().split('T')[0];
                this.showNotification(`🎉 Congratulations! You've completed your "${goal.name}" goal!`, 'success');
            } else {
                this.showNotification('Contribution added successfully!', 'success');
            }

            this.renderGoals();
            this.updateSummaryCards();
            this.closeContributionModal();
        } catch (error) {
            this.showNotification('Error adding contribution', 'error');
        }
    }

    toggleGoalStatus(goalId, newStatus) {
        const goal = this.goals.find(g => g.id === goalId);
        if (!goal) return;

        goal.status = newStatus;
        this.renderGoals();
        this.updateSummaryCards();
        
        const statusText = newStatus === 'active' ? 'resumed' : 'paused';
        this.showNotification(`Goal ${statusText} successfully!`, 'success');
    }

    deleteGoal(goalId) {
        if (!confirm('Are you sure you want to delete this goal? This action cannot be undone.')) return;

        this.goals = this.goals.filter(g => g.id !== goalId);
        this.renderGoals();
        this.updateSummaryCards();
        this.showNotification('Goal deleted successfully!', 'success');
    }

    showNotification(message, type = 'info') {
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
            z-index: 1001;
            animation: slideIn 0.3s ease;
            max-width: 400px;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Global functions for HTML onclick events
function openGoalModal() {
    goalsManager.openGoalModal();
}

function closeGoalModal() {
    goalsManager.closeGoalModal();
}

function closeGoalDetailsModal() {
    goalsManager.closeGoalDetailsModal();
}

function closeContributionModal() {
    goalsManager.closeContributionModal();
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.goalsManager = new GoalsManager();
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