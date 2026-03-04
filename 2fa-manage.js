/**
 * 2FA Management Dashboard JavaScript
 * Issue #503: 2FA Management
 */

let currentDeviceId = null;
let twoFAStatus = {};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadTwoFAStatus();
    loadTrustedDevices();
    loadActivityLog();
});

/**
 * Load 2FA status
 */
async function loadTwoFAStatus() {
    try {
        const response = await fetch('/api/2fa/status', {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load 2FA status');
        }

        twoFAStatus = await response.json();
        displayTwoFAStatus();
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('status-info').innerHTML = '<p class="error-message">Failed to load 2FA status</p>';
    }
}

/**
 * Display 2FA status
 */
function displayTwoFAStatus() {
    const statusCard = document.getElementById('status-info');
    const enableCard = document.getElementById('enable-disable-card');
    const disableCard = document.getElementById('disable-card');
    const backupCodesCard = document.getElementById('backup-codes-card');
    const methodCard = document.getElementById('method-card');
    const adaptiveCard = document.getElementById('adaptive-mfa-card');

    if (twoFAStatus.enabled) {
        // Show 2FA enabled status
        let html = `
            <div class="status-badge enabled">✓ 2FA Enabled</div>
            <div class="status-details">
                <div class="detail-item">
                    <span class="detail-label">Method:</span>
                    <span class="detail-value">${capitalize(twoFAStatus.method)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Enrolled:</span>
                    <span class="detail-value">${new Date(twoFAStatus.enrolledAt).toLocaleDateString()}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Last Used:</span>
                    <span class="detail-value">${twoFAStatus.lastUsedAt ? new Date(twoFAStatus.lastUsedAt).toLocaleDateString() : 'Never'}</span>
                </div>
            </div>
        `;
        statusCard.innerHTML = html;
        enableCard.style.display = 'none';
        disableCard.style.display = 'block';
        backupCodesCard.style.display = 'block';
        methodCard.style.display = 'block';
        adaptiveCard.style.display = 'block'; // Show adaptive MFA card

        displayBackupCodesInfo();
        displayMethodInfo();
    } else {
        // Show 2FA disabled status
        let html = `
            <div class="status-badge disabled">✗ 2FA Disabled</div>
            <p style="margin-top: 16px; color: var(--text-light);">
                Two-factor authentication is not enabled on your account. Enable it to secure your account.
            </p>
        `;
        statusCard.innerHTML = html;
        enableCard.style.display = 'block';
        disableCard.style.display = 'none';
        backupCodesCard.style.display = 'none';
        methodCard.style.display = 'none';
        adaptiveCard.style.display = 'none'; // Hide adaptive MFA card
    }
}

/**
 * Display backup codes info
 */
function displayBackupCodesInfo() {
    const codesCard = document.getElementById('backup-codes-info');
    const remaining = twoFAStatus.backupCodesRemaining || 0;

    let html = `
        <div class="backup-codes-status">
            <span class="backup-codes-count">${remaining} backup codes remaining</span>
        </div>
    `;

    if (remaining <= 3) {
        html += `
            <div class="warning">
                ⚠️ Low on backup codes. Consider regenerating new ones.
            </div>
        `;
    }

    codesCard.innerHTML = html;
}

/**
 * Display method info
 */
function displayMethodInfo() {
    const methodInfo = document.getElementById('method-info');

    const methodIcons = {
        'totp': '📱',
        'sms': '💬',
        'email': '✉️',
        'backup-codes': '🔐'
    };

    const methodNames = {
        'totp': 'Authenticator App (TOTP)',
        'sms': 'SMS Text Message',
        'email': 'Email Verification',
        'backup-codes': 'Backup Codes'
    };

    const icon = methodIcons[twoFAStatus.method] || '🔒';
    const name = methodNames[twoFAStatus.method] || 'Unknown';

    let html = `
        <div class="method-item">
            <div class="method-icon">${icon}</div>
            <div>
                <strong>${name}</strong><br>
                <small style="color: var(--text-light);">Currently using this method</small>
            </div>
        </div>
    `;

    methodInfo.innerHTML = html;
}

/**
 * Load trusted devices
 */
async function loadTrustedDevices() {
    try {
        const response = await fetch('/api/2fa/trusted-devices', {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load devices');
        }

        const devices = await response.json();
        displayTrustedDevices(devices);
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('devices-list').innerHTML = '<p class="error-message">Failed to load devices</p>';
    }
}

/**
 * Display trusted devices
 */
function displayTrustedDevices(devices) {
    const list = document.getElementById('devices-list');

    if (devices.length === 0) {
        list.innerHTML = '<p style="color: var(--text-light);">No trusted devices yet.</p>';
        return;
    }

    let html = '';
    devices.forEach(device => {
        const icon = getDeviceIcon(device.deviceType);
        const isTrusted = !device.trustExpiresAt || new Date(device.trustExpiresAt) > new Date();

        html += `
            <div class="device-item">
                <div class="device-info">
                    <div class="device-name">
                        <span class="device-icon">${icon}</span>
                        <span>${device.deviceName}</span>
                    </div>
                    <div class="device-details">
                        <div>${device.os} • ${device.browser}</div>
                        <div>IP: ${device.ipAddress}</div>
                        ${device.location?.city ? `<div>${device.location.city}, ${device.location.country}</div>` : ''}
                        <div>Last used: ${new Date(device.lastUsedAt).toLocaleDateString()}</div>
                        <div class="device-status">
                            ${device.isVerified ? '<span class="status-tag verified">Verified</span>' : '<span class="status-tag unverified">Unverified</span>'}
                            ${isTrusted && device.isVerified ? '<span class="status-tag trusted">Trusted</span>' : ''}
                            ${device.isCompromised ? '<span class="status-tag unverified">Compromised</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="device-actions">
                    <button class="btn-icon" onclick="removeDevice('${device.deviceId}')">🗑️ Remove</button>
                </div>
            </div>
        `;
    });

    list.innerHTML = html;
}

/**
 * Get device icon based on type
 */
function getDeviceIcon(type) {
    const icons = {
        'desktop': '🖥️',
        'mobile': '📱',
        'tablet': '📱',
        'unknown': '💻'
    };
    return icons[type] || '💻';
}

/**
 * Load activity log
 */
async function loadActivityLog() {
    try {
        const response = await fetch('/api/2fa/audit-log', {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load activity');
        }

        const logs = await response.json();
        displayActivityLog(logs);
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('activity-log').innerHTML = '<p class="error-message">Failed to load activity</p>';
    }
}

/**
 * Display activity log
 */
function displayActivityLog(logs) {
    const log = document.getElementById('activity-log');

    if (logs.length === 0) {
        log.innerHTML = '<p style="color: var(--text-light);">No security activity yet.</p>';
        return;
    }

    let html = '';
    logs.forEach(entry => {
        const action = formatAction(entry.action);
        const icon = getActionIcon(entry.action);
        const date = new Date(entry.createdAt);

        html += `
            <div class="activity-item">
                <div class="activity-icon">${icon}</div>
                <div class="activity-content">
                    <div class="activity-action">${action}</div>
                    <div class="activity-time">${date.toLocaleDateString()} at ${date.toLocaleTimeString()}</div>
                </div>
            </div>
        `;
    });

    log.innerHTML = html;
}

/**
 * Format action name
 */
function formatAction(action) {
    const actions = {
        '2FA_ENABLED': '2FA Enabled',
        '2FA_DISABLED': '2FA Disabled',
        '2FA_SETUP_COMPLETED': '2FA Setup Completed',
        '2FA_METHOD_SWITCHED': '2FA Method Changed',
        '2FA_BACKUP_CODE_USED': 'Backup Code Used',
        '2FA_BACKUP_CODES_REGENERATED': 'Backup Codes Regenerated',
        '2FA_RECOVERY_EMAIL_SET': 'Recovery Email Set',
        'TRUSTED_DEVICE_ADDED': 'Device Added',
        'TRUSTED_DEVICE_VERIFIED': 'Device Verified',
        'TRUSTED_DEVICE_REMOVED': 'Device Removed'
    };
    return actions[action] || action;
}

/**
 * Get action icon
 */
function getActionIcon(action) {
    const icons = {
        '2FA_ENABLED': '🔒',
        '2FA_DISABLED': '🔓',
        '2FA_SETUP_COMPLETED': '✓',
        '2FA_METHOD_SWITCHED': '🔄',
        '2FA_BACKUP_CODE_USED': '💾',
        '2FA_BACKUP_CODES_REGENERATED': '🔄',
        '2FA_RECOVERY_EMAIL_SET': '✉️',
        'TRUSTED_DEVICE_ADDED': '➕',
        'TRUSTED_DEVICE_VERIFIED': '✓',
        'TRUSTED_DEVICE_REMOVED': '✖️'
    };
    return icons[action] || '📌';
}

/**
 * Start 2FA setup
 */
function startTwoFASetup() {
    window.location.href = '/2fa-setup.html';
}

/**
 * Show disable confirmation
 */
function showDisableConfirm() {
    openModal('disable-modal');
}

/**
 * Confirm disable 2FA
 */
async function confirmDisable() {
    const password = document.getElementById('disable-password').value;

    if (!password) {
        alert('Please enter your password');
        return;
    }

    try {
        const response = await fetch('/api/2fa/disable', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ password })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to disable 2FA');
        }

        alert('2FA has been disabled');
        closeModal();
        loadTwoFAStatus();
    } catch (error) {
        console.error('Error:', error);
        alert(error.message || 'Failed to disable 2FA');
    }
}

/**
 * Regenerate backup codes
 */
async function regenerateBackupCodes() {
    if (!confirm('Are you sure? Old backup codes will be invalidated.')) {
        return;
    }

    try {
        const response = await fetch('/api/2fa/backup-codes/regenerate', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to regenerate codes');
        }

        const data = await response.json();
        alert('Backup codes regenerated. Make sure to save them.');
        loadTwoFAStatus();
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to regenerate backup codes');
    }
}

/**
 * Download backup codes
 */
async function downloadBackupCodes() {
    try {
        const response = await fetch('/api/2fa/backup-codes/download', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to download codes');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'backup-codes.txt';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to download backup codes');
    }
}

/**
 * Print backup codes
 */
function printBackupCodes() {
    const printWindow = window.open('', '', 'height=400,width=600');
    printWindow.document.write('<pre>');
    printWindow.document.write('ExpenseFlow Backup Codes\n');
    printWindow.document.write('======================\n\n');
    printWindow.document.write('Keep these codes safe. Each code can only be used once.\n\n');
    printWindow.document.write('</pre>');
    printWindow.document.close();
    printWindow.print();
}

/**
 * Switch 2FA method
 */
async function switchTwoFAMethod() {
    const method = prompt('Enter new method (totp, sms, email):');
    if (!method) return;

    try {
        const response = await fetch('/api/2fa/method/switch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ method })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to switch method');
        }

        alert('2FA method switched successfully');
        loadTwoFAStatus();
    } catch (error) {
        console.error('Error:', error);
        alert(error.message || 'Failed to switch method');
    }
}

