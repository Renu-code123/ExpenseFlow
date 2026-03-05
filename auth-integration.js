/**
 * Authentication & Security API Functions
 * Issue #338: Enterprise-Grade Audit Trail & TOTP Security Suite
 */

var API_BASE_URL = '/api';
var authToken = localStorage.getItem('token');
var currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
var currentSessionId = localStorage.getItem('sessionId');

// ============================================
// Core Auth API Calls
// ============================================

async function register(userData) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    authToken = data.token;
    currentUser = data.user;
    currentSessionId = data.sessionId;

    localStorage.setItem('token ', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    localStorage.setItem('sessionId', currentSessionId);

    return data;
  } catch (error) {
    throw error;
  }
}

async function login(credentials) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error);
    }

    // Check if 2FA is required
    if (data.requires2FA) {
      return {
        requires2FA: true,
        userId: data.userId,
        message: data.message
      };
    }

    authToken = data.token;
    currentUser = data.user;
    currentSessionId = data.sessionId;

    localStorage.setItem('token', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    localStorage.setItem('sessionId', currentSessionId);

    return data;
  } catch (error) {
    throw error;
  }
}

async function verify2FA(userId, totpToken, rememberMe = false) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/verify-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, token: totpToken, rememberMe })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    authToken = data.token;
    currentUser = data.user;
    currentSessionId = data.sessionId;

    localStorage.setItem('token', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    localStorage.setItem('sessionId', currentSessionId);

    return data;
  } catch (error) {
    throw error;
  }
}

async function logout() {
  try {
    if (authToken) {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    }
  } catch (error) {
    console.error('Logout API error:', error);
  } finally {
    authToken = null;
    currentUser = null;
    currentSessionId = null;
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('sessionId');
    localStorage.removeItem('transactions');
    showAuthForm();
  }
}

// ============================================
// 2FA Management
// ============================================

async function setup2FA() {
  if (!authToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/auth/2fa/setup`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}

async function verify2FASetup(token) {
  if (!authToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/auth/2fa/verify-setup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ token })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  const data = await response.json();
  
  // Update local user info
  if (currentUser) {
    currentUser.twoFactorEnabled = true;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
  }

  return data;
}

async function disable2FA(password) {
  if (!authToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/auth/2fa/disable`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ password })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  const data = await response.json();
  
  // Update local user info
  if (currentUser) {
    currentUser.twoFactorEnabled = false;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
  }

  return data;
}

