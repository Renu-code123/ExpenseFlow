if (!localStorage.getItem('token')) {
    window.location.replace('/login.html');
}

// Transactions Page JavaScript
class TransactionsManager {
    constructor() {
        this.transactions = [];
        this.filteredTransactions = [];
        this.selectedTransactions = new Set();
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.sortField = 'date';
        this.sortDirection = 'desc';
        this.editingTransaction = null;
        
        this.init();
    }

    init() {
        this.loadTransactions();
        this.bindEvents();
        this.setDefaultDate();
    }

    // Mock data generation
    generateMockTransactions() {
        const categories = {
            food: { name: 'Food & Dining', icon: '🍔' },
            transport: { name: 'Transportation', icon: '🚗' },
            shopping: { name: 'Shopping', icon: '🛒' },
            entertainment: { name: 'Entertainment', icon: '🎬' },
            utilities: { name: 'Bills & Utilities', icon: '⚡' },
            healthcare: { name: 'Healthcare', icon: '💊' },
            salary: { name: 'Salary', icon: '💰' },
            other: { name: 'Other', icon: '📝' }
        };

        const merchants = ['Amazon', 'Swiggy', 'Uber', 'Zomato', 'Netflix', 'Spotify', 'Grocery Store', 'Gas Station'];
        const descriptions = {
            food: ['Lunch at restaurant', 'Coffee shop', 'Grocery shopping', 'Food delivery'],
            transport: ['Uber ride', 'Bus ticket', 'Fuel', 'Parking fee'],
            shopping: ['Online shopping', 'Clothing', 'Electronics', 'Books'],
            entertainment: ['Movie tickets', 'Concert', 'Gaming', 'Streaming subscription'],
            utilities: ['Electricity bill', 'Internet bill', 'Phone bill', 'Water bill'],
            healthcare: ['Doctor visit', 'Medicines', 'Health checkup', 'Dental care'],
            salary: ['Monthly salary', 'Bonus', 'Freelance work', 'Investment return'],
            other: ['Miscellaneous', 'Gift', 'Donation', 'Other expense']
        };

        const transactions = [];
        const today = new Date();

        for (let i = 0; i < 50; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - Math.floor(Math.random() * 90));
            
            const isIncome = Math.random() < 0.2;
            const type = isIncome ? 'income' : 'expense';
            const categoryKeys = Object.keys(categories);
            const category = isIncome ? 'salary' : categoryKeys[Math.floor(Math.random() * (categoryKeys.length - 1))];
            
            const amount = isIncome 
                ? Math.floor(Math.random() * 50000) + 20000
                : Math.floor(Math.random() * 5000) + 100;

            transactions.push({
                id: `txn_${Date.now()}_${i}`,
                date: date.toISOString().split('T')[0],
                description: descriptions[category][Math.floor(Math.random() * descriptions[category].length)],
                category: category,
                amount: amount,
                type: type,
                merchant: merchants[Math.floor(Math.random() * merchants.length)],
                notes: Math.random() < 0.3 ? 'Additional notes for this transaction' : '',
                createdAt: date.toISOString()
            });
        }

        return transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    async loadTransactions() {
    try {
        const response = await fetch('/api/expenses', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 401) {
            // Token invalid or missing → logout
            localStorage.clear();
            window.location.replace('/login.html');
            return;
        }

        if (!response.ok) {
            throw new Error('API error');
        }

        this.transactions = await response.json();
    } catch (error) {
        console.error('Failed to load transactions:', error);
        this.showNotification('Unable to load transactions', 'error');
    }

    this.applyFilters();
    this.hideLoading();
}


    hideLoading() {
        document.getElementById('loadingState').style.display = 'none';
    }