/**
 * Add new device
 */
function addNewDevice() {
    const deviceName = prompt('Enter device name:');
    if (!deviceName) return;

    addTrustedDevice(deviceName);
}

/**
 * Add trusted device
 */
async function addTrustedDevice(deviceName) {
    try {
        const response = await fetch('/api/2fa/trusted-devices', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`,
                'X-Device-Fingerprint': getDeviceFingerprint(),
                'X-Device-Name': deviceName
            }
        });

        if (!response.ok) {
            throw new Error('Failed to add device');
        }

        const data = await response.json();
        currentDeviceId = data.deviceId;
        openModal('verify-device-modal');
    } catch (error) {
        console.error('Error:', error);
        alert(error.message || 'Failed to add device');
    }
}

/**
 * Confirm verify device
 */
async function confirmVerifyDevice() {
    const code = document.getElementById('verify-code').value;

    if (!code || code.length !== 6) {
        showVerifyError('Please enter a valid 6-digit code');
        return;
    }

    try {
        const response = await fetch(`/api/2fa/trusted-devices/${currentDeviceId}/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ verificationCode: code })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Invalid code');
        }

        alert('Device verified successfully');
        closeModal();
        loadTrustedDevices();
    } catch (error) {
        console.error('Error:', error);
        showVerifyError(error.message || 'Failed to verify device');
    }
}