async function get2FAStatus() {
  if (!authToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/auth/2fa/status`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}

async function regenerateBackupCodes(token) {
  if (!authToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/auth/2fa/backup-codes/regenerate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ token })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}

// ============================================
// Session Management
// ============================================

async function getActiveSessions() {
  if (!authToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/auth/sessions`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}

async function revokeSession(sessionId) {
  if (!authToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/auth/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}

async function revokeAllSessions() {
  if (!authToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/auth/sessions/revoke-all`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}

async function getLoginHistory(limit = 20) {
  if (!authToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/auth/sessions/history?limit=${limit}`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}

// ============================================
// Security & Audit Trail
// ============================================

async function getSecuritySummary() {
  if (!authToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/auth/security/summary`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}

async function getAuditTrail(days = 30, limit = 100) {
  if (!authToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/auth/security/audit-trail?days=${days}&limit=${limit}`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}

async function changePassword(currentPassword, newPassword) {
  if (!authToken) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/auth/security/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ currentPassword, newPassword })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}

// ============================================
// Updated API functions with authentication
// ============================================

async function fetchExpenses() {
  if (!authToken) throw new Error('Not authenticated');

  try {
    const response = await fetch(`${API_BASE_URL}/expenses`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (response.status === 401) {
      const data = await response.json();
      if (data.code === 'SESSION_INVALID' || data.code === 'TOKEN_EXPIRED') {
        logout();
        throw new Error('Session expired. Please login again.');
      }
    }
    
    if (!response.ok) throw new Error('Failed to fetch expenses');
    return await response.json();
  } catch (error) {
    if (error.message.includes('401') || error.message.includes('Session expired')) {
      logout();
    }
    throw error;
  }
}

async function saveExpense(expense) {
  if (!authToken) throw new Error('Not authenticated');

  try {
    const response = await fetch(`${API_BASE_URL}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(expense)
    });
    if (!response.ok) throw new Error('Failed to save expense');
    return await response.json();
  } catch (error) {
    if (error.message.includes('401')) {
      logout();
      throw new Error('Session expired');
    }
    throw error;
  }
}

async function deleteExpense(id) {
  if (!authToken) throw new Error('Not authenticated');

  try {
    const response = await fetch(`${API_BASE_URL}/expenses/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!response.ok) throw new Error('Failed to delete expense');
    return await response.json();
  } catch (error) {
    if (error.message.includes('401')) {
      logout();
      throw new Error('Session expired');
    }
    throw error;
  }
}

// ============================================
// UI Functions
// ============================================

function showAuthForm() {
  document.body.innerHTML = `
    <div class="auth-container">
      <div class="auth-form">
        <h2 id="auth-title">Login to ExpenseFlow</h2>
        <form id="auth-form">
          <div id="name-field" style="display: none;">
            <input type="text" id="name" placeholder="Full Name">
          </div>
          <input type="email" id="email" placeholder="Email" required>
          <input type="password" id="password" placeholder="Password" required>
          <div id="totp-field" style="display: none;">
            <input type="text" id="totp-token" placeholder="6-digit verification code" maxlength="6" pattern="[0-9]{6}">
            <small>Enter the code from your authenticator app</small>
          </div>
          <div id="password-requirements" style="display: none; font-size: 12px; color: #666; margin-bottom: 1rem;">
            Password must be 12-128 characters and contain:<br>
            • At least one uppercase letter (A-Z)<br>
            • At least one lowercase letter (a-z)<br>
            • At least one number (0-9)<br>
            • At least one special character (@$!%*?&)
          </div>
          <label id="remember-me-label" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; font-size: 14px;">
            <input type="checkbox" id="remember-me">
            <span>Remember me for 30 days</span>
          </label>
          <button type="submit" id="auth-submit">Login</button>
        </form>
        <p>
          <span id="auth-switch-text">Don't have an account?</span>
          <a href="#" id="auth-switch">Register</a>
        </p>
      </div>
    </div>
    <style>
      .auth-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }
      .auth-form {
        background: white;
        padding: 2rem;
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        width: 100%;
        max-width: 400px;
      }
      .auth-form h2 {
        text-align: center;
        margin-bottom: 1.5rem;
        color: #333;
      }
      .auth-form input[type="text"],
      .auth-form input[type="email"],
      .auth-form input[type="password"] {
        width: 100%;
        padding: 12px;
        margin-bottom: 1rem;
        border: 1px solid #ddd;
        border-radius: 5px;
        font-size: 16px;
        box-sizing: border-box;
      }
      .auth-form input:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }
      .auth-form button {
        width: 100%;
        padding: 12px;
        background: #667eea;
        color: white;
        border: none;
        border-radius: 5px;
        font-size: 16px;
        cursor: pointer;
        transition: background 0.3s ease;
      }
      .auth-form button:hover {
        background: #5a6fd8;
      }
      .auth-form button:disabled {
        background: #ccc;
        cursor: not-allowed;
      }
      .auth-form p {
        text-align: center;
        margin-top: 1rem;
      }
      .auth-form a {
        color: #667eea;
        text-decoration: none;
      }
      .auth-form small {
        display: block;
        color: #666;
        font-size: 12px;
        margin-top: -0.5rem;
        margin-bottom: 1rem;
      }
      #totp-field input {
        text-align: center;
        letter-spacing: 0.5em;
        font-size: 20px;
        font-weight: bold;
      }
    </style>
  `;

  let isLogin = true;
  let requires2FA = false;
  let pending2FAUserId = null;

  document.getElementById('auth-switch').addEventListener('click', (e) => {
    e.preventDefault();
    isLogin = !isLogin;
    requires2FA = false;
    pending2FAUserId = null;

    const title = document.getElementById('auth-title');
    const nameField = document.getElementById('name-field');
    const passwordRequirements = document.getElementById('password-requirements');
    const totpField = document.getElementById('totp-field');
    const submitBtn = document.getElementById('auth-submit');
    const switchText = document.getElementById('auth-switch-text');
    const switchLink = document.getElementById('auth-switch');
    const rememberMeLabel = document.getElementById('remember-me-label');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    emailInput.disabled = false;
    passwordInput.disabled = false;
    totpField.style.display = 'none';

    if (isLogin) {
      title.textContent = 'Login to ExpenseFlow';
      nameField.style.display = 'none';
      document.getElementById('name').required = false;
      passwordRequirements.style.display = 'none';
      rememberMeLabel.style.display = 'flex';
      submitBtn.textContent = 'Login';
      switchText.textContent = 'Don\'t have an account?';
      switchLink.textContent = 'Register';
    } else {
      title.textContent = 'Register for ExpenseFlow';
      nameField.style.display = 'block';
      document.getElementById('name').required = true;
      passwordRequirements.style.display = 'block';
      rememberMeLabel.style.display = 'none';
      submitBtn.textContent = 'Register';
      switchText.textContent = 'Already have an account?';
      switchLink.textContent = 'Login';
    }
  });

  // Password validation function
  function validatePassword(password) {
    if (password.length < 12) {
      return 'Password must be at least 12 characters long';
    }
    if (password.length > 128) {
      return 'Password must not exceed 128 characters';
    }
    if (!/(?=.*[a-z])/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/(?=.*[A-Z])/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/(?=.*\d)/.test(password)) {
      return 'Password must contain at least one number';
    }
    if (!/(?=.*[@$!%*?&])/.test(password)) {
      return 'Password must contain at least one special character (@$!%*?&)';
    }
    return null; // Valid password
  }

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const name = document.getElementById('name').value;
    const totpToken = document.getElementById('totp-token').value;
    const rememberMe = document.getElementById('remember-me').checked;

    // Handle 2FA verification
    if (requires2FA && pending2FAUserId) {
      if (!totpToken || totpToken.length !== 6) {
        showNotification('Please enter a valid 6-digit code', 'error');
        return;
      }

      try {
        await verify2FA(pending2FAUserId, totpToken, rememberMe);
        showMainApp();
        showNotification(`Welcome back ${currentUser.name}!`, 'success');
      } catch (error) {
        showNotification(error.message, 'error');
      }
      return;
    }

    // Client-side password validation for registration
    if (!isLogin) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        showNotification(passwordError, 'error');
        return;
      }
    }

    try {
      if (isLogin) {
        const result = await login({ email, password, rememberMe });
        
        // Check if 2FA is required
        if (result.requires2FA) {
          requires2FA = true;
          pending2FAUserId = result.userId;
          
          // Show 2FA input
          document.getElementById('totp-field').style.display = 'block';
          document.getElementById('email').disabled = true;
          document.getElementById('password').disabled = true;
          document.getElementById('auth-title').textContent = 'Enter Verification Code';
          document.getElementById('auth-submit').textContent = 'Verify';
          document.getElementById('totp-token').focus();
          
          showNotification('Please enter your 2FA verification code', 'info');
          return;
        }

        showMainApp();
        showNotification(`Welcome ${currentUser.name}!`, 'success');
      } else {
        await register({ name, email, password });
        showMainApp();
        showNotification(`Welcome ${currentUser.name}!`, 'success');
      }
    } catch (error) {
      showNotification(error.message, 'error');
    }
  });
}

