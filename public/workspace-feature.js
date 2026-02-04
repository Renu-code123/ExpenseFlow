// Helper to get auth token
function getAuthToken() {
  return localStorage.getItem('token');
}
// Workspace and Settings Management
let currentWorkspace = null;
let currentUser = null;

// Initialize workspace features
document.addEventListener('DOMContentLoaded', function() {
  initializeWorkspaceFeatures();
  loadCurrentUser();
  loadWorkspaceData();
});

function initializeWorkspaceFeatures() {
  // Settings tab switching
  window.switchSettingsTab = switchSettingsTab;

  // Workspace functions
  window.switchWorkspace = switchWorkspace;
  window.openCreateWorkspaceModal = openCreateWorkspaceModal;
  window.openInviteModal = openInviteModal;

  // Approval functions
  window.saveApprovalSettings = saveApprovalSettings;

  // Profile functions
  window.updateProfile = updateProfile;

  // Form handlers
  setupWorkspaceFormHandlers();
}

function setupWorkspaceFormHandlers() {
  // Create workspace form
  const createForm = document.getElementById('create-workspace-form');
  if (createForm) {
    createForm.addEventListener('submit', handleCreateWorkspace);
  }

  // Invite member form
  const inviteForm = document.getElementById('invite-form');
  if (inviteForm) {
    inviteForm.addEventListener('submit', handleInviteMember);
  }
}

async function loadCurrentUser() {
  try {
    const token = getAuthToken();
    if (!token) return;

    const response = await fetch('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (data.success) {
      currentUser = data.user;
      updateUserDisplay();
    }
  } catch (error) {
    console.error('Error loading user:', error);
  }
}

function updateUserDisplay() {
  if (!currentUser) return;

  const usernameEl = document.getElementById('navUsername');
  if (usernameEl) {
    usernameEl.textContent = currentUser.name || currentUser.email;
  }

  // Update profile settings
  const profileName = document.getElementById('profile-name');
  const profileEmail = document.getElementById('profile-email');

  if (profileName) profileName.value = currentUser.name || '';
  if (profileEmail) profileEmail.value = currentUser.email || '';
}

