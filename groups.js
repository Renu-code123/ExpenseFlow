// Groups Management System
class GroupManager {
  constructor() {
    this.currentGroupId = null;
    this.currentGroupData = null;
    this.groups = [];
    this.members = [];
    this.expenses = [];
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadGroups();
    this.setupNavigation();
  }

  setupEventListeners() {
    // Create group form
    const createGroupForm = document.getElementById('createGroupForm');
    if (createGroupForm) {
      createGroupForm.addEventListener('submit', (e) => this.handleCreateGroup(e));
    }

    // Add member form
    const addMemberForm = document.getElementById('addMemberForm');
    if (addMemberForm) {
      addMemberForm.addEventListener('submit', (e) => this.handleAddMember(e));
    }

    // Navigation toggle
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');
    if (navToggle) {
      navToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        navToggle.classList.toggle('active');
      });
    }

    // Close menu when link is clicked
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        navToggle?.classList.remove('active');
      });
    });
  }

  setupNavigation() {
    // Set active nav link
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
      if (link.href.includes('groups.html')) {
        link.classList.add('active');
      }
    });
  }

  async handleCreateGroup(e) {
    e.preventDefault();

    const groupName = document.getElementById('groupName').value.trim();
    const groupDescription = document.getElementById('groupDescription').value.trim();
    const groupCurrency = document.getElementById('groupCurrency').value;

    if (!groupName) {
      this.showNotification('Group name is required', 'error');
      return;
    }

    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          name: groupName,
          description: groupDescription,
          currency: groupCurrency
        })
      });

      if (!response.ok) throw new Error('Failed to create group');

      const newGroup = await response.json();
      this.showNotification('Group created successfully!', 'success');
      
      // Reset form
      document.getElementById('createGroupForm').reset();
      
      // Reload groups
      await this.loadGroups();
      
    } catch (error) {
      console.error('Error creating group:', error);
      this.showNotification('Failed to create group. Please try again.', 'error');
    }
  }

  async loadGroups() {
    try {
      const response = await fetch('/api/groups', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });

      if (!response.ok) throw new Error('Failed to load groups');

      this.groups = await response.json();
      this.renderGroupsList();

    } catch (error) {
      console.error('Error loading groups:', error);
      this.showNotification('Failed to load groups', 'error');
    }
  }

  renderGroupsList() {
    const groupsList = document.getElementById('groupsList');
    
    if (!this.groups || this.groups.length === 0) {
      groupsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <i class="fas fa-inbox"></i>
          </div>
          <div class="empty-state-title">No Groups Yet</div>
          <div class="empty-state-text">Create your first group to get started with group expense management</div>
        </div>
      `;
      return;
    }

    groupsList.innerHTML = this.groups.map(group => this.createGroupCardHTML(group)).join('');

    // Add event listeners to group cards
    this.groups.forEach(group => {
      const card = document.querySelector(`[data-group-id="${group._id}"]`);
      if (card) {
        card.addEventListener('click', (e) => {
          if (!e.target.closest('.group-actions')) {
            this.selectGroup(group._id);
          }
        });

        // Edit button
        const editBtn = card.querySelector('.btn-edit');
        if (editBtn) {
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.editGroup(group._id);
          });
        }

        // Delete button
        const deleteBtn = card.querySelector('.btn-delete');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openDeleteModal(group._id);
          });
        }
      }
    });
  }

  createGroupCardHTML(group) {
    const memberCount = group.members ? group.members.length : 0;
    const expenseCount = group.expenses ? group.expenses.length : 0;
    const totalExpenses = group.totalExpenses || 0;

    return `
      <div class="group-card" data-group-id="${group._id}">
        <div class="group-card-header">
          <h4>${this.escapeHtml(group.name)}</h4>
          <div class="group-actions">
            <button class="btn-icon btn-edit" title="Edit group">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon btn-delete" title="Delete group">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        ${group.description ? `<div class="group-description">${this.escapeHtml(group.description)}</div>` : ''}
        <div class="group-stats">
          <div class="stat-item">
            <div class="stat-label">Members</div>
            <div class="stat-value">${memberCount}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Expenses</div>
            <div class="stat-value">${expenseCount}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Total</div>
            <div class="stat-value">${group.currency} ${totalExpenses.toFixed(2)}</div>
          </div>
        </div>
        <div class="group-members">
          <i class="fas fa-users"></i>
          <span class="members-text">${memberCount} member${memberCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    `;
  }

  async selectGroup(groupId) {
    try {
      const response = await fetch(`/api/groups/${groupId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });

      if (!response.ok) throw new Error('Failed to load group details');

      this.currentGroupData = await response.json();
      this.currentGroupId = groupId;

      // Update UI
      this.updateGroupSelection();
      this.renderGroupDetails();
      this.renderMembers();
      this.renderGroupExpenses();

    } catch (error) {
      console.error('Error selecting group:', error);
      this.showNotification('Failed to load group details', 'error');
    }
  }

  updateGroupSelection() {
    document.querySelectorAll('.group-card').forEach(card => {
      card.classList.remove('active');
      if (card.dataset.groupId === this.currentGroupId) {
        card.classList.add('active');
        card.style.borderColor = 'rgba(100, 255, 218, 0.5)';
        card.style.backgroundColor = 'rgba(100, 255, 218, 0.1)';
      } else {
        card.style.borderColor = '';
        card.style.backgroundColor = '';
      }
    });

    // Show/hide sections
    document.getElementById('membersSection').style.display = 'block';
    document.getElementById('groupDetailsSection').style.display = 'block';
    document.getElementById('noGroupMessage').style.display = 'none';
  }

  renderGroupDetails() {
    const overview = document.getElementById('groupOverview');
    if (!overview || !this.currentGroupData) return;

    const memberCount = this.currentGroupData.members ? this.currentGroupData.members.length : 0;
    const expenseCount = this.currentGroupData.expenses ? this.currentGroupData.expenses.length : 0;
    const totalExpenses = this.currentGroupData.totalExpenses || 0;

    overview.innerHTML = `
      <div class="overview-card">
        <div class="overview-card-icon">
          <i class="fas fa-users"></i>
        </div>
        <div class="overview-card-label">Total Members</div>
        <div class="overview-card-value">${memberCount}</div>
        <div class="overview-card-detail">Group members</div>
      </div>
      <div class="overview-card">
        <div class="overview-card-icon">
          <i class="fas fa-receipt"></i>
        </div>
        <div class="overview-card-label">Total Expenses</div>
        <div class="overview-card-value">${expenseCount}</div>
        <div class="overview-card-detail">Tracked transactions</div>
      </div>
      <div class="overview-card">
        <div class="overview-card-icon">
          <i class="fas fa-money-bill-wave"></i>
        </div>
        <div class="overview-card-label">Total Amount</div>
        <div class="overview-card-value">${this.currentGroupData.currency} ${totalExpenses.toFixed(2)}</div>
        <div class="overview-card-detail">Sum of all expenses</div>
      </div>
      <div class="overview-card">
        <div class="overview-card-icon">
          <i class="fas fa-info-circle"></i>
        </div>
        <div class="overview-card-label">Currency</div>
        <div class="overview-card-value">${this.currentGroupData.currency}</div>
        <div class="overview-card-detail">Group currency</div>
      </div>
    `;
  }

  async renderMembers() {
    const membersList = document.getElementById('membersList');
    if (!membersList || !this.currentGroupData) return;

    const members = this.currentGroupData.members || [];

    if (members.length === 0) {
      membersList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <i class="fas fa-user-slash"></i>
          </div>
          <div class="empty-state-title">No Members</div>
          <div class="empty-state-text">Add members to your group to start collaborating</div>
        </div>
      `;
      return;
    }

    membersList.innerHTML = members.map(member => this.createMemberItemHTML(member)).join('');

    // Add remove member event listeners
    members.forEach(member => {
      const removeBtn = membersList.querySelector(`[data-member-id="${member.user._id}"] .btn-remove`);
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          this.removeMember(member.user._id);
        });
      }
    });
  }

  createMemberItemHTML(member) {
    const initials = member.user.name.split(' ').map(n => n[0]).join('').toUpperCase();
    const isAdmin = member.role === 'admin';

    return `
      <div class="member-item" data-member-id="${member.user._id}">
        <div class="member-info">
          <div class="member-avatar-large" style="background: ${isAdmin ? 'var(--primary-gradient)' : 'rgba(100, 255, 218, 0.2)'};">
            ${initials}
          </div>
          <div class="member-details">
            <div class="member-name">${this.escapeHtml(member.user.name)}</div>
            <div class="member-email">${this.escapeHtml(member.user.email)}</div>
          </div>
          <div class="member-role">${member.role}</div>
        </div>
        <div class="member-actions">
          <button class="btn-icon btn-remove" title="Remove member">
            <i class="fas fa-user-minus"></i>
          </button>
        </div>
      </div>
    `;
  }

  async handleAddMember(e) {
    e.preventDefault();

    const memberEmail = document.getElementById('memberEmail').value.trim();
    const memberRole = document.getElementById('memberRole').value;

    if (!memberEmail || !this.currentGroupId) {
      this.showNotification('Please enter a valid email', 'error');
      return;
    }

    try {
      const response = await fetch(`/api/groups/${this.currentGroupId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          email: memberEmail,
          role: memberRole
        })
      });

      if (!response.ok) throw new Error('Failed to add member');

      this.showNotification('Member added successfully!', 'success');
      document.getElementById('addMemberForm').reset();

      // Reload group data
      await this.selectGroup(this.currentGroupId);

    } catch (error) {
      console.error('Error adding member:', error);
      this.showNotification('Failed to add member. Please check the email.', 'error');
    }
  }

  async removeMember(userId) {
    if (!this.currentGroupId) return;

    if (!confirm('Are you sure you want to remove this member?')) return;

    try {
      const response = await fetch(`/api/groups/${this.currentGroupId}/members/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });

      if (!response.ok) throw new Error('Failed to remove member');

      this.showNotification('Member removed successfully!', 'success');
      await this.selectGroup(this.currentGroupId);

    } catch (error) {
      console.error('Error removing member:', error);
      this.showNotification('Failed to remove member', 'error');
    }
  }

  async renderGroupExpenses() {
    const expensesList = document.getElementById('expensesList');
    if (!expensesList || !this.currentGroupData) return;

    const expenses = this.currentGroupData.expenses || [];

    if (expenses.length === 0) {
      expensesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <i class="fas fa-receipt"></i>
          </div>
          <div class="empty-state-title">No Expenses</div>
          <div class="empty-state-text">Expenses added to this group will appear here</div>
        </div>
      `;
      return;
    }

    expensesList.innerHTML = expenses.map(expense => this.createExpenseItemHTML(expense)).join('');
  }

  createExpenseItemHTML(expense) {
    const expenseData = expense.expense || expense;
    const date = new Date(expense.addedAt || expenseData.createdAt);
    const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return `
      <div class="expense-item">
        <div class="expense-info">
          <div class="expense-name">${this.escapeHtml(expenseData.description || 'Expense')}</div>
          <div class="expense-details">
            ${expenseData.category ? `<span>${expenseData.category} • </span>` : ''}
            <span>${formattedDate}</span>
          </div>
        </div>
        <div class="expense-amount">
          ${this.currentGroupData.currency} ${(expenseData.amount || 0).toFixed(2)}
        </div>
      </div>
    `;
  }

  editGroup(groupId) {
    const group = this.groups.find(g => g._id === groupId);
    if (!group) return;

    document.getElementById('groupName').value = group.name;
    document.getElementById('groupDescription').value = group.description || '';
    document.getElementById('groupCurrency').value = group.currency;

    // Scroll to form
    document.querySelector('.groups-container').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('groupName').focus();
  }

  openDeleteModal(groupId) {
    this.deleteGroupId = groupId;
    const modal = document.getElementById('deleteModal');
    modal.classList.add('active');
  }

  async confirmDelete() {
    if (!this.deleteGroupId) return;

    try {
      const response = await fetch(`/api/groups/${this.deleteGroupId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });

      if (!response.ok) throw new Error('Failed to delete group');

      this.showNotification('Group deleted successfully!', 'success');
      this.closeModal('deleteModal');
      this.deleteGroupId = null;
      this.currentGroupId = null;
      this.currentGroupData = null;

      // Reset UI
      document.getElementById('membersSection').style.display = 'none';
      document.getElementById('groupDetailsSection').style.display = 'none';
      document.getElementById('noGroupMessage').style.display = 'block';

      // Reload groups
      await this.loadGroups();

    } catch (error) {
      console.error('Error deleting group:', error);
      this.showNotification('Failed to delete group', 'error');
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('active');
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      background: ${type === 'success' ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' : type === 'error' ? 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'};
      color: ${type === 'success' || type === 'error' ? 'white' : 'white'};
      padding: 1rem 1.5rem;
      border-radius: 10px;
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
      z-index: 10001;
      animation: slideInRight 0.3s ease-out;
      max-width: 400px;
      font-weight: 500;
      backdrop-filter: blur(10px);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

// Add animation styles for notifications
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes slideOutRight {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }
`;
document.head.appendChild(style);

// Export functions for inline onclick handlers
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

function confirmDelete() {
  if (window.groupManager) {
    window.groupManager.confirmDelete();
  }
}

// Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.groupManager = new GroupManager();
  });
} else {
  window.groupManager = new GroupManager();
}