function showMainApp() {
  // Restore original HTML structure
  location.reload();
}

// ============================================
// Security Dashboard Functions
// ============================================

async function showSecurityDashboard() {
  try {
    const [securitySummary, sessions, auditTrail] = await Promise.all([
      getSecuritySummary(),
      getActiveSessions(),
      getAuditTrail(30, 50)
    ]);

    renderSecurityDashboard(securitySummary, sessions.sessions, auditTrail.auditTrail);
  } catch (error) {
    console.error('Failed to load security dashboard:', error);
    showNotification('Failed to load security settings', 'error');
  }
}

function renderSecurityDashboard(summary, sessions, auditTrail) {
  const container = document.getElementById('security-dashboard');
  if (!container) return;

  container.innerHTML = `
    <div class="security-overview">
      <div class="security-score-card">
        <div class="score-circle ${getScoreClass(summary.securityScore)}">
          <span class="score-value">${summary.securityScore}</span>
        </div>
        <div class="score-label">Security Score</div>
      </div>
      
      <div class="security-stats">
        <div class="stat-item">
          <i class="fas fa-shield-alt ${summary.twoFactorAuth.enabled ? 'enabled' : 'disabled'}"></i>
          <span class="stat-label">2FA</span>
          <span class="stat-value">${summary.twoFactorAuth.enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div class="stat-item">
          <i class="fas fa-laptop"></i>
          <span class="stat-label">Active Sessions</span>
          <span class="stat-value">${summary.activeSessions}</span>
        </div>
        <div class="stat-item">
          <i class="fas fa-key"></i>
          <span class="stat-label">Backup Codes</span>
          <span class="stat-value">${summary.twoFactorAuth.remainingBackupCodes || 0}</span>
        </div>
      </div>
    </div>

    <div class="security-sections">
      <!-- 2FA Section -->
      <div class="security-section" id="twofa-section">
        <h3><i class="fas fa-shield-alt"></i> Two-Factor Authentication</h3>
        <div id="twofa-content">
          ${render2FASection(summary.twoFactorAuth)}
        </div>
      </div>

      <!-- Sessions Section -->
      <div class="security-section" id="sessions-section">
        <h3>
          <i class="fas fa-laptop"></i> Active Sessions
          <button class="btn-link" onclick="revokeAllSessionsUI()">Logout from all devices</button>
        </h3>
        <div class="sessions-list">
          ${renderSessionsList(sessions)}
        </div>
      </div>

      <!-- Audit Trail Section -->
      <div class="security-section" id="audit-section">
        <h3><i class="fas fa-history"></i> Security Activity</h3>
        <div class="audit-list">
          ${renderAuditTrail(auditTrail)}
        </div>
      </div>

      <!-- Password Section -->
      <div class="security-section" id="password-section">
        <h3><i class="fas fa-key"></i> Change Password</h3>
        <form id="change-password-form" class="password-form">
          <div class="form-group">
            <label>Current Password</label>
            <input type="password" id="current-password" required>
          </div>
          <div class="form-group">
            <label>New Password</label>
            <input type="password" id="new-password" required>
          </div>
          <div class="form-group">
            <label>Confirm New Password</label>
            <input type="password" id="confirm-password" required>
          </div>
          <button type="submit" class="btn-primary">Change Password</button>
        </form>
      </div>
    </div>
  `;

  // Bind event listeners
  bindSecurityEventListeners();
}