async function loadWorkspaceData() {
  try {
    const token = getAuthToken();
    if (!token) return;

    // Load current workspace
    const workspaceResponse = await fetch('/api/workspaces/current', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const workspaceData = await workspaceResponse.json();
    if (workspaceData.success) {
      currentWorkspace = workspaceData.workspace;
      updateWorkspaceDisplay();
      loadMembers();
    }

    // Load approval settings
    loadApprovalSettings();

    // Load pending approvals
    loadPendingApprovals();

    // Load approval history
    loadApprovalHistory();

  } catch (error) {
    console.error('Error loading workspace data:', error);
  }
}

function updateWorkspaceDisplay() {
  if (!currentWorkspace) return;

  const workspaceNameEl = document.getElementById('current-workspace-name');
  if (workspaceNameEl) {
    workspaceNameEl.textContent = currentWorkspace.name;
  }
}

async function loadMembers() {
  try {
    const token = getAuthToken();
    if (!token || !currentWorkspace) return;

    const response = await fetch(`/api/workspaces/${currentWorkspace._id}/members`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (data.success) {
      renderMembersList(data.members);
    }
  } catch (error) {
    console.error('Error loading members:', error);
  }
}

function renderMembersList(members) {
  const membersList = document.getElementById('members-list');
  if (!membersList) return;

  membersList.innerHTML = '';

  members.forEach(member => {
    const memberItem = document.createElement('div');
    memberItem.className = 'member-item';

    memberItem.innerHTML = `
      <div class="member-info">
        <div class="member-avatar">
          ${member.name ? member.name.charAt(0).toUpperCase() : member.email.charAt(0).toUpperCase()}
        </div>
        <div class="member-details">
          <h5>${member.name || member.email}</h5>
          <span class="member-role">${member.role}</span>
        </div>
      </div>
      <div class="member-actions">
        ${canManageMember(member) ? `
          <select class="btn-role" onchange="changeMemberRole('${member._id}', this.value)">
            <option value="viewer" ${member.role === 'viewer' ? 'selected' : ''}>Viewer</option>
            <option value="member" ${member.role === 'member' ? 'selected' : ''}>Member</option>
            <option value="manager" ${member.role === 'manager' ? 'selected' : ''}>Manager</option>
            <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
          ${member._id !== currentUser._id ? `
            <button class="btn-remove" onclick="removeMember('${member._id}')">
              <i class="fas fa-user-minus"></i>
            </button>
          ` : ''}
        ` : ''}
      </div>
    `;

    membersList.appendChild(memberItem);
  });
}

function canManageMember(member) {
  if (!currentUser || !currentWorkspace) return false;

  // Owner can manage everyone
  if (currentWorkspace.owner.toString() === currentUser._id.toString()) {
    return true;
  }

  // Admins can manage members and viewers
  if (currentUser.role === 'admin' && ['member', 'viewer'].includes(member.role)) {
    return true;
  }

  return false;
}

async function changeMemberRole(memberId, newRole) {
  try {
    const token = getAuthToken();
    if (!token || !currentWorkspace) return;

    const response = await fetch(`/api/workspaces/${currentWorkspace._id}/members/${memberId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: newRole })
    });

    const data = await response.json();
    if (data.success) {
      loadMembers(); // Reload members list
      showNotification('Member role updated successfully', 'success');
    } else {
      showNotification(data.message || 'Failed to update member role', 'error');
    }
  } catch (error) {
    console.error('Error updating member role:', error);
    showNotification('Error updating member role', 'error');
  }
}

async function removeMember(memberId) {
  if (!confirm('Are you sure you want to remove this member from the workspace?')) {
    return;
  }

  try {
    const token = getAuthToken();
    if (!token || !currentWorkspace) return;

    const response = await fetch(`/api/workspaces/${currentWorkspace._id}/members/${memberId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (data.success) {
      loadMembers(); // Reload members list
      showNotification('Member removed successfully', 'success');
    } else {
      showNotification(data.message || 'Failed to remove member', 'error');
    }
  } catch (error) {
    console.error('Error removing member:', error);
    showNotification('Error removing member', 'error');
  }
}

function switchSettingsTab(tabName) {
  // Hide all settings content
  const contents = document.querySelectorAll('.settings-content');
  contents.forEach(content => content.classList.remove('active'));

  // Remove active class from all tabs
  const tabs = document.querySelectorAll('.settings-tab');
  tabs.forEach(tab => tab.classList.remove('active'));

  // Show selected content and activate tab
  const selectedContent = document.getElementById(`${tabName}-settings`);
  const selectedTab = Array.from(tabs).find(tab => tab.textContent.toLowerCase() === tabName);

  if (selectedContent) selectedContent.classList.add('active');
  if (selectedTab) selectedTab.classList.add('active');
}

async function switchWorkspace(workspaceId) {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    // If workspaceId is null, switch to personal account
    if (!workspaceId) {
      localStorage.removeItem('activeWorkspaceId');
      currentWorkspace = null;
      updateWorkspaceDisplay();
      showNotification('Switched to personal account', 'success');
      // Reload dashboard data
      if (typeof loadExpenses === 'function') loadExpenses();
      if (typeof loadBudgets === 'function') loadBudgets();
      return;
    }

    // Switch to workspace
    const response = await fetch(`/api/workspaces/${workspaceId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (data.success) {
      currentWorkspace = data.workspace;
      localStorage.setItem('activeWorkspaceId', workspaceId);
      updateWorkspaceDisplay();
      loadMembers();
      showNotification(`Switched to workspace: ${currentWorkspace.name}`, 'success');

      // Reload dashboard data with workspace context
      if (typeof loadExpenses === 'function') loadExpenses();
      if (typeof loadBudgets === 'function') loadBudgets();
      if (typeof loadGoals === 'function') loadGoals();
    } else {
      showNotification(data.message || 'Failed to switch workspace', 'error');
    }
  } catch (error) {
    console.error('Error switching workspace:', error);
    showNotification('Error switching workspace', 'error');
  }
}

function openCreateWorkspaceModal() {
  const modal = document.getElementById('workspace-modal');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
    document.getElementById('create-workspace-form').reset();
  }
}

function openInviteModal() {
  const modal = document.getElementById('invite-modal');
  if (!modal) {
    console.error('Invite modal not found');
    return;
  }

  if (!currentWorkspace) {
    showNotification('Please select a workspace first', 'error');
    return;
  }

  // Reset form
  const form = document.getElementById('invite-form');
  if (form) form.reset();
  
  // Clear role permissions display
  const permissionsDisplay = document.getElementById('role-permissions-display');
  if (permissionsDisplay) {
    permissionsDisplay.innerHTML = '<p>Select a role to see permissions</p>';
  }

  // Show modal
  modal.style.display = 'flex';
  modal.classList.add('active');

  // Set up role change listener
  const roleSelect = document.getElementById('invite-role');
  if (roleSelect) {
    roleSelect.addEventListener('change', updateRolePermissions);
  }

  // Set up form submit handler
  if (form) {
    form.onsubmit = handleInviteSubmit;
  }
}

function closeInviteModal() {
  const modal = document.getElementById('invite-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}

function updateRolePermissions(event) {
  const role = event.target.value;
  const permissionsDisplay = document.getElementById('role-permissions-display');
  
  if (!permissionsDisplay) return;

  const rolePermissions = {
    viewer: [
      '✓ View expenses and income',
      '✓ View reports and analytics',
      '✓ View budget information',
      '✗ Cannot add or edit expenses',
      '✗ Cannot manage members'
    ],
    member: [
      '✓ View all expenses and income',
      '✓ Add new expenses and income',
      '✓ Edit own expenses',
      '✓ View reports and analytics',
      '✗ Cannot approve expenses',
      '✗ Cannot manage members'
    ],
    manager: [
      '✓ All member permissions',
      '✓ Approve/reject expenses',
      '✓ Manage budgets and goals',
      '✓ View audit logs',
      '✗ Cannot manage workspace settings',
      '✗ Cannot remove admin/owner'
    ],
    admin: [
      '✓ All manager permissions',
      '✓ Invite and remove members',
      '✓ Manage workspace settings',
      '✓ Change member roles',
      '✓ Access all features',
      '✗ Cannot delete workspace'
    ]
  };

  if (role && rolePermissions[role]) {
    permissionsDisplay.innerHTML = `
      <ul class="permissions-list">
        ${rolePermissions[role].map(perm => `<li>${perm}</li>`).join('')}
      </ul>
    `;
  } else {
    permissionsDisplay.innerHTML = '<p>Select a role to see permissions</p>';
  }
}

async function handleInviteSubmit(event) {
  event.preventDefault();

  const email = document.getElementById('invite-email').value.trim();
  const role = document.getElementById('invite-role').value;

  if (!email || !role) {
    showNotification('Please fill in all required fields', 'error');
    return;
  }

  if (!currentWorkspace) {
    showNotification('No workspace selected', 'error');
    return;
  }

  try {
    const token = getAuthToken();
    if (!token) {
      showNotification('Please login first', 'error');
      return;
    }

    // Show loading state
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    const response = await fetch(`/api/workspaces/${currentWorkspace._id}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ email, role })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showNotification(`Invitation sent to ${email}`, 'success');
      closeInviteModal();
      
      // Reload workspace data to show pending invites
      if (typeof loadWorkspaceData === 'function') {
        loadWorkspaceData();
      }
    } else {
      showNotification(data.error || 'Failed to send invitation', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  } catch (error) {
    console.error('Error sending invite:', error);
    showNotification('Failed to send invitation. Please try again.', 'error');
    
    // Reset button state
    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Invitation';
    }
  }
}

// Approval Settings Functions
async function loadApprovalSettings() {
  try {
    const token = getAuthToken();
    if (!token || !currentWorkspace) return;

    const response = await fetch(`/api/workspaces/${currentWorkspace._id}/settings`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (data.success) {
      const approvalRequired = document.getElementById('approval-required');
      if (approvalRequired && data.settings.approvalThreshold) {
        approvalRequired.value = data.settings.approvalThreshold;
      }
    }
  } catch (error) {
    console.error('Error loading approval settings:', error);
  }
}

async function saveApprovalSettings() {
  try {
    const token = localStorage.getItem('token');
    if (!token || !currentWorkspace) return;

    const approvalRequired = document.getElementById('approval-required');
    if (!approvalRequired) return;

    const threshold = parseFloat(approvalRequired.value) || 0;

    const response = await fetch(`/api/workspaces/${currentWorkspace._id}/settings`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        approvalThreshold: threshold
      })
    });

    const data = await response.json();
    if (data.success) {
      showNotification('Approval settings saved successfully', 'success');
    } else {
      showNotification(data.message || 'Failed to save approval settings', 'error');
    }
  } catch (error) {
    console.error('Error saving approval settings:', error);
    showNotification('Error saving approval settings', 'error');
  }
}

