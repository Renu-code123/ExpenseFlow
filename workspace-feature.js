/**
 * Enterprise-Grade RBAC Workspace Management
 * Issue #420: Role-Based Access Control & Workspace Invites
 * 
 * Roles:
 * - owner: Full control (transfer ownership, delete workspace)
 * - manager: Can manage members and settings  
 * - editor: Can add/edit expenses
 * - viewer: Read-only access
 */

var WORKSPACE_API_URL = '/api/workspaces';

// State management with persistence
let currentWorkspaces = [];
let activeWorkspace = null;
let pendingInvites = [];

// Role definitions
const ROLES = {
  owner: { name: 'Owner', color: '#ff6b6b', icon: 'fa-crown' },
  manager: { name: 'Manager', color: '#4ecdc4', icon: 'fa-user-shield' },
  editor: { name: 'Editor', color: '#45b7d1', icon: 'fa-edit' },
  viewer: { name: 'Viewer', color: '#96ceb4', icon: 'fa-eye' }
};

// Permission definitions for UI
const ROLE_PERMISSIONS = {
  owner: ['Full workspace control', 'Transfer ownership', 'Delete workspace', 'Manage all members', 'All editor permissions'],
  manager: ['Manage workspace settings', 'Invite & remove members', 'Promote/demote members', 'Approve expenses', 'All editor permissions'],
  editor: ['Create expenses', 'Edit expenses', 'Delete expenses', 'View budgets', 'Export reports'],
  viewer: ['View expenses', 'View budgets', 'View reports']
};

// Enhanced API Functions with better error handling
async function getAuthHeaders() {
  const token = localStorage.getItem('authToken') || localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
}

/**
 * Enhanced workspace fetching with caching
 */