    bindEvents() {
        // Search input
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchTransactions(e.target.value);
        });

        // Filter selects
        ['typeFilter', 'categoryFilter', 'dateFilter', 'amountFilter'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => {
                this.applyFilters();
            });
        });

        // Form submission
        document.getElementById('transactionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTransaction();
        });

        // Modal close events
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal();
                this.closeDetailsModal();
                this.closeBulkCategorizeModal();
            }
        });
    }

    setDefaultDate() {
        document.getElementById('transactionDate').value = new Date().toISOString().split('T')[0];
    }

    searchTransactions(query) {
        if (!query.trim()) {
            this.applyFilters();
            return;
        }

        const searchTerm = query.toLowerCase();
        this.filteredTransactions = this.transactions.filter(transaction => 
            transaction.description.toLowerCase().includes(searchTerm) ||
            transaction.merchant.toLowerCase().includes(searchTerm) ||
            transaction.category.toLowerCase().includes(searchTerm)
        );
        
        this.currentPage = 1;
        this.renderTransactions();
        this.renderPagination();
    }

    applyFilters() {
        let filtered = [...this.transactions];

        // Type filter
        const typeFilter = document.getElementById('typeFilter').value;
        if (typeFilter) {
            filtered = filtered.filter(t => t.type === typeFilter);
        }

        // Category filter
        const categoryFilter = document.getElementById('categoryFilter').value;
        if (categoryFilter) {
            filtered = filtered.filter(t => t.category === categoryFilter);
        }

        // Date filter
        const dateFilter = document.getElementById('dateFilter').value;
        if (dateFilter && dateFilter !== 'custom') {
            const today = new Date();
            let startDate;

            switch (dateFilter) {
                case 'today':
                    startDate = new Date(today);
                    break;
                case 'week':
                    startDate = new Date(today);
                    startDate.setDate(today.getDate() - 7);
                    break;
                case 'month':
                    startDate = new Date(today);
                    startDate.setMonth(today.getMonth() - 1);
                    break;
                case 'quarter':
                    startDate = new Date(today);
                    startDate.setMonth(today.getMonth() - 3);
                    break;
                case 'year':
                    startDate = new Date(today);
                    startDate.setFullYear(today.getFullYear() - 1);
                    break;
            }

            if (startDate) {
                filtered = filtered.filter(t => new Date(t.date) >= startDate);
            }
        }

        // Amount filter
        const amountFilter = document.getElementById('amountFilter').value;
        if (amountFilter) {
            const [min, max] = amountFilter.split('-').map(v => v.replace('+', ''));
            filtered = filtered.filter(t => {
                if (max) {
                    return t.amount >= parseInt(min) && t.amount <= parseInt(max);
                } else {
                    return t.amount >= parseInt(min);
                }
            });
        }

        this.filteredTransactions = filtered;
        this.currentPage = 1;
        this.renderTransactions();
        this.renderPagination();
    }

    sortTable(field) {
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDirection = 'asc';
        }

        this.filteredTransactions.sort((a, b) => {
            let aVal = a[field];
            let bVal = b[field];

            if (field === 'date') {
                aVal = new Date(aVal);
                bVal = new Date(bVal);
            } else if (field === 'amount') {
                aVal = parseFloat(aVal);
                bVal = parseFloat(bVal);
            } else {
                aVal = aVal.toString().toLowerCase();
                bVal = bVal.toString().toLowerCase();
            }

            if (this.sortDirection === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });

        this.renderTransactions();
    }

    renderTransactions() {
        const tbody = document.getElementById('transactionsTableBody');
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageTransactions = this.filteredTransactions.slice(startIndex, endIndex);

        if (pageTransactions.length === 0) {
            document.getElementById('emptyState').style.display = 'block';
            tbody.innerHTML = '';
            return;
        }

        document.getElementById('emptyState').style.display = 'none';

        tbody.innerHTML = pageTransactions.map(transaction => `
            <tr class="transaction-row ${this.selectedTransactions.has(transaction.id) ? 'selected' : ''}" 
                data-id="${transaction.id}">
                <td>
                    <input type="checkbox" 
                           ${this.selectedTransactions.has(transaction.id) ? 'checked' : ''}
                           onchange="transactionsManager.toggleSelection('${transaction.id}')">
                </td>
                <td>${new Date(transaction.date).toLocaleDateString()}</td>
                <td>
                    <div style="cursor: pointer;" onclick="transactionsManager.showDetails('${transaction.id}')">
                        <strong>${transaction.description}</strong>
                        <br><small style="color: #a0a0a0;">${transaction.merchant}</small>
                    </div>
                </td>
                <td>
                    <span class="category-badge">
                        ${this.getCategoryIcon(transaction.category)} ${this.getCategoryName(transaction.category)}
                    </span>
                </td>
                <td>
                    <span class="amount ${transaction.type}">
                        ${transaction.type === 'income' ? '+' : '-'}₹${transaction.amount.toLocaleString()}
                    </span>
                </td>
                <td>
                    <span class="type-badge ${transaction.type}">${transaction.type}</span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn edit" onclick="transactionsManager.editTransaction('${transaction.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn delete" onclick="transactionsManager.deleteTransaction('${transaction.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    renderPagination() {
        const totalPages = Math.ceil(this.filteredTransactions.length / this.itemsPerPage);
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = Math.min(startIndex + this.itemsPerPage, this.filteredTransactions.length);

        // Update pagination info
        document.getElementById('paginationInfo').textContent = 
            `Showing ${startIndex + 1}-${endIndex} of ${this.filteredTransactions.length} transactions`;

        // Update page buttons
        document.getElementById('prevBtn').disabled = this.currentPage === 1;
        document.getElementById('nextBtn').disabled = this.currentPage === totalPages;

        // Generate page numbers
        const pageNumbers = document.getElementById('pageNumbers');
        pageNumbers.innerHTML = '';

        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `page-number ${i === this.currentPage ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.onclick = () => this.goToPage(i);
            pageNumbers.appendChild(pageBtn);
        }
    }

    goToPage(page) {
        this.currentPage = page;
        this.renderTransactions();
        this.renderPagination();
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.goToPage(this.currentPage - 1);
        }
    }

    nextPage() {
        const totalPages = Math.ceil(this.filteredTransactions.length / this.itemsPerPage);
        if (this.currentPage < totalPages) {
            this.goToPage(this.currentPage + 1);
        }
    }

    toggleSelection(transactionId) {
        if (this.selectedTransactions.has(transactionId)) {
            this.selectedTransactions.delete(transactionId);
        } else {
            this.selectedTransactions.add(transactionId);
        }
        
        this.updateBulkActions();
        this.renderTransactions();
    }

    toggleSelectAll() {
        const selectAllCheckbox = document.getElementById('selectAll');
        const pageTransactions = this.getPageTransactions();
        
        if (selectAllCheckbox.checked) {
            pageTransactions.forEach(t => this.selectedTransactions.add(t.id));
        } else {
            pageTransactions.forEach(t => this.selectedTransactions.delete(t.id));
        }
        
        this.updateBulkActions();
        this.renderTransactions();
    }

    getPageTransactions() {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        return this.filteredTransactions.slice(startIndex, endIndex);
    }

    updateBulkActions() {
        const bulkActions = document.getElementById('bulkActions');
        const selectedCount = this.selectedTransactions.size;
        
        if (selectedCount > 0) {
            bulkActions.style.display = 'block';
            bulkActions.querySelector('.selected-count').textContent = 
                `${selectedCount} transaction${selectedCount > 1 ? 's' : ''} selected`;
        } else {
            bulkActions.style.display = 'none';
        }
    }

    getCategoryIcon(category) {
        const icons = {
            food: '🍔', transport: '🚗', shopping: '🛒', entertainment: '🎬',
            utilities: '⚡', healthcare: '💊', salary: '💰', other: '📝'
        };
        return icons[category] || '📝';
    }

    getCategoryName(category) {
        const names = {
            food: 'Food & Dining', transport: 'Transportation', shopping: 'Shopping',
            entertainment: 'Entertainment', utilities: 'Bills & Utilities', 
            healthcare: 'Healthcare', salary: 'Salary', other: 'Other'
        };
        return names[category] || 'Other';
    }

    // Modal functions
    openAddModal() {
        document.getElementById('modalTitle').textContent = 'Add Transaction';
        document.getElementById('transactionForm').reset();
        this.setDefaultDate();
        this.editingTransaction = null;
        document.getElementById('transactionModal').style.display = 'block';
    }

    editTransaction(transactionId) {
        const transaction = this.transactions.find(t => t.id === transactionId);
        if (!transaction) return;

        document.getElementById('modalTitle').textContent = 'Edit Transaction';
        document.getElementById('transactionType').value = transaction.type;
        document.getElementById('transactionAmount').value = transaction.amount;
        document.getElementById('transactionDescription').value = transaction.description;
        document.getElementById('transactionCategory').value = transaction.category;
        document.getElementById('transactionDate').value = transaction.date;
        document.getElementById('transactionNotes').value = transaction.notes || '';
        
        this.editingTransaction = transaction;
        document.getElementById('transactionModal').style.display = 'block';
    }

    closeModal() {
        document.getElementById('transactionModal').style.display = 'none';
        this.editingTransaction = null;
    }

    async saveTransaction() {
        const formData = {
            type: document.getElementById('transactionType').value,
            amount: parseFloat(document.getElementById('transactionAmount').value),
            description: document.getElementById('transactionDescription').value,
            category: document.getElementById('transactionCategory').value,
            date: document.getElementById('transactionDate').value,
            notes: document.getElementById('transactionNotes').value
        };

        try {
            if (this.editingTransaction) {
                // Update existing transaction
                const index = this.transactions.findIndex(t => t.id === this.editingTransaction.id);
                if (index !== -1) {
                    this.transactions[index] = { ...this.editingTransaction, ...formData };
                }
                this.showNotification('Transaction updated successfully!', 'success');
            } else {
                // Add new transaction
                const newTransaction = {
                    id: `txn_${Date.now()}`,
                    ...formData,
                    merchant: 'Manual Entry',
                    createdAt: new Date().toISOString()
                };
                this.transactions.unshift(newTransaction);
                this.showNotification('Transaction added successfully!', 'success');
            }

            this.applyFilters();
            this.closeModal();
        } catch (error) {
            this.showNotification('Error saving transaction', 'error');
        }
    }

    async deleteTransaction(transactionId) {
        if (!confirm('Are you sure you want to delete this transaction?')) return;

        try {
            this.transactions = this.transactions.filter(t => t.id !== transactionId);
            this.selectedTransactions.delete(transactionId);
            this.applyFilters();
            this.updateBulkActions();
            this.showNotification('Transaction deleted successfully!', 'success');
        } catch (error) {
            this.showNotification('Error deleting transaction', 'error');
        }
    }

    showDetails(transactionId) {
        const transaction = this.transactions.find(t => t.id === transactionId);
        if (!transaction) return;

        const detailsHtml = `
            <div class="detail-row">
                <span class="detail-label">Description:</span>
                <span class="detail-value">${transaction.description}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Amount:</span>
                <span class="detail-value amount ${transaction.type}">
                    ${transaction.type === 'income' ? '+' : '-'}₹${transaction.amount.toLocaleString()}
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Category:</span>
                <span class="detail-value">
                    ${this.getCategoryIcon(transaction.category)} ${this.getCategoryName(transaction.category)}
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Date:</span>
                <span class="detail-value">${new Date(transaction.date).toLocaleDateString()}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Merchant:</span>
                <span class="detail-value">${transaction.merchant}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Type:</span>
                <span class="detail-value">
                    <span class="type-badge ${transaction.type}">${transaction.type}</span>
                </span>
            </div>
            ${transaction.notes ? `
                <div class="detail-row">
                    <span class="detail-label">Notes:</span>
                    <span class="detail-value">${transaction.notes}</span>
                </div>
            ` : ''}
        `;

        document.getElementById('transactionDetails').innerHTML = detailsHtml;
        document.getElementById('detailsModal').style.display = 'block';
    }

    closeDetailsModal() {
        document.getElementById('detailsModal').style.display = 'none';
    }

    // Bulk operations
    bulkDelete() {
        if (this.selectedTransactions.size === 0) return;
        
        if (!confirm(`Are you sure you want to delete ${this.selectedTransactions.size} transactions?`)) return;

        this.transactions = this.transactions.filter(t => !this.selectedTransactions.has(t.id));
        this.selectedTransactions.clear();
        this.applyFilters();
        this.updateBulkActions();
        this.showNotification('Selected transactions deleted successfully!', 'success');
    }

    bulkCategorize() {
        if (this.selectedTransactions.size === 0) return;
        document.getElementById('bulkCategorizeModal').style.display = 'block';
    }

    closeBulkCategorizeModal() {
        document.getElementById('bulkCategorizeModal').style.display = 'none';
    }

    applyBulkCategorize() {
        const newCategory = document.getElementById('bulkCategory').value;
        
        this.transactions.forEach(transaction => {
            if (this.selectedTransactions.has(transaction.id)) {
                transaction.category = newCategory;
            }
        });

        this.selectedTransactions.clear();
        this.applyFilters();
        this.updateBulkActions();
        this.closeBulkCategorizeModal();
        this.showNotification('Categories updated successfully!', 'success');
    }

    bulkExport() {
        if (this.selectedTransactions.size === 0) return;
        
        const selectedData = this.transactions.filter(t => this.selectedTransactions.has(t.id));
        this.exportData(selectedData, 'selected_transactions.csv');
    }

    clearFilters() {
        document.getElementById('searchInput').value = '';
        document.getElementById('typeFilter').value = '';
        document.getElementById('categoryFilter').value = '';
        document.getElementById('dateFilter').value = '';
        document.getElementById('amountFilter').value = '';
        this.applyFilters();
    }

    exportData(data, filename) {
        const csv = this.convertToCSV(data);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
        this.showNotification('Data exported successfully!', 'success');
    }

    convertToCSV(data) {
        const headers = ['Date', 'Description', 'Category', 'Amount', 'Type', 'Merchant', 'Notes'];
        const rows = data.map(t => [
            t.date,
            t.description,
            this.getCategoryName(t.category),
            t.amount,
            t.type,
            t.merchant,
            t.notes || ''
        ]);
        
        return [headers, ...rows].map(row => 
            row.map(field => `"${field}"`).join(',')
        ).join('\n');
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
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Global functions for HTML onclick events
function openAddModal() {
    transactionsManager.openAddModal();
}

function exportTransactions() {
    transactionsManager.exportData(transactionsManager.filteredTransactions, 'transactions.csv');
}

function clearFilters() {
    transactionsManager.clearFilters();
}

function toggleSelectAll() {
    transactionsManager.toggleSelectAll();
}

function sortTable(field) {
    transactionsManager.sortTable(field);
}

function previousPage() {
    transactionsManager.previousPage();
}

function nextPage() {
    transactionsManager.nextPage();
}

function bulkDelete() {
    transactionsManager.bulkDelete();
}

function bulkCategorize() {
    transactionsManager.bulkCategorize();
}

function bulkExport() {
    transactionsManager.bulkExport();
}

function closeBulkCategorizeModal() {
    transactionsManager.closeBulkCategorizeModal();
}

function applyBulkCategorize() {
    transactionsManager.applyBulkCategorize();
}

function closeModal() {
    transactionsManager.closeModal();
}

function closeDetailsModal() {
    transactionsManager.closeDetailsModal();
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.transactionsManager = new TransactionsManager();
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