/**
 * Show verify error
 */
function showVerifyError(message) {
    const error = document.getElementById('verify-error');
    error.textContent = message;
    error.classList.add('show');
}

/**
 * Remove device
 */
async function removeDevice(deviceId) {
    if (!confirm('Remove this device?')) return;

    try {
        const response = await fetch(`/api/2fa/trusted-devices/${deviceId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to remove device');
        }

        alert('Device removed');
        loadTrustedDevices();
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to remove device');
    }
}

/**
 * Set recovery email
 */
function setRecoveryEmail() {
    openModal('recovery-email-modal');
}

/**
 * Confirm recovery email
 */
async function confirmRecoveryEmail() {
    const email = document.getElementById('recovery-email').value;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showRecoveryError('Please enter a valid email');
        return;
    }

    try {
        const response = await fetch('/api/2fa/recovery-email/set', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ email })
        });

        if (!response.ok) {
            throw new Error('Failed to set recovery email');
        }

        alert('Recovery email set successfully');
        closeModal();
    } catch (error) {
        console.error('Error:', error);
        showRecoveryError(error.message || 'Failed to set recovery email');
    }
}

/**
 * Show recovery error
 */
function showRecoveryError(message) {
    const error = document.getElementById('recovery-error');
    error.textContent = message;
    error.classList.add('show');
}

/**
 * Open modal
 */
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

/**
 * Close modal
 */
function closeModal() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
    document.getElementById('disable-password').value = '';
    document.getElementById('verify-code').value = '';
    document.getElementById('recovery-email').value = '';
    document.getElementById('verify-error').classList.remove('show');
    document.getElementById('recovery-error').classList.remove('show');
});

// ============================================
// Adaptive MFA Functions
// Issue #871: Adaptive MFA Orchestrator
// ============================================

let adaptiveSettings = {};

/**
 * Load adaptive MFA status
 */
async function loadAdaptiveStatus() {
    try {
        const response = await fetch('/api/2fa/adaptive/status', {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load adaptive MFA status');
        }

        adaptiveSettings = await response.json();
        displayAdaptiveStatus();
    } catch (error) {
        console.error('Error loading adaptive status:', error);
        document.getElementById('adaptive-status').innerHTML = '<p class="error-message">Failed to load adaptive settings</p>';
    }
}

/**
 * Display adaptive MFA status
 */
function displayAdaptiveStatus() {
    const statusDiv = document.getElementById('adaptive-status');
    const controlsDiv = document.getElementById('adaptive-controls');

    if (!adaptiveSettings.enabled) {
        statusDiv.innerHTML = '<p class="warning">Enable 2FA first to use adaptive features</p>';
        return;
    }

    let html = `
        <div class="adaptive-status-info">
            <div class="status-item">
                <span class="status-label">Adaptive MFA:</span>
                <span class="status-value ${adaptiveSettings.adaptiveEnabled ? 'enabled' : 'disabled'}">
                    ${adaptiveSettings.adaptiveEnabled ? '✓ Enabled' : '✗ Disabled'}
                </span>
            </div>
            <div class="status-item">
                <span class="status-label">Available Methods:</span>
                <span class="status-value">${adaptiveSettings.availableMethods.length}</span>
            </div>
        </div>
    `;

    statusDiv.innerHTML = html;
    controlsDiv.style.display = 'block';

    // Update form controls
    document.getElementById('adaptive-enabled').checked = adaptiveSettings.adaptiveEnabled;

    if (adaptiveSettings.settings?.confidenceThresholds) {
        document.getElementById('high-threshold').value = adaptiveSettings.settings.confidenceThresholds.high;
        document.getElementById('medium-threshold').value = adaptiveSettings.settings.confidenceThresholds.medium;
        updateThresholdDisplay('high');
        updateThresholdDisplay('medium');
    }

    // Show settings if adaptive is enabled
    document.getElementById('adaptive-settings').style.display = adaptiveSettings.adaptiveEnabled ? 'block' : 'none';

    // Load available methods
    displayAvailableMethods();
}

/**
 * Display available MFA methods
 */
function displayAvailableMethods() {
    const methodsDiv = document.getElementById('method-grid');

    if (adaptiveSettings.availableMethods.length === 0) {
        methodsDiv.innerHTML = '<p>No MFA methods configured yet</p>';
        return;
    }

    const methodConfig = {
        totp: { name: 'TOTP', icon: '⏰', description: 'Time-based one-time password' },
        webauthn: { name: 'WebAuthn', icon: '🔐', description: 'Hardware security key' },
        push: { name: 'Push', icon: '📱', description: 'Push notification approval' },
        knowledge: { name: 'Knowledge', icon: '🧠', description: 'Security questions' },
        biometric: { name: 'Biometric', icon: '👆', description: 'Fingerprint/Face ID' }
    };

    let html = '';
    adaptiveSettings.availableMethods.forEach(method => {
        const config = methodConfig[method] || { name: method, icon: '❓', description: 'Unknown method' };
        html += `
            <div class="method-item ${method}">
                <div class="method-icon">${config.icon}</div>
                <div class="method-details">
                    <h4>${config.name}</h4>
                    <p>${config.description}</p>
                </div>
                <div class="method-status">✓ Configured</div>
            </div>
        `;
    });

    methodsDiv.innerHTML = html;
}

/**
 * Toggle adaptive MFA
 */
async function toggleAdaptiveMFA() {
    const enabled = document.getElementById('adaptive-enabled').checked;

    try {
        const response = await fetch('/api/2fa/adaptive/settings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ adaptiveEnabled: enabled })
        });

        if (!response.ok) {
            throw new Error('Failed to update adaptive MFA settings');
        }

        adaptiveSettings.adaptiveEnabled = enabled;
        document.getElementById('adaptive-settings').style.display = enabled ? 'block' : 'none';

        showNotification(enabled ? 'Adaptive MFA enabled' : 'Adaptive MFA disabled', 'success');
    } catch (error) {
        console.error('Error toggling adaptive MFA:', error);
        document.getElementById('adaptive-enabled').checked = !enabled; // Revert
        showNotification('Failed to update adaptive MFA settings', 'error');
    }
}

/**
 * Update threshold display
 */
function updateThresholdDisplay(level) {
    const slider = document.getElementById(`${level}-threshold`);
    const display = document.getElementById(`${level}-threshold-value`);
    display.textContent = slider.value;
}

/**
 * Save adaptive settings
 */
async function saveAdaptiveSettings() {
    const highThreshold = parseFloat(document.getElementById('high-threshold').value);
    const mediumThreshold = parseFloat(document.getElementById('medium-threshold').value);

    if (mediumThreshold >= highThreshold) {
        showNotification('Medium threshold must be lower than high threshold', 'error');
        return;
    }

    try {
        const response = await fetch('/api/2fa/adaptive/settings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                confidenceThresholds: {
                    high: highThreshold,
                    medium: mediumThreshold,
                    low: mediumThreshold * 0.5 // Auto-calculate low threshold
                }
            })
        });

        if (!response.ok) {
            throw new Error('Failed to save adaptive settings');
        }

        showNotification('Adaptive MFA settings saved successfully', 'success');
        loadAdaptiveStatus(); // Refresh
    } catch (error) {
        console.error('Error saving adaptive settings:', error);
        showNotification('Failed to save adaptive MFA settings', 'error');
    }
}

/**
 * Test confidence scoring
 */
async function testConfidenceScoring() {
    const resultDiv = document.getElementById('confidence-result');

    try {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<div class="loading">Testing confidence scoring...</div>';

        const response = await fetch('/api/2fa/adaptive/test-confidence', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                location: {} // Will be filled by backend
            })
        });

        if (!response.ok) {
            throw new Error('Failed to test confidence scoring');
        }

        const result = await response.json();

        let html = `
            <h4>Confidence Analysis Results</h4>
            <div class="confidence-score">
                <div class="score-circle" style="background: conic-gradient(var(--primary-color) 0% ${result.confidence.score * 100}%, #e0e0e0 ${result.confidence.score * 100}% 100%)">
                    <span class="score-text">${Math.round(result.confidence.score * 100)}%</span>
                </div>
                <div class="score-details">
                    <div class="risk-level">Risk Level: <strong>${getRiskLevelText(result.confidence.score)}</strong></div>
                    <div class="decision">MFA Required: <strong>${result.decision.required ? 'Yes' : 'No'}</strong></div>
                </div>
            </div>
            <div class="confidence-factors">
                <h5>Contributing Factors:</h5>
                <ul>
        `;

        for (const [factor, value] of Object.entries(result.confidence.factors)) {
            if (value !== undefined) {
                html += `<li><strong>${factor}:</strong> ${Math.round(value * 100)}%</li>`;
            }
        }

        html += `
                </ul>
            </div>
            <div class="confidence-reasoning">
                <h5>Reasoning:</h5>
                <ul>
        `;

        result.confidence.reasoning.forEach(reason => {
            html += `<li>${reason}</li>`;
        });

        html += `
                </ul>
            </div>
        `;

        resultDiv.innerHTML = html;
    } catch (error) {
        console.error('Error testing confidence scoring:', error);
        resultDiv.innerHTML = '<p class="error-message">Failed to test confidence scoring</p>';
    }
}

/**
 * Get risk level text
 */
function getRiskLevelText(score) {
    if (score >= 0.8) return 'Low Risk';
    if (score >= 0.5) return 'Medium Risk';
    return 'High Risk';
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    // Simple notification - you might want to enhance this
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 4px;
        color: white;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

/**
 * Get device fingerprint
 */
function getDeviceFingerprint() {
    // Simple fingerprint - in production use a proper library
    return btoa(navigator.userAgent + navigator.language);
}

/**
 * Get JWT token
 */
function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
}

/**
 * Capitalize string
 */
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Initialize adaptive MFA when page loads
document.addEventListener('DOMContentLoaded', () => {
    loadTwoFAStatus();
    loadTrustedDevices();
    loadActivityLog();
    loadAdaptiveStatus(); // Add this line
});

// Close modals when clicking outside
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        closeModal();
    }
});
