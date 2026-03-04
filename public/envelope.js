class EnvelopeManager {
    constructor() {
        this.envelopes = [];
        this.summary = null;
        this.currentFilter = 'all';
        this.currentPeriod = 'monthly';
        this.init();
    }

    init() {
        this.loadMockData();
        this.setupEventListeners();
        this.renderEnvelopes();
        this.updateSummaryCards();
        this.initializeChart();
    }

    loadMockData() {
        // Mock envelope data
        this.envelopes = [
            {
                id: '1',
                name: '🍽️ Food & Dining',
                category: 'food',
                allocatedAmount: 600,
                spentAmount: 425.50,
                rolledOverAmount: 50,
                period: 'monthly',
                color: '#ff6b6b',
                icon: '🍽️',
                alertThreshold: 80,
                notes: 'Includes groceries and dining out',
                startDate: new Date(),
                endDate: new Date(new Date().setDate(new Date().getDate() + 30))
            },
            {
                id: '2',
                name: '🚗 Transportation',
                category: 'transport',
                allocatedAmount: 300,
                spentAmount: 185.20,
                rolledOverAmount: 0,
                period: 'monthly',
                color: '#4ecdc4',
                icon: '🚗',
                alertThreshold: 75,
                notes: 'Gas, public transport, parking',
                startDate: new Date(),
                endDate: new Date(new Date().setDate(new Date().getDate() + 30))
            },
            {
                id: '3',
                name: '🎬 Entertainment',
                category: 'entertainment',
                allocatedAmount: 200,
                spentAmount: 156.80,
                rolledOverAmount: 25,
                period: 'monthly',
                color: '#a55eea',
                icon: '🎬',
                alertThreshold: 80,
                notes: 'Movies, games, subscriptions',
                startDate: new Date(),
                endDate: new Date(new Date().setDate(new Date().getDate() + 30))
            },
            {
                id: '4',
                name: '🛒 Shopping',
                category: 'shopping',
                allocatedAmount: 400,
                spentAmount: 320.15,
                rolledOverAmount: 0,
                period: 'monthly',
                color: '#fed330',
                icon: '🛒',
                alertThreshold: 85,
                notes: 'Clothing, electronics, misc',
                startDate: new Date(),
                endDate: new Date(new Date().setDate(new Date().getDate() + 30))
            },
            {
                id: '5',
                name: '💡 Bills & Utilities',
                category: 'utilities',
                allocatedAmount: 250,
                spentAmount: 245.00,
                rolledOverAmount: 0,
                period: 'monthly',
                color: '#26de81',
                icon: '💡',
                alertThreshold: 90,
                notes: 'Electricity, water, internet',
                startDate: new Date(),
                endDate: new Date(new Date().setDate(new Date().getDate() + 30))
            },
            {
                id: '6',
                name: '🏥 Healthcare',
                category: 'healthcare',
                allocatedAmount: 150,
                spentAmount: 85.30,
                rolledOverAmount: 20,
                period: 'monthly',
                color: '#fc5c65',
                icon: '🏥',
                alertThreshold: 70,
                notes: 'Medical expenses, insurance',
                startDate: new Date(),
                endDate: new Date(new Date().setDate(new Date().getDate() + 30))
            }
        ];

        // Calculate summary
        this.calculateSummary();
    }

    calculateSummary() {
        const totalAllocated = this.envelopes.reduce((sum, e) => sum + e.allocatedAmount, 0);
        const totalSpent = this.envelopes.reduce((sum, e) => sum + e.spentAmount, 0);
        const totalRolledOver = this.envelopes.reduce((sum, e) => sum + e.rolledOverAmount, 0);
        const totalAvailable = totalAllocated + totalRolledOver;
        const totalRemaining = totalAvailable - totalSpent;

        this.summary = {
            totalAllocated,
            totalSpent,
            totalRolledOver,
            totalAvailable,
            totalRemaining,
            utilizationPercentage: totalAvailable > 0 ? Math.round((totalSpent / totalAvailable) * 100) : 0,
            envelopeCount: this.envelopes.length
        };
    }

    updateSummaryCards() {
        if (!this.summary) this.calculateSummary();

        document.getElementById('total-allocated').textContent = `$${this.summary.totalAllocated.toFixed(2)}`;
        document.getElementById('total-spent').textContent = `$${this.summary.totalSpent.toFixed(2)}`;
        document.getElementById('total-remaining').textContent = `$${this.summary.totalRemaining.toFixed(2)}`;
        document.getElementById('envelope-health').textContent = `${this.summary.utilizationPercentage}%`;
    }

    renderEnvelopes() {
        const envelopeList = document.getElementById('envelope-list');
        const filter = document.getElementById('envelope-filter').value;
        
        let filteredEnvelopes = this.envelopes;
        
        if (filter !== 'all') {
            filteredEnvelopes = this.envelopes.filter(envelope => {
                const totalAvailable = envelope.allocatedAmount + envelope.rolledOverAmount;
                const percentage = totalAvailable > 0 ? (envelope.spentAmount / totalAvailable) * 100 : 0;
                
                switch (filter) {
                    case 'over':
                        return percentage > 100;
                    case 'warning':
                        return percentage >= envelope.alertThreshold && percentage <= 100;
                    case 'safe':
                        return percentage < envelope.alertThreshold;
                    default:
                        return true;
                }
            });
        }

        envelopeList.innerHTML = filteredEnvelopes.map(envelope => {
            const totalAvailable = envelope.allocatedAmount + envelope.rolledOverAmount;
            const percentage = totalAvailable > 0 ? Math.round((envelope.spentAmount / totalAvailable) * 100) : 0;
            const remaining = totalAvailable - envelope.spentAmount;
            
            let statusClass = 'safe';
            let statusText = 'On Track';
            
            if (percentage > 100) {
                statusClass = 'danger';
                statusText = 'Over Budget';
            } else if (percentage >= envelope.alertThreshold) {
                statusClass = 'warning';
                statusText = 'Near Limit';
            }

            return `
                <div class="envelope-card" style="border-left: 4px solid ${envelope.color}">
                    <div class="envelope-header">
                        <div class="envelope-icon" style="background-color: ${envelope.color}20">
                            ${envelope.icon}
                        </div>
                        <div class="envelope-info">
                            <h3 class="envelope-name">${envelope.name}</h3>
                            <span class="envelope-category">${envelope.category}</span>
                        </div>
                        <div class="envelope-actions">
                            <button class="action-btn" onclick="envelopeManager.editEnvelope('${envelope.id}')" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn" onclick="envelopeManager.allocateToEnvelope('${envelope.id}')" title="Allocate">
                                <i class="fas fa-plus-circle"></i>
                            </button>
                            <button class="action-btn" onclick="envelopeManager.deleteEnvelope('${envelope.id}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="envelope-progress">
                        <div class="progress-info">
                            <span class="spent-amount">$${envelope.spentAmount.toFixed(2)}</span>
                            <span class="budget-limit">/ $${totalAvailable.toFixed(2)}</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill ${statusClass}" style="width: ${Math.min(percentage, 100)}%; background-color: ${envelope.color}"></div>
                        </div>
                    </div>
                    
                    <div class="envelope-status">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                        <span class="percentage">${percentage}%</span>
                    </div>
                    
                    <div class="envelope-details">
                        <div class="detail-item">
                            <span class="detail-label">Allocated:</span>
                            <span class="detail-value">$${envelope.allocatedAmount.toFixed(2)}</span>
                        </div>
                        ${envelope.rolledOverAmount > 0 ? `
                        <div class="detail-item">
                            <span class="detail-label">Rolled Over:</span>
                            <span class="detail-value">$${envelope.rolledOverAmount.toFixed(2)}</span>
                        </div>
                        ` : ''}
                        <div class="detail-item">
                            <span class="detail-label">Remaining:</span>
                            <span class="detail-value ${remaining < 0 ? 'negative' : 'positive'}">$${remaining.toFixed(2)}</span>
                        </div>
                    </div>
                    
                    <div class="envelope-actions-bar">
                        <button class="quick-action-btn" onclick="envelopeManager.quickSpend('${envelope.id}')">
                            <i class="fas fa-shopping-cart"></i> Spend
                        </button>
                        <button class="quick-action-btn" onclick="envelopeManager.quickAllocate('${envelope.id}')">
                            <i class="fas fa-plus"></i> Add
                        </button>
                        <button class="quick-action-btn" onclick="envelopeManager.openTransferModal('${envelope.id}')">
                            <i class="fas fa-exchange-alt"></i> Transfer
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    initializeChart() {
        const ctx = document.getElementById('envelope-chart');
        if (!ctx) return;
        
        const ctx2d = ctx.getContext('2d');
        
        const chartData = this.envelopes.map(envelope => ({
            category: envelope.name.split(' ')[1] || envelope.category,
            allocated: envelope.allocatedAmount,
            spent: envelope.spentAmount,
            color: envelope.color
        }));

        new Chart(ctx2d, {
            type: 'bar',
            data: {
                labels: chartData.map(item => item.category),
                datasets: [
                    {
                        label: 'Allocated',
                        data: chartData.map(item => item.allocated),
                        backgroundColor: chartData.map(item => item.color + '50'),
                        borderColor: chartData.map(item => item.color),
                        borderWidth: 1
                    },
                    {
                        label: 'Spent',
                        data: chartData.map(item => item.spent),
                        backgroundColor: chartData.map(item => item.color),
                        borderColor: chartData.map(item => item.color),
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

    setupEventListeners() {
        // Create envelope button
        const createBtn = document.getElementById('create-envelope-btn');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                this.openEnvelopeModal();
            });
        }

        // Modal controls
        const modalClose = document.getElementById('envelope-modal-close');
        if (modalClose) {
            modalClose.addEventListener('click', () => {
                this.closeEnvelopeModal();
            });
        }

        const cancelBtn = document.getElementById('envelope-cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.closeEnvelopeModal();
            });
        }

        // Envelope form
        const envelopeForm = document.getElementById('envelope-form');
        if (envelopeForm) {
            envelopeForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveEnvelope();
            });
        }

        // Filter
        const envelopeFilter = document.getElementById('envelope-filter');
        if (envelopeFilter) {
            envelopeFilter.addEventListener('change', () => {
                this.renderEnvelopes();
            });
        }

        // Transfer modal controls
        const transferClose = document.getElementById('transfer-modal-close');
        if (transferClose) {
            transferClose.addEventListener('click', () => {
                this.closeTransferModal();
            });
        }

        const transferForm = document.getElementById('transfer-form');
        if (transferForm) {
            transferForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.processTransfer();
            });
        }

        // Close modal when clicking outside
        const envelopeModal = document.getElementById('envelope-modal');
        if (envelopeModal) {
            envelopeModal.addEventListener('click', (e) => {
                if (e.target.id === 'envelope-modal') {
                    this.closeEnvelopeModal();
                }
            });
        }

        const transferModal = document.getElementById('transfer-modal');
        if (transferModal) {
            transferModal.addEventListener('click', (e) => {
                if (e.target.id === 'transfer-modal') {
                    this.closeTransferModal();
                }
            });
        }

        // Period filter
        const periodFilter = document.getElementById('period-filter');
        if (periodFilter) {
            periodFilter.addEventListener('change', (e) => {
                this.currentPeriod = e.target.value;
                this.loadEnvelopesByPeriod();
            });
        }

        // Reset envelopes button
        const resetBtn = document.getElementById('reset-envelopes-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetAllEnvelopes();
            });
        }
    }

    openEnvelopeModal(envelopeId = null) {
        const modal = document.getElementById('envelope-modal');
        const form = document.getElementById('envelope-form');
        
        if (envelopeId) {
            const envelope = this.envelopes.find(e => e.id === envelopeId);
            if (envelope) {
                document.getElementById('envelope-modal-title').textContent = 'Edit Envelope';
                document.getElementById('envelope-id').value = envelope.id;
                document.getElementById('envelope-name').value = envelope.name;
                document.getElementById('envelope-category').value = envelope.category;
                document.getElementById('envelope-amount').value = envelope.allocatedAmount;
                document.getElementById('envelope-period').value = envelope.period;
                document.getElementById('envelope-color').value = envelope.color;
                document.getElementById('envelope-icon').value = envelope.icon;
                document.getElementById('envelope-alert').value = envelope.alertThreshold;
                document.getElementById('envelope-notes').value = envelope.notes || '';
            }
        } else {
            document.getElementById('envelope-modal-title').textContent = 'Create Envelope';
            form.reset();
            document.getElementById('envelope-alert').value = 80;
            document.getElementById('envelope-color').value = '#64ffda';
            document.getElementById('envelope-icon').value = '💰';
        }
        
        modal.style.display = 'flex';
    }

    closeEnvelopeModal() {
        document.getElementById('envelope-modal').style.display = 'none';
    }

    saveEnvelope() {
        const envelopeData = {
            name: document.getElementById('envelope-name').value,
            category: document.getElementById('envelope-category').value,
            allocatedAmount: parseFloat(document.getElementById('envelope-amount').value),
            period: document.getElementById('envelope-period').value,
            color: document.getElementById('envelope-color').value,
            icon: document.getElementById('envelope-icon').value,
            alertThreshold: parseInt(document.getElementById('envelope-alert').value),
            notes: document.getElementById('envelope-notes').value
        };

        const envelopeId = document.getElementById('envelope-id').value;
        
        if (envelopeId) {
            // Edit existing envelope
            const envelopeIndex = this.envelopes.findIndex(e => e.id === envelopeId);
            if (envelopeIndex !== -1) {
                this.envelopes[envelopeIndex] = { ...this.envelopes[envelopeIndex], ...envelopeData };
            }
        } else {
            // Create new envelope
            const categoryNames = {
                'food': '🍽️ Food & Dining',
                'transport': '🚗 Transportation',
                'shopping': '🛒 Shopping',
                'entertainment': '🎬 Entertainment',
                'utilities': '💡 Bills & Utilities',
                'healthcare': '🏥 Healthcare',
                'education': '📚 Education',
                'travel': '✈️ Travel',
                'other': '📋 Other',
                'general': '💰 General'
            };

            const newEnvelope = {
                id: Date.now().toString(),
                spentAmount: 0,
                rolledOverAmount: 0,
                startDate: new Date(),
                endDate: new Date(new Date().setDate(new Date().getDate() + 30)),
                ...envelopeData,
                name: envelopeData.name || categoryNames[envelopeData.category] || envelopeData.category
            };
            
            this.envelopes.push(newEnvelope);
        }

        this.calculateSummary();
        this.updateSummaryCards();
        this.renderEnvelopes();
        this.closeEnvelopeModal();
        
        this.showNotification('Envelope saved successfully!', 'success');
    }

    editEnvelope(envelopeId) {
        this.openEnvelopeModal(envelopeId);
    }

    deleteEnvelope(envelopeId) {
        if (confirm('Are you sure you want to delete this envelope?')) {
            this.envelopes = this.envelopes.filter(e => e.id !== envelopeId);
            this.calculateSummary();
            this.updateSummaryCards();
            this.renderEnvelopes();
            this.showNotification('Envelope deleted successfully!', 'success');
        }
    }

    allocateToEnvelope(envelopeId) {
        const amount = prompt('Enter amount to allocate:');
        if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
            const envelope = this.envelopes.find(e => e.id === envelopeId);
            if (envelope) {
                envelope.allocatedAmount += parseFloat(amount);
                this.calculateSummary();
                this.updateSummaryCards();
                this.renderEnvelopes();
                this.showNotification(`$${parseFloat(amount).toFixed(2)} allocated to ${envelope.name}`, 'success');
            }
        }
    }

    quickSpend(envelopeId) {
        const amount = prompt('Enter amount to spend:');
        if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
            const envelope = this.envelopes.find(e => e.id === envelopeId);
            if (envelope) {
                envelope.spentAmount += parseFloat(amount);
                this.calculateSummary();
                this.updateSummaryCards();
                this.renderEnvelopes();
                this.showNotification(`$${parseFloat(amount).toFixed(2)} spent from ${envelope.name}`, 'success');
            }
        }
    }

    quickAllocate(envelopeId) {
        this.allocateToEnvelope(envelopeId);
    }

    openTransferModal(fromEnvelopeId) {
        const modal = document.getElementById('transfer-modal');
        document.getElementById('from-envelope').value = fromEnvelopeId;
        
        // Populate to-envelope dropdown
        const toEnvelopeSelect = document.getElementById('to-envelope');
        toEnvelopeSelect.innerHTML = this.envelopes
            .filter(e => e.id !== fromEnvelopeId)
            .map(e => `<option value="${e.id}">${e.name}</option>`)
            .join('');
        
        modal.style.display = 'flex';
    }

    closeTransferModal() {
        document.getElementById('transfer-modal').style.display = 'none';
    }

    processTransfer() {
        const fromEnvelopeId = document.getElementById('from-envelope').value;
        const toEnvelopeId = document.getElementById('to-envelope').value;
        const amount = parseFloat(document.getElementById('transfer-amount').value);

        if (!fromEnvelopeId || !toEnvelopeId || !amount || amount <= 0) {
            this.showNotification('Please fill all fields correctly', 'error');
            return;
        }

        const fromEnvelope = this.envelopes.find(e => e.id === fromEnvelopeId);
        const toEnvelope = this.envelopes.find(e => e.id === toEnvelopeId);

        if (!fromEnvelope || !toEnvelope) {
            this.showNotification('Invalid envelopes selected', 'error');
            return;
        }

        const fromAvailable = fromEnvelope.allocatedAmount + fromEnvelope.rolledOverAmount - fromEnvelope.spentAmount;
        
        if (amount > fromAvailable) {
            this.showNotification('Insufficient funds in source envelope', 'error');
            return;
        }

        fromEnvelope.allocatedAmount -= amount;
        toEnvelope.allocatedAmount += amount;

        this.calculateSummary();
        this.updateSummaryCards();
        this.renderEnvelopes();
        this.closeTransferModal();
        
        this.showNotification(`$${amount.toFixed(2)} transferred from ${fromEnvelope.name} to ${toEnvelope.name}`, 'success');
    }

    resetAllEnvelopes() {
        if (confirm('Are you sure you want to reset all envelopes? This will roll over unused funds and reset spending.')) {
            this.envelopes.forEach(envelope => {
                const remaining = envelope.allocatedAmount + envelope.rolledOverAmount - envelope.spentAmount;
                envelope.rolledOverAmount = remaining > 0 ? remaining : 0;
                envelope.spentAmount = 0;
            });

            this.calculateSummary();
            this.updateSummaryCards();
            this.renderEnvelopes();
            
            this.showNotification('All envelopes have been reset for the new period', 'success');
        }
    }

    loadEnvelopesByPeriod() {
        // In a real app, this would fetch from API
        this.renderEnvelopes();
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#43e97b' : type === 'error' ? '#ef5350' : '#64ffda'};
            color: #0f0f23;
            padding: 12px 20px;
            border-radius: 8px;
            font-weight: 600;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Initialize envelope manager when page loads
let envelopeManager;
document.addEventListener('DOMContentLoaded', () => {
    envelopeManager = new EnvelopeManager();
});