function render2FASection(twoFAStatus) {
  if (twoFAStatus.enabled) {
    return `
      <div class="twofa-enabled">
        <div class="status-badge success">
          <i class="fas fa-check-circle"></i> 2FA is enabled
        </div>
        <p>Enabled on: ${new Date(twoFAStatus.enabledAt).toLocaleDateString()}</p>
        <p>Backup codes remaining: <strong>${twoFAStatus.remainingBackupCodes}</strong></p>
        
        <div class="twofa-actions">
          <button class="btn-secondary" onclick="showRegenerateBackupCodes()">
            <i class="fas fa-sync"></i> Regenerate Backup Codes
          </button>
          <button class="btn-danger" onclick="showDisable2FA()">
            <i class="fas fa-times"></i> Disable 2FA
          </button>
        </div>
      </div>
    `;
  }

  return `
    <div class="twofa-disabled">
      <div class="status-badge warning">
        <i class="fas fa-exclamation-triangle"></i> 2FA is not enabled
      </div>
      <p>Protect your account with two-factor authentication. You'll need an authenticator app like Google Authenticator or Authy.</p>
      <button class="btn-primary" onclick="showSetup2FA()">
        <i class="fas fa-shield-alt"></i> Enable 2FA
      </button>
    </div>
  `;
}