async function fetchWorkspaces() {
  try {
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (!token) return [];

    const response = await fetch(WORKSPACE_API_URL, {
      headers: await getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch workspaces');
    const data = await response.json();
    currentWorkspaces = data.data || [];
    renderWorkspaceSelection();
    return currentWorkspaces;
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    showWorkspaceNotification('Failed to load workspaces', 'error');
    return [];
  }
}

/**
 * Enhanced create workspace with validation
 */
async function createWorkspace(name, description) {
  try {
    const response = await fetch(WORKSPACE_API_URL, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ name, description })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    showWorkspaceNotification('Workspace created successfully!', 'success');
    await fetchWorkspaces();
    return data.data;
  } catch (error) {
    showWorkspaceNotification(error.message, 'error');
    return null;
  }
}

/**
 * Update workspace settings
 */
async function updateWorkspace(workspaceId, updates) {
  try {
    const response = await fetch(`${WORKSPACE_API_URL}/${workspaceId}`, {
      method: 'PUT',
      headers: await getAuthHeaders(),
      body: JSON.stringify(updates)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    showWorkspaceNotification('Workspace updated!', 'success');
    await fetchWorkspaces();
    if (activeWorkspace?._id === workspaceId) {
      await loadWorkspaceMembers();
    }
    return data.data;
  } catch (error) {
    showWorkspaceNotification(error.message, 'error');
    return null;
  }
}

/**
 * Delete workspace
 */
async function deleteWorkspace(workspaceId) {
  try {
    const response = await fetch(`${WORKSPACE_API_URL}/${workspaceId}`, {
      method: 'DELETE',
      headers: await getAuthHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    showWorkspaceNotification('Workspace deleted', 'success');
    if (activeWorkspace?._id === workspaceId) {
      selectWorkspace(null);
    }
    await fetchWorkspaces();
    return true;
  } catch (error) {
    showWorkspaceNotification(error.message, 'error');
    return false;
  }
}

/**
 * Invite user to workspace
 */
async function inviteToWorkspace(workspaceId, email, role, message = '') {
  try {
    const response = await fetch(`${WORKSPACE_API_URL}/${workspaceId}/invite`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ email, role, message })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    showWorkspaceNotification('Invitation sent successfully!', 'success');
    await loadPendingInvites(workspaceId);
    return data.data;
  } catch (error) {
    showWorkspaceNotification(error.message, 'error');
    return null;
  }
}

/**
 * Resend invite
 */
async function resendInvite(workspaceId, inviteId) {
  try {
    const response = await fetch(`${WORKSPACE_API_URL}/${workspaceId}/invites/${inviteId}/resend`, {
      method: 'POST',
      headers: await getAuthHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    showWorkspaceNotification('Invitation resent!', 'success');
    return true;
  } catch (error) {
    showWorkspaceNotification(error.message, 'error');
    return false;
  }
}

/**
 * Revoke invite
 */
async function revokeInvite(workspaceId, inviteId) {
  try {
    const response = await fetch(`${WORKSPACE_API_URL}/${workspaceId}/invites/${inviteId}`, {
      method: 'DELETE',
      headers: await getAuthHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    showWorkspaceNotification('Invitation revoked', 'success');
    await loadPendingInvites(workspaceId);
    return true;
  } catch (error) {
    showWorkspaceNotification(error.message, 'error');
    return false;
  }
}

/**
 * Get pending invites for workspace
 */
async function loadPendingInvites(workspaceId) {
  try {
    const response = await fetch(`${WORKSPACE_API_URL}/${workspaceId}/invites`, {
      headers: await getAuthHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    pendingInvites = data.data || [];
    renderPendingInvites();
    return pendingInvites;
  } catch (error) {
    console.error('Error loading invites:', error);
    return [];
  }
}

/**
 * Join workspace using token
 */
async function joinWorkspace(token) {
  try {
    const response = await fetch(`${WORKSPACE_API_URL}/join`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ token })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    showWorkspaceNotification(data.message || 'Joined workspace successfully!', 'success');
    await fetchWorkspaces();
    
    // Select the new workspace
    if (data.data?.workspace?._id) {
      selectWorkspace(data.data.workspace._id);
    }
    
    return data.data;
  } catch (error) {
    showWorkspaceNotification(error.message, 'error');
    return null;
  }
}

/**
 * Update member role
 */
async function changeMemberRole(userId, newRole) {
  if (!activeWorkspace || !newRole) return;

  try {
    const response = await fetch(`${WORKSPACE_API_URL}/${activeWorkspace._id}/members/${userId}`, {
      method: 'PUT',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ role: newRole })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    showWorkspaceNotification('Member role updated!', 'success');
    await loadWorkspaceMembers();
    return true;
  } catch (error) {
    showWorkspaceNotification(error.message, 'error');
    return false;
  }
}

/**
 * Remove member from workspace
 */
async function removeMember(userId) {
  if (!activeWorkspace) return;

  if (!confirm('Are you sure you want to remove this member?')) {
    return false;
  }

  try {
    const response = await fetch(`${WORKSPACE_API_URL}/${activeWorkspace._id}/members/${userId}`, {
      method: 'DELETE',
      headers: await getAuthHeaders()
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    showWorkspaceNotification('Member removed', 'success');
    await loadWorkspaceMembers();
    return true;
  } catch (error) {
    showWorkspaceNotification(error.message, 'error');
    return false;
  }
}

/**
 * Leave workspace
 */
async function leaveWorkspace(workspaceId) {
  if (!confirm('Are you sure you want to leave this workspace?')) {
    return false;
  }

  try {
    const response = await fetch(`${WORKSPACE_API_URL}/${workspaceId}/leave`, {
      method: 'POST',
      headers: await getAuthHeaders()
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    showWorkspaceNotification('You have left the workspace', 'success');
    selectWorkspace(null);
    await fetchWorkspaces();
    return true;
  } catch (error) {
    showWorkspaceNotification(error.message, 'error');
    return false;
  }
}

/**
 * Transfer ownership
 */
async function transferOwnership(newOwnerId) {
  if (!activeWorkspace) return;

  const newOwner = activeWorkspace.members.find(m => m.user._id === newOwnerId);
  if (!confirm(`Transfer ownership to ${newOwner?.user?.name || 'this member'}? You will become a manager.`)) {
    return false;
  }

  try {
    const response = await fetch(`${WORKSPACE_API_URL}/${activeWorkspace._id}/transfer`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ newOwnerId })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    showWorkspaceNotification('Ownership transferred!', 'success');
    await loadWorkspaceMembers();
    return true;
  } catch (error) {
    showWorkspaceNotification(error.message, 'error');
    return false;
  }
}

/**
 * Generate shareable invite link
 */
async function generateInviteLink(role = 'viewer', expiryDays = 30) {
  if (!activeWorkspace) return;

  try {
    const response = await fetch(`${WORKSPACE_API_URL}/${activeWorkspace._id}/invite-link`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ role, expiryDays })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    showWorkspaceNotification('Invite link generated!', 'success');
    return data.data;
  } catch (error) {
    showWorkspaceNotification(error.message, 'error');
    return null;
  }
}

// ========================
// UI Rendering Functions
// ========================

/**
 * Workspace Selection UI
 */
function renderWorkspaceSelection() {
  const container = document.getElementById('workspace-selector');
  if (!container) return;

  const userRole = activeWorkspace?.userRole || null;

  container.innerHTML = `
    <div class="workspace-current" onclick="toggleWorkspaceDropdown()">
      <div class="workspace-avatar" style="background: ${activeWorkspace ? getWorkspaceColor(activeWorkspace.name) : '#667eea'}">
        ${activeWorkspace ? activeWorkspace.name.charAt(0).toUpperCase() : '<i class="fas fa-user"></i>'}
      </div>
      <div class="workspace-info">
        <span class="workspace-label">Current Workspace</span>
        <span class="workspace-name">${activeWorkspace ? activeWorkspace.name : 'Personal Account'}</span>
        ${userRole ? `<span class="role-badge role-${userRole}">${ROLES[userRole]?.name || userRole}</span>` : ''}
      </div>
      <i class="fas fa-chevron-down dropdown-arrow"></i>
    </div>
    <div class="workspace-dropdown" id="workspace-dropdown">
      <div class="workspace-item ${!activeWorkspace ? 'active' : ''}" onclick="selectWorkspace(null)">
        <i class="fas fa-user"></i>
        <span>Personal Account</span>
      </div>
      <div class="workspace-divider">Shared Workspaces</div>
      ${currentWorkspaces.length === 0 ? 
        '<div class="workspace-empty">No shared workspaces yet</div>' :
        currentWorkspaces.map(ws => `
          <div class="workspace-item ${activeWorkspace?._id === ws._id ? 'active' : ''}" onclick="selectWorkspace('${ws._id}')">
            <div class="workspace-avatar-sm" style="background: ${getWorkspaceColor(ws.name)}">${ws.name.charAt(0).toUpperCase()}</div>
            <div class="workspace-item-info">
              <span class="workspace-item-name">${ws.name}</span>
              <span class="workspace-item-role">${ROLES[ws.userRole]?.name || ws.userRole}</span>
            </div>
            ${ws.isOwner ? '<i class="fas fa-crown owner-icon" title="Owner"></i>' : ''}
          </div>
        `).join('')
      }
      <div class="workspace-footer">
        <button class="add-workspace-btn" onclick="openCreateWorkspaceModal()">
          <i class="fas fa-plus"></i> Create Workspace
        </button>
      </div>
    </div>
  `;
}

/**
 * Render members list with role management
 */
function renderMembersList(members) {
  const membersList = document.getElementById('members-list');
  if (!membersList) return;

  const currentUserId = localStorage.getItem('userId');
  const userRole = activeWorkspace?.userRole || 'viewer';
  const canManageMembers = ['owner', 'manager'].includes(userRole);
  const isOwner = userRole === 'owner';

  membersList.innerHTML = members.map(member => {
    const isCurrentUser = member.user._id === currentUserId;
    const memberRole = member.role;
    const roleInfo = ROLES[memberRole] || { name: memberRole, color: '#888', icon: 'fa-user' };
    
    // Can edit if: manager+ AND target is below your role AND not yourself
    const canEdit = canManageMembers && !isCurrentUser && 
                    getRoleLevel(userRole) > getRoleLevel(memberRole);
    const canRemove = canEdit;
    const canTransfer = isOwner && !isCurrentUser;

    return `
      <div class="member-item" data-user-id="${member.user._id}">
        <div class="member-info">
          <div class="member-avatar" style="background: ${getAvatarColor(member.user.name || member.user.email)}">
            ${member.user.avatar ? 
              `<img src="${member.user.avatar}" alt="${member.user.name}">` :
              (member.user.name || 'U').charAt(0).toUpperCase()
            }
          </div>
          <div class="member-details">
            <h6 class="member-name">
              ${member.user.name || 'Unknown User'}
              ${isCurrentUser ? '<span class="you-badge">(You)</span>' : ''}
            </h6>
            <small class="member-email">${member.user.email}</small>
          </div>
        </div>
        <div class="member-role-section">
          <span class="role-badge role-${memberRole}" style="background: ${roleInfo.color}">
            <i class="fas ${roleInfo.icon}"></i>
            ${roleInfo.name}
          </span>
        </div>
        <div class="member-actions">
          ${canEdit ? `
            <div class="role-dropdown">
              <button class="btn-role-dropdown" onclick="toggleRoleDropdown('${member.user._id}')">
                <i class="fas fa-user-cog"></i>
              </button>
              <div class="role-dropdown-menu" id="role-dropdown-${member.user._id}">
                ${['manager', 'editor', 'viewer'].map(role => `
                  <div class="role-option ${role === memberRole ? 'active' : ''}" 
                       onclick="changeMemberRole('${member.user._id}', '${role}')">
                    <i class="fas ${ROLES[role].icon}"></i>
                    <span>${ROLES[role].name}</span>
                    ${role === memberRole ? '<i class="fas fa-check"></i>' : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          ${canTransfer ? `
            <button class="btn-transfer" onclick="transferOwnership('${member.user._id}')" title="Transfer Ownership">
              <i class="fas fa-crown"></i>
            </button>
          ` : ''}
          ${canRemove ? `
            <button class="btn-remove-member" onclick="removeMember('${member.user._id}')" title="Remove member">
              <i class="fas fa-user-minus"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render pending invites
 */
function renderPendingInvites() {
  const invitesList = document.getElementById('pending-invites-list');
  if (!invitesList) return;

  if (pendingInvites.length === 0) {
    invitesList.innerHTML = '<div class="empty-invites">No pending invitations</div>';
    return;
  }

  invitesList.innerHTML = pendingInvites.map(invite => `
    <div class="invite-item">
      <div class="invite-info">
        <span class="invite-email">${invite.email}</span>
        <span class="invite-role role-badge role-${invite.role}">${ROLES[invite.role]?.name || invite.role}</span>
        <span class="invite-expiry">Expires ${invite.expiresIn || 'soon'}</span>
      </div>
      <div class="invite-actions">
        <button class="btn-resend" onclick="resendInvite('${activeWorkspace._id}', '${invite._id}')" title="Resend">
          <i class="fas fa-paper-plane"></i>
        </button>
        <button class="btn-revoke" onclick="revokeInvite('${activeWorkspace._id}', '${invite._id}')" title="Revoke">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * Select active workspace
 */
function selectWorkspace(id) {
  if (!id) {
    activeWorkspace = null;
  } else {
    activeWorkspace = currentWorkspaces.find(ws => ws._id === id);
  }

  // Close dropdown
  document.getElementById('workspace-dropdown')?.classList.remove('active');

  // Update UI
  renderWorkspaceSelection();
  updateWorkspaceDashboard();

  // Save preference
  localStorage.setItem('activeWorkspaceId', id || 'personal');

  // Dispatch event for other components
  window.dispatchEvent(new CustomEvent('workspaceChanged', { 
    detail: { workspace: activeWorkspace }
  }));
}

function toggleWorkspaceDropdown() {
  document.getElementById('workspace-dropdown')?.classList.toggle('active');
}

function toggleRoleDropdown(userId) {
  const dropdown = document.getElementById(`role-dropdown-${userId}`);
  
  // Close all other dropdowns
  document.querySelectorAll('.role-dropdown-menu.active').forEach(d => {
    if (d !== dropdown) d.classList.remove('active');
  });
  
  dropdown?.classList.toggle('active');
}

/**
 * Update dashboard context based on workspace
 */
function updateWorkspaceDashboard() {
  if (typeof updateAllData === 'function') {
    updateAllData(activeWorkspace ? activeWorkspace._id : null);
  }

  // Show/hide workspace settings
  const workspaceSettings = document.getElementById('workspace-settings');
  if (workspaceSettings) {
    workspaceSettings.style.display = activeWorkspace ? 'block' : 'none';
  }

  if (activeWorkspace) {
    loadWorkspaceMembers();
    updateWorkspaceInfo();
  }
}

/**
 * Load workspace members
 */
async function loadWorkspaceMembers() {
  if (!activeWorkspace) return;

  try {
    const response = await fetch(`${WORKSPACE_API_URL}/${activeWorkspace._id}`, {
      headers: await getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to load workspace');

    const data = await response.json();
    activeWorkspace = { ...activeWorkspace, ...data.data };
    
    renderMembersList(activeWorkspace.members);
    updateWorkspaceInfo();
    updateInviteButtonVisibility();
    
    // Load pending invites if user can manage invites
    if (['owner', 'manager'].includes(activeWorkspace.userRole)) {
      await loadPendingInvites(activeWorkspace._id);
    }
  } catch (error) {
    console.error('Error loading workspace:', error);
    showWorkspaceNotification('Failed to load workspace members', 'error');
  }
}

/**
 * Update workspace info display
 */
function updateWorkspaceInfo() {
  if (!activeWorkspace) return;

  const nameEl = document.getElementById('current-workspace-name');
  const descEl = document.getElementById('current-workspace-desc');
  const memberCountEl = document.getElementById('member-count');
  const userRoleEl = document.getElementById('your-role');

  if (nameEl) nameEl.textContent = activeWorkspace.name;
  if (descEl) descEl.textContent = activeWorkspace.description || 'No description';
  if (memberCountEl) memberCountEl.textContent = `${activeWorkspace.members?.length || 0} members`;
  
  if (userRoleEl) {
    const roleInfo = ROLES[activeWorkspace.userRole] || { name: 'Member' };
    userRoleEl.innerHTML = `
      <span class="role-badge role-${activeWorkspace.userRole}">
        ${roleInfo.name}
      </span>
    `;
  }
}

/**
 * Update invite button visibility
 */
function updateInviteButtonVisibility() {
  const inviteBtn = document.getElementById('invite-btn');
  const pendingSection = document.getElementById('pending-invites-section');
  
  const canInvite = activeWorkspace && ['owner', 'manager'].includes(activeWorkspace.userRole);
  
  if (inviteBtn) inviteBtn.style.display = canInvite ? 'flex' : 'none';
  if (pendingSection) pendingSection.style.display = canInvite ? 'block' : 'none';
}

// ========================
// Modal Functions
// ========================

function openCreateWorkspaceModal() {
  const modal = document.getElementById('workspace-modal');
  if (modal) modal.classList.add('active');
}

function closeWorkspaceModal() {
  const modal = document.getElementById('workspace-modal');
  if (modal) modal.classList.remove('active');
}

function openInviteModal() {
  const modal = document.getElementById('invite-modal');
  if (modal) {
    modal.classList.add('active');
    updateRolePermissions('viewer');
  }
}

function closeInviteModal() {
  const modal = document.getElementById('invite-modal');
  if (modal) modal.classList.remove('active');
}

function openInviteLinkModal() {
  const modal = document.getElementById('invite-link-modal');
  if (modal) modal.classList.add('active');
}

function closeInviteLinkModal() {
  const modal = document.getElementById('invite-link-modal');
  if (modal) modal.classList.remove('active');
}

/**
 * Update role permissions display
 */
function updateRolePermissions(role) {
  const display = document.getElementById('role-permissions-display');
  if (!display) return;

  const permissions = ROLE_PERMISSIONS[role] || [];
  display.innerHTML = permissions.length > 0
    ? `<ul class="permissions-list">${permissions.map(p => `<li><i class="fas fa-check"></i> ${p}</li>`).join('')}</ul>`
    : '<p>Select a role to see permissions</p>';
}

// ========================
// Helper Functions
// ========================

function getRoleLevel(role) {
  const levels = { owner: 4, manager: 3, editor: 2, viewer: 1 };
  return levels[role] || 0;
}

function getWorkspaceColor(name) {
  const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe', '#43e97b', '#fa709a'];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

function getAvatarColor(name) {
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#ff7675', '#74b9ff'];
  const index = (name || 'U').charCodeAt(0) % colors.length;
  return colors[index];
}

function showWorkspaceNotification(message, type = 'info') {
  if (typeof showNotification === 'function') {
    showNotification(message, type);
    return;
  }
  
  // Fallback notification
  const notification = document.createElement('div');
  notification.className = `workspace-notification ${type}`;
  notification.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
    <span>${message}</span>
  `;
  notification.style.cssText = `
    position: fixed; top: 20px; right: 20px; padding: 1rem 1.5rem;
    border-radius: 8px; color: white; z-index: 10000; display: flex;
    align-items: center; gap: 0.5rem; animation: slideIn 0.3s ease;
    background: ${type === 'success' ? '#00c853' : type === 'error' ? '#ff5252' : '#2196f3'};
  `;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// ========================
// Initialization
// ========================

function initWorkspaceFeature() {
  const workspaceIdPref = localStorage.getItem('activeWorkspaceId');

  fetchWorkspaces().then(() => {
    if (workspaceIdPref && workspaceIdPref !== 'personal') {
      selectWorkspace(workspaceIdPref);
    }
  });

  // Handle create workspace form
  const createForm = document.getElementById('create-workspace-form');
  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('workspace-name-input')?.value;
      const desc = document.getElementById('workspace-desc-input')?.value;
      if (name) {
        await createWorkspace(name, desc);
        closeWorkspaceModal();
        createForm.reset();
      }
    });
  }

  // Handle invite form
  const inviteForm = document.getElementById('invite-form');
  if (inviteForm) {
    inviteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('invite-email')?.value;
      const role = document.getElementById('invite-role')?.value || 'viewer';
      const message = document.getElementById('invite-message')?.value || '';

      if (!activeWorkspace) {
        showWorkspaceNotification('No workspace selected', 'error');
        return;
      }

      if (email) {
        await inviteToWorkspace(activeWorkspace._id, email, role, message);
        closeInviteModal();
        inviteForm.reset();
        updateRolePermissions('viewer');
      }
    });
  }

  // Role selection change
  const roleSelect = document.getElementById('invite-role');
  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
      updateRolePermissions(e.target.value);
    });
  }

  // Handle invite link form
  const inviteLinkForm = document.getElementById('invite-link-form');
  if (inviteLinkForm) {
    inviteLinkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const role = document.getElementById('link-role')?.value || 'viewer';
      const expiry = parseInt(document.getElementById('link-expiry')?.value) || 30;

      const result = await generateInviteLink(role, expiry);
      if (result) {
        const linkDisplay = document.getElementById('generated-link');
        if (linkDisplay) {
          linkDisplay.value = result.link;
          linkDisplay.style.display = 'block';
          document.getElementById('copy-link-btn')?.style.display = 'inline-flex';
        }
      }
    });
  }

  // Copy link button
  const copyLinkBtn = document.getElementById('copy-link-btn');
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => {
      const linkInput = document.getElementById('generated-link');
      if (linkInput) {
        linkInput.select();
        document.execCommand('copy');
        showWorkspaceNotification('Link copied to clipboard!', 'success');
      }
    });
  }

  // Handle invitation join from URL
  const urlParams = new URLSearchParams(window.location.search);
  const inviteToken = urlParams.get('token');
  if (inviteToken && window.location.pathname.includes('join-workspace')) {
    joinWorkspace(inviteToken);
  }

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.workspace-selector')) {
      document.getElementById('workspace-dropdown')?.classList.remove('active');
    }
    if (!e.target.closest('.role-dropdown')) {
      document.querySelectorAll('.role-dropdown-menu.active').forEach(d => d.classList.remove('active'));
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWorkspaceFeature);
} else {
  initWorkspaceFeature();
}

// Export functions for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fetchWorkspaces,
    createWorkspace,
    selectWorkspace,
    inviteToWorkspace,
    changeMemberRole,
    removeMember,
    leaveWorkspace,
    transferOwnership,
    ROLES,
    ROLE_PERMISSIONS
  };
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWorkspaceFeature);
} else {
    initWorkspaceFeature();
}