async function loadPendingApprovals() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;

    const response = await fetch('/api/approvals/pending', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (data.success) {
      renderApprovalsList('pending-approvals', data.approvals, true);
    }
  } catch (error) {
    console.error('Error loading pending approvals:', error);
  }
}

async function loadApprovalHistory() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;

    const response = await fetch('/api/approvals/history', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (data.success) {
      renderApprovalsList('approval-history', data.approvals, false);
    }
  } catch (error) {
    console.error('Error loading approval history:', error);
  }
}

function renderApprovalsList(containerId, approvals, showActions = false) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  if (approvals.length === 0) {
    container.innerHTML = '<p class="no-approvals">No approvals found</p>';
    return;
  }

  approvals.forEach(approval => {
    const approvalItem = document.createElement('div');
    approvalItem.className = 'approval-item';

    const statusClass = `status-${approval.status.toLowerCase()}`;

    approvalItem.innerHTML = `
      <div class="approval-info">
        <h5>${approval.expense.description}</h5>
        <div class="approval-details">
          Amount: ₹${approval.expense.amount} |
          Submitted by: ${approval.submittedBy.name || approval.submittedBy.email} |
          Date: ${new Date(approval.createdAt).toLocaleDateString()}
        </div>
      </div>
      <div class="approval-status ${statusClass}">${approval.status}</div>
      ${showActions ? `
        <div class="approval-actions">
          <button class="btn-approve" onclick="approveExpense('${approval._id}')">
            <i class="fas fa-check"></i> Approve
          </button>
          <button class="btn-reject" onclick="rejectExpense('${approval._id}')">
            <i class="fas fa-times"></i> Reject
          </button>
        </div>
      ` : ''}
    `;

    container.appendChild(approvalItem);
  });
}