function renderSessionsList(sessions) {
  if (!sessions || sessions.length === 0) {
    return '<p class="empty-state">No active sessions found</p>';
  }

  return sessions.map(session => `
    <div class="session-item ${session.isCurrent ? 'current' : ''}">
      <div class="session-device">
        <i class="fas ${getDeviceIcon(session.device.type)}"></i>
        <div class="device-info">
          <strong>${session.device.name || 'Unknown Device'}</strong>
          <span class="session-location">${session.location.ipAddress}${session.location.city ? ` • ${session.location.city}` : ''}</span>
        </div>
      </div>
      <div class="session-meta">
        <span class="session-time">Last active: ${formatRelativeTime(session.lastAccessAt)}</span>
        ${session.totpVerified ? '<span class="badge-2fa"><i class="fas fa-shield-alt"></i></span>' : ''}
        ${session.isCurrent ? '<span class="badge-current">Current</span>' : `<button class="btn-revoke" onclick="revokeSessionUI('${session.id}')"><i class="fas fa-times"></i></button>`}
      </div>
    </div>
  `).join('');
}

function renderAuditTrail(auditTrail) {
  if (!auditTrail || auditTrail.length === 0) {
    return '<p class="empty-state">No recent security activity</p>';
  }

  return auditTrail.map(log => `
    <div class="audit-item ${log.status === 'failure' ? 'failed' : ''}">
      <div class="audit-icon ${getAuditIconClass(log.action)}">
        <i class="fas ${getAuditIcon(log.action)}"></i>
      </div>
      <div class="audit-content">
        <strong>${log.description}</strong>
        <span class="audit-meta">${formatRelativeTime(log.timestamp)} • ${log.ipAddress || 'Unknown IP'}</span>
      </div>
      <div class="audit-status ${log.status}">
        ${log.status === 'success' ? '<i class="fas fa-check"></i>' : '<i class="fas fa-times"></i>'}
      </div>
    </div>
  `).join('');
}

// ============================================
// 2FA Setup Flow
// ============================================