async function approveExpense(approvalId) {
  await processApproval(approvalId, 'approved');
}

async function rejectExpense(approvalId) {
  await processApproval(approvalId, 'rejected');
}

async function processApproval(approvalId, status) {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;

    const response = await fetch(`/api/approvals/${approvalId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status })
    });

    const data = await response.json();
    if (data.success) {
      showNotification(`Expense ${status} successfully`, 'success');
      loadPendingApprovals();
      loadApprovalHistory();
      // Refresh expense list to show updated status
      if (typeof loadExpenses === 'function') {
        loadExpenses();
      }
    } else {
      showNotification(data.message || `Failed to ${status} expense`, 'error');
    }
  } catch (error) {
    console.error(`Error ${status} expense:`, error);
    showNotification(`Error ${status} expense`, 'error');
  }
}

// Profile Functions
async function updateProfile() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;

    const nameInput = document.getElementById('profile-name');
    if (!nameInput) return;

    const newName = nameInput.value.trim();
    if (!newName) {
      showNotification('Name cannot be empty', 'error');
      return;
    }

    const response = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: newName })
    });

    const data = await response.json();
    if (data.success) {
      currentUser.name = newName;
      updateUserDisplay();
      showNotification('Profile updated successfully', 'success');
    } else {
      showNotification(data.message || 'Failed to update profile', 'error');
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    showNotification('Error updating profile', 'error');
  }
}

// Form Handlers
async function handleCreateWorkspace(e) {
  e.preventDefault();

  const name = document.getElementById('workspace-name-input').value.trim();
  const description = document.getElementById('workspace-desc-input').value.trim();

  if (!name) {
    showNotification('Workspace name is required', 'error');
    return;
  }

  try {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    const response = await fetch('/api/workspaces', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, description })
    });

    const data = await response.json();
    if (data.success) {
      showNotification('Workspace created successfully!', 'success');
      closeWorkspaceModal();
      // Reload workspaces and switch to the new one
      if (typeof loadWorkspaces === 'function') {
        loadWorkspaces();
      }
      switchWorkspace(data.workspace._id);
    } else {
      showNotification(data.message || 'Failed to create workspace', 'error');
    }
  } catch (error) {
    console.error('Error creating workspace:', error);
    showNotification('Error creating workspace', 'error');
  }
}

async function handleInviteMember(e) {
  e.preventDefault();

  if (!currentWorkspace) {
    showNotification('No workspace selected', 'error');
    return;
  }

  const email = document.getElementById('invite-email-input').value.trim();
  const role = document.getElementById('invite-role-select').value;

  if (!email) {
    showNotification('Email is required', 'error');
    return;
  }

  try {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    const response = await fetch(`/api/workspaces/${currentWorkspace._id}/invite`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, role })
    });

    const data = await response.json();
    if (data.success) {
      showNotification('Invitation sent successfully!', 'success');
      closeInviteModal();
      loadMembers(); // Refresh members list
    } else {
      showNotification(data.message || 'Failed to send invitation', 'error');
    }
  } catch (error) {
    console.error('Error sending invitation:', error);
    showNotification('Error sending invitation', 'error');
  }
}

// Modal close functions
function closeWorkspaceModal() {
  const modal = document.getElementById('workspace-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}

function closeInviteModal() {
  const modal = document.getElementById('invite-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}

// Utility function for notifications
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
    <span>${message}</span>
  `;

  // Add to page
  document.body.appendChild(notification);

  // Show notification
  setTimeout(() => notification.classList.add('show'), 100);

  // Remove notification after 3 seconds
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => document.body.removeChild(notification), 300);
  }, 3000);
}

// ============================================
// Workspace Governance & Approvals
// ============================================

class WorkspaceGovernance {
  constructor() {
    this.init();
  }

  init() {
    this.setupPolicyManagement();
    this.setupApprovalUI();
    this.setupBalanceMonitoring();
  }

  setupPolicyManagement() {
    const policyButton = document.getElementById('manage-policies-btn');
    if (policyButton) {
      policyButton.addEventListener('click', () => this.openPolicyModal());
    }
  }

  async openPolicyModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'policy-modal';
    
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3><i class="fas fa-shield-alt"></i> Spending Policies</h3>
          <button class="close-modal" onclick="workspaceGov.closePolicyModal()">&times;</button>
        </div>
        
        <div class="policy-tabs">
          <button class="tab-button active" onclick="workspaceGov.switchPolicyTab('list')">
            <i class="fas fa-list"></i> Policies
          </button>
          <button class="tab-button" onclick="workspaceGov.switchPolicyTab('create')">
            <i class="fas fa-plus"></i> Create
          </button>
        </div>
        
        <div id="policy-list-tab" class="policy-tab active">
          <div id="policies-list" class="policies-container">
            <div class="loading"><p>Loading...</p></div>
          </div>
        </div>
        
        <div id="policy-create-tab" class="policy-tab">
          <form id="policy-form" onsubmit="workspaceGov.createPolicy(event)">
            <div class="form-group">
              <label>Policy Name *</label>
              <input type="text" name="name" required placeholder="e.g., Transport Over $100">
            </div>
            
            <div class="form-group">
              <label>Description</label>
              <textarea name="description" placeholder="Policy details..."></textarea>
            </div>
            
            <fieldset class="form-section">
              <legend>Conditions</legend>
              
              <div class="form-group">
                <label>Resource Type *</label>
                <select name="resourceType" required>
                  <option value="">Select...</option>
                  <option value="expense">Expense</option>
                  <option value="budget">Budget</option>
                </select>
              </div>
              
              <div class="form-row">
                <div class="form-group">
                  <label>Min Amount</label>
                  <input type="number" name="minAmount" min="0" step="0.01" placeholder="0">
                </div>
                <div class="form-group">
                  <label>Max Amount *</label>
                  <input type="number" name="maxAmount" required step="0.01" placeholder="100">
                </div>
              </div>
            </fieldset>
            
            <fieldset class="form-section">
              <legend>Approval</legend>
              
              <div class="form-group">
                <label>Approver Role *</label>
                <select name="approverRole" required>
                  <option value="">Select...</option>
                  <option value="manager">Manager</option>
                  <option value="senior-manager">Senior Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              
              <div class="form-group">
                <label>Risk Score (0-100)</label>
                <input type="range" name="riskScore" min="0" max="100" value="50">
              </div>
            </fieldset>
            
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Create Policy</button>
              <button type="button" class="btn btn-secondary" onclick="workspaceGov.closePolicyModal()">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    this.loadPolicies();
  }

  async loadPolicies() {
    try {
      const workspaceId = this.getCurrentWorkspaceId();
      const token = localStorage.getItem('token');
      
      const response = await fetch(`/api/workspaces/${workspaceId}/policies`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Failed to load policies');
      
      const data = await response.json();
      this.renderPolicies(data.data || []);
    } catch (error) {
      console.error('Load policies error:', error);
      document.getElementById('policies-list').innerHTML = `<p class="error">Failed to load</p>`;
    }
  }

  renderPolicies(policies) {
    const container = document.getElementById('policies-list');
    
    if (!policies || policies.length === 0) {
      container.innerHTML = '<p>No policies created</p>';
      return;
    }
    
    const html = policies.map(p => `
      <div class="policy-card">
        <div class="policy-header">
          <h5>${p.name}</h5>
          <span class="badge ${p.isActive ? 'active' : 'inactive'}">${p.isActive ? 'Active' : 'Inactive'}</span>
        </div>
        <p class="policy-desc">${p.description || 'No description'}</p>
        <div class="policy-meta">
          <span>Amount: $${p.conditions.minAmount}-$${p.conditions.maxAmount}</span>
          <span>Score: ${p.riskScore}</span>
        </div>
        <div class="policy-actions">
          <button class="btn btn-small btn-danger" onclick="workspaceGov.deletePolicy('${p._id}')">
            <i class="fas fa-trash"></i> Delete
          </button>
        </div>
      </div>
    `).join('');
    
    container.innerHTML = html;
  }

  async createPolicy(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const workspaceId = this.getCurrentWorkspaceId();
    const token = localStorage.getItem('token');
    
    const policyData = {
      name: formData.get('name'),
      description: formData.get('description'),
      conditions: {
        resourceType: formData.get('resourceType'),
        minAmount: parseFloat(formData.get('minAmount')) || 0,
        maxAmount: parseFloat(formData.get('maxAmount')),
        categories: []
      },
      approvalChain: [{
        stage: 1,
        approverRole: formData.get('approverRole'),
        approversCount: 1,
        timeoutDays: 5
      }],
      actions: {
        onViolation: ['hold_funds', 'notify_admin'],
        holdFunds: true
      },
      riskScore: parseInt(formData.get('riskScore'))
    };
    
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(policyData)
      });
      
      if (!response.ok) throw new Error('Failed to create policy');
      
      alert('Policy created successfully');
      this.switchPolicyTab('list');
      this.loadPolicies();
      form.reset();
    } catch (error) {
      alert('Failed to create policy: ' + error.message);
    }
  }

  async deletePolicy(policyId) {
    if (!confirm('Delete this policy?')) return;
    
    try {
      const workspaceId = this.getCurrentWorkspaceId();
      const token = localStorage.getItem('token');
      
      const response = await fetch(
        `/api/workspaces/${workspaceId}/policies/${policyId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (!response.ok) throw new Error('Failed to delete');
      
      alert('Policy deleted');
      this.loadPolicies();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  }

  setupApprovalUI() {
    this.loadPendingApprovals();
  }

  async loadPendingApprovals() {
    try {
      const workspaceId = this.getCurrentWorkspaceId();
      if (!workspaceId) return;
      
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/workspaces/${workspaceId}/approvals/pending`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      this.renderApprovalList(data.data || []);
    } catch (error) {
      console.error('Error loading approvals:', error);
    }
  }

  renderApprovalList(expenses) {
    const container = document.getElementById('pending-approvals');
    if (!container) return;
    
    if (!expenses.length) {
      container.innerHTML = '<p>No pending approvals</p>';
      return;
    }
    
    const html = expenses.map(e => `
      <div class="approval-card">
        <h5>${e.description}</h5>
        <p><strong>Amount:</strong> $${e.amount}</p>
        <p><strong>From:</strong> ${e.createdBy?.name || 'Unknown'}</p>
        ${e.policyFlags ? `<p class="flags">${e.policyFlags.map(f => f.policyName).join(', ')}</p>` : ''}
        <div class="card-actions">
          <button class="btn btn-success btn-small" onclick="workspaceGov.approveExpense('${e._id}')">
            Approve
          </button>
          <button class="btn btn-danger btn-small" onclick="workspaceGov.rejectExpenseUI('${e._id}')">
            Reject
          </button>
        </div>
      </div>
    `).join('');
    
    container.innerHTML = html;
  }

  async approveExpense(expenseId) {
    const notes = prompt('Approval notes:');
    
    try {
      const workspaceId = this.getCurrentWorkspaceId();
      const token = localStorage.getItem('token');
      
      const response = await fetch(
        `/api/workspaces/${workspaceId}/expenses/${expenseId}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ notes: notes || '' })
        }
      );
      
      if (!response.ok) throw new Error('Failed');
      
      alert('Expense approved');
      this.loadPendingApprovals();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  }

  rejectExpenseUI(expenseId) {
    const reason = prompt('Rejection reason:');
    if (reason) this.rejectExpense(expenseId, reason);
  }

  async rejectExpense(expenseId, reason) {
    try {
      const workspaceId = this.getCurrentWorkspaceId();
      const token = localStorage.getItem('token');
      
      await fetch(
        `/api/workspaces/${workspaceId}/expenses/${expenseId}/reject`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ reason })
        }
      );
      
      alert('Expense rejected');
      this.loadPendingApprovals();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  }

  async setupBalanceMonitoring() {
    this.updateBalanceDisplay();
    setInterval(() => this.updateBalanceDisplay(), 30000);
  }

  async updateBalanceDisplay() {
    try {
      const workspaceId = this.getCurrentWorkspaceId();
      if (!workspaceId) return;
      
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/workspaces/${workspaceId}/balance`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      const balance = data.data;
      
      const balanceElement = document.getElementById('workspace-balance');
      if (balanceElement) {
        balanceElement.innerHTML = `
          <div class="balance-display">
            <div>Total: $${balance.total}</div>
            <div>Spent: $${balance.spent}</div>
            <div>Pending: $${balance.pending}</div>
            <div><strong>Available: $${balance.available}</strong></div>
          </div>
        `;
      }
    } catch (error) {
      console.error('Error updating balance:', error);
    }
  }

  getCurrentWorkspaceId() {
    const url = new URL(window.location);
    return url.searchParams.get('workspace') || localStorage.getItem('activeWorkspace');
  }

  switchPolicyTab(tab) {
    document.querySelectorAll('.policy-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    
    const tabEl = document.getElementById('policy-' + tab + '-tab');
    if (tabEl) {
      tabEl.classList.add('active');
      if (event && event.target) event.target.classList.add('active');
    }
  }

  closePolicyModal() {
    const modal = document.getElementById('policy-modal');
    if (modal) modal.remove();
  }
}

// Initialize governance features
const workspaceGov = new WorkspaceGovernance();