async function showSetup2FA() {
  try {
    const data = await setup2FA();
    
    const modal = createModal('setup-2fa-modal', `
      <div class="setup-2fa-content">
        <h2>Set Up Two-Factor Authentication</h2>
        
        <div class="setup-steps">
          <div class="step">
            <h3>Step 1: Scan QR Code</h3>
            <p>Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
            <div class="qr-code">
              <img src="${data.qrCode}" alt="QR Code">
            </div>
          </div>
          
          <div class="step">
            <h3>Or Enter Manually</h3>
            <p>Account: <strong>${data.manualEntry.account}</strong></p>
            <p>Key: <code class="secret-key">${data.manualEntry.key}</code></p>
          </div>
          
          <div class="step">
            <h3>Step 2: Verify</h3>
            <p>Enter the 6-digit code from your authenticator app:</p>
            <input type="text" id="verify-2fa-token" class="totp-input" maxlength="6" pattern="[0-9]{6}" placeholder="000000">
            <button class="btn-primary" onclick="verify2FASetupUI()">Verify & Enable</button>
          </div>
        </div>
      </div>
    `);
    
    document.body.appendChild(modal);
    document.getElementById('verify-2fa-token').focus();
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

async function verify2FASetupUI() {
  const token = document.getElementById('verify-2fa-token').value;
  
  if (!token || token.length !== 6) {
    showNotification('Please enter a valid 6-digit code', 'error');
    return;
  }

  try {
    const result = await verify2FASetup(token);
    closeModal('setup-2fa-modal');
    
    // Show backup codes
    showBackupCodesModal(result.backupCodes);
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

function showBackupCodesModal(codes) {
  const modal = createModal('backup-codes-modal', `
    <div class="backup-codes-content">
      <h2><i class="fas fa-key"></i> Save Your Backup Codes</h2>
      <p class="warning"><i class="fas fa-exclamation-triangle"></i> Save these codes in a secure place. Each code can only be used once.</p>
      
      <div class="backup-codes-grid">
        ${codes.map((code, i) => `<div class="backup-code">${i + 1}. ${code}</div>`).join('')}
      </div>
      
      <div class="backup-actions">
        <button class="btn-secondary" onclick="copyBackupCodes('${codes.join('\\n')}')">
          <i class="fas fa-copy"></i> Copy All
        </button>
        <button class="btn-secondary" onclick="downloadBackupCodes('${codes.join('\\n')}')">
          <i class="fas fa-download"></i> Download
        </button>
      </div>
      
      <button class="btn-primary" onclick="closeModal('backup-codes-modal'); showSecurityDashboard();">
        I've Saved My Codes
      </button>
    </div>
  `);
  
  document.body.appendChild(modal);
}

async function showDisable2FA() {
  const modal = createModal('disable-2fa-modal', `
    <div class="disable-2fa-content">
      <h2><i class="fas fa-exclamation-triangle"></i> Disable 2FA</h2>
      <p class="warning">Disabling 2FA will make your account less secure. Are you sure?</p>
      
      <div class="form-group">
        <label>Enter your password to confirm:</label>
        <input type="password" id="disable-2fa-password" placeholder="Your password">
      </div>
      
      <div class="modal-actions">
        <button class="btn-secondary" onclick="closeModal('disable-2fa-modal')">Cancel</button>
        <button class="btn-danger" onclick="disable2FAUI()">Disable 2FA</button>
      </div>
    </div>
  `);
  
  document.body.appendChild(modal);
}

async function disable2FAUI() {
  const password = document.getElementById('disable-2fa-password').value;
  
  if (!password) {
    showNotification('Please enter your password', 'error');
    return;
  }

  try {
    await disable2FA(password);
    closeModal('disable-2fa-modal');
    showNotification('2FA has been disabled', 'success');
    showSecurityDashboard();
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

async function showRegenerateBackupCodes() {
  const modal = createModal('regenerate-codes-modal', `
    <div class="regenerate-codes-content">
      <h2>Regenerate Backup Codes</h2>
      <p class="warning"><i class="fas fa-exclamation-triangle"></i> This will invalidate all existing backup codes.</p>
      
      <div class="form-group">
        <label>Enter a 2FA code to confirm:</label>
        <input type="text" id="regenerate-token" class="totp-input" maxlength="6" pattern="[0-9]{6}" placeholder="000000">
      </div>
      
      <div class="modal-actions">
        <button class="btn-secondary" onclick="closeModal('regenerate-codes-modal')">Cancel</button>
        <button class="btn-primary" onclick="regenerateBackupCodesUI()">Regenerate</button>
      </div>
    </div>
  `);
  
  document.body.appendChild(modal);
}

async function regenerateBackupCodesUI() {
  const token = document.getElementById('regenerate-token').value;
  
  if (!token || token.length !== 6) {
    showNotification('Please enter a valid 6-digit code', 'error');
    return;
  }

  try {
    const result = await regenerateBackupCodes(token);
    closeModal('regenerate-codes-modal');
    showBackupCodesModal(result.backupCodes);
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

// ============================================
// Session Management UI
// ============================================

async function revokeSessionUI(sessionId) {
  if (!confirm('Are you sure you want to log out this session?')) return;

  try {
    await revokeSession(sessionId);
    showNotification('Session logged out successfully', 'success');
    showSecurityDashboard();
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

async function revokeAllSessionsUI() {
  if (!confirm('This will log you out from all other devices. Continue?')) return;

  try {
    const result = await revokeAllSessions();
    showNotification(result.message, 'success');
    showSecurityDashboard();
  } catch (error) {
    showNotification(error.message, 'error');
  }
}

// ============================================
// Helper Functions
// ============================================

function bindSecurityEventListeners() {
  const passwordForm = document.getElementById('change-password-form');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const currentPwd = document.getElementById('current-password').value;
      const newPwd = document.getElementById('new-password').value;
      const confirmPwd = document.getElementById('confirm-password').value;
      
      if (newPwd !== confirmPwd) {
        showNotification('New passwords do not match', 'error');
        return;
      }

      try {
        await changePassword(currentPwd, newPwd);
        showNotification('Password changed successfully', 'success');
        passwordForm.reset();
      } catch (error) {
        showNotification(error.message, 'error');
      }
    });
  }
}

function createModal(id, content) {
  const modal = document.createElement('div');
  modal.id = id;
  modal.className = 'security-modal';
  modal.innerHTML = `
    <div class="modal-overlay" onclick="closeModal('${id}')"></div>
    <div class="modal-content">
      <button class="modal-close" onclick="closeModal('${id}')">&times;</button>
      ${content}
    </div>
  `;
  return modal;
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.remove();
}

function copyBackupCodes(codes) {
  navigator.clipboard.writeText(codes.replace(/\\n/g, '\n'))
    .then(() => showNotification('Backup codes copied!', 'success'))
    .catch(() => showNotification('Failed to copy', 'error'));
}

function downloadBackupCodes(codes) {
  const blob = new Blob([codes.replace(/\\n/g, '\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'expenseflow-backup-codes.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function getScoreClass(score) {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

function getDeviceIcon(type) {
  const icons = {
    desktop: 'fa-desktop',
    mobile: 'fa-mobile-alt',
    tablet: 'fa-tablet-alt',
    unknown: 'fa-laptop'
  };
  return icons[type] || icons.unknown;
}

function getAuditIcon(action) {
  const icons = {
    user_login: 'fa-sign-in-alt',
    user_logout: 'fa-sign-out-alt',
    login_failed: 'fa-times-circle',
    totp_enabled: 'fa-shield-alt',
    totp_disabled: 'fa-shield-alt',
    totp_verified: 'fa-check-circle',
    totp_failed: 'fa-times-circle',
    session_revoked: 'fa-laptop',
    password_changed: 'fa-key'
  };
  return icons[action] || 'fa-circle';
}

function getAuditIconClass(action) {
  if (action.includes('failed') || action.includes('blocked')) return 'danger';
  if (action.includes('enabled') || action.includes('verified') || action === 'user_login') return 'success';
  if (action.includes('disabled') || action.includes('revoked')) return 'warning';
  return 'info';
}

function formatRelativeTime(date) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

// Notification system
if (!window.showNotification) {
  window.showNotification = function (message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '1rem',
      borderRadius: '5px',
      color: 'white',
      background: type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3',
      zIndex: '10000',
      animation: 'slideIn 0.3s ease'
    });

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  };
}

// Initialize authentication
function initAuth() {
  if (!authToken || !currentUser) {
    showAuthForm();
    return false;
  }

  // Add logout button to existing UI
  const header = document.querySelector('header') || document.querySelector('.header');
  if (header) {
    const userControls = document.createElement('div');
    userControls.className = 'user-controls';
    userControls.innerHTML = `
      <button onclick="showSecurityDashboard()" class="security-btn" title="Security Settings">
        <i class="fas fa-shield-alt"></i>
      </button>
      <span class="user-name">${currentUser.name}</span>
      <button onclick="logout()" class="logout-btn" title="Logout">
        <i class="fas fa-sign-out-alt"></i>
      </button>
    `;
    userControls.style.cssText = 'position: absolute; top: 10px; right: 10px; display: flex; align-items: center; gap: 10px;';
    header.appendChild(userControls);
  }

  return true;
}

// Check authentication on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    login, logout, register, verify2FA,
    setup2FA, verify2FASetup, disable2FA, get2FAStatus,
    getActiveSessions, revokeSession, revokeAllSessions,
    getSecuritySummary, getAuditTrail, changePassword
  };
}