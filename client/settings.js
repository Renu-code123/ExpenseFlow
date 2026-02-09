/**
 * Notification Settings Panel
 * Handles user preferences for multi-channel notifications
 */

class NotificationSettingsController {
  constructor() {
    this.preferences = null;
    this.eventTypes = {};
    this.modal = null;
    this.vapidKey = null;
    this.isLoading = false;
    this.init();
  }

  async init() {
    await this.loadEventTypes();
    this.createModal();
    this.attachEventListeners();
  }

  async loadEventTypes() {
    // Event type definitions with descriptions
    this.eventTypes = {
      budget_alert: {
        name: 'Budget Alert',
        description: 'When spending exceeds budget threshold',
        icon: '💰'
      },
      budget_breach: {
        name: 'Budget Breach',
        description: 'When budget limit is exceeded',
        icon: '🚨'
      },
      goal_achieved: {
        name: 'Goal Achieved',
        description: 'When a savings goal is reached',
        icon: '🎉'
      },
      goal_progress: {
        name: 'Goal Progress',
        description: 'Weekly progress updates on goals',
        icon: '📈'
      },
      expense_added: {
        name: 'Expense Added',
        description: 'When a new expense is recorded',
        icon: '💳'
      },
      recurring_reminder: {
        name: 'Recurring Bill Reminder',
        description: 'Upcoming recurring expense reminder',
        icon: '🔔'
      },
      recurring_processed: {
        name: 'Recurring Expense Processed',
        description: 'When a recurring expense is auto-processed',
        icon: '🔄'
      },
      security_alert: {
        name: 'Security Alert',
        description: 'Security-related notifications',
        icon: '🔐'
      },
      payment_received: {
        name: 'Payment Received',
        description: 'When split payment is received',
        icon: '✅'
      },
      payment_reminder: {
        name: 'Payment Reminder',
        description: 'Reminder to pay split expenses',
        icon: '⏰'
      },
      report_ready: {
        name: 'Report Ready',
        description: 'When a financial report is generated',
        icon: '📊'
      },
      insight_generated: {
        name: 'Financial Insight',
        description: 'AI-generated financial insights',
        icon: '💡'
      },
      anomaly_detected: {
        name: 'Anomaly Detected',
        description: 'Unusual spending pattern detected',
        icon: '⚠️'
      }
    };
  }

  createModal() {
    const modalHTML = `
      <div id="notificationSettingsModal" class="settings-modal">
        <div class="settings-modal-content">
          <div class="settings-modal-header">
            <h2>🔔 Notification Preferences</h2>
            <button class="settings-modal-close" aria-label="Close">&times;</button>
          </div>
          
          <div class="settings-modal-body">
            <div class="settings-loading" id="settingsLoading">
              <div class="settings-spinner"></div>
              <p>Loading preferences...</p>
            </div>
            
            <div class="settings-content" id="settingsContent" style="display: none;">
              <!-- Channel Section: Email -->
              <div class="settings-section">
                <div class="settings-section-header">
                  <div class="channel-toggle">
                    <span class="channel-icon">📧</span>
                    <span class="channel-name">Email Notifications</span>
                    <label class="toggle-switch">
                      <input type="checkbox" id="emailEnabled">
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                </div>
                <div class="settings-section-content" id="emailSettings">
                  <p class="settings-help-text">Select which notifications to receive via email:</p>
                  <div class="notification-types" id="emailTypes"></div>
                </div>
              </div>

              <!-- Channel Section: Push -->
              <div class="settings-section">
                <div class="settings-section-header">
                  <div class="channel-toggle">
                    <span class="channel-icon">🔔</span>
                    <span class="channel-name">Push Notifications</span>
                    <label class="toggle-switch">
                      <input type="checkbox" id="pushEnabled">
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                </div>
                <div class="settings-section-content" id="pushSettings">
                  <div class="push-subscription-status" id="pushStatus">
                    <span class="status-text">Not subscribed</span>
                    <button class="btn btn-sm btn-primary" id="subscribePushBtn">Enable Push</button>
                  </div>
                  <p class="settings-help-text">Select which notifications to receive as push:</p>
                  <div class="notification-types" id="pushTypes"></div>
                </div>
              </div>

              <!-- Channel Section: SMS -->
              <div class="settings-section">
                <div class="settings-section-header">
                  <div class="channel-toggle">
                    <span class="channel-icon">📱</span>
                    <span class="channel-name">SMS Notifications</span>
                    <label class="toggle-switch">
                      <input type="checkbox" id="smsEnabled">
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                </div>
                <div class="settings-section-content" id="smsSettings">
                  <div class="form-group">
                    <label for="smsPhoneNumber">Phone Number</label>
                    <input type="tel" id="smsPhoneNumber" placeholder="+1234567890" class="form-control">
                    <small class="form-text">Include country code (e.g., +1 for US)</small>
                  </div>
                  <p class="settings-help-text">SMS is best for critical alerts. Select notifications:</p>
                  <div class="notification-types" id="smsTypes"></div>
                </div>
              </div>

              <!-- Channel Section: Webhook -->
              <div class="settings-section">
                <div class="settings-section-header">
                  <div class="channel-toggle">
                    <span class="channel-icon">🔗</span>
                    <span class="channel-name">Webhook Integration</span>
                    <label class="toggle-switch">
                      <input type="checkbox" id="webhookEnabled">
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                </div>
                <div class="settings-section-content" id="webhookSettings">
                  <div class="form-group">
                    <label for="webhookUrl">Webhook URL</label>
                    <input type="url" id="webhookUrl" placeholder="https://your-server.com/webhook" class="form-control">
                  </div>
                  <div class="form-group">
                    <label for="webhookSecret">Secret Key (for signature verification)</label>
                    <input type="password" id="webhookSecret" placeholder="Optional secret for HMAC signature" class="form-control">
                  </div>
                  <p class="settings-help-text">Select which events to send to your webhook:</p>
                  <div class="notification-types" id="webhookTypes"></div>
                </div>
              </div>

              <!-- Quiet Hours Section -->
              <div class="settings-section">
                <div class="settings-section-header">
                  <div class="channel-toggle">
                    <span class="channel-icon">🌙</span>
                    <span class="channel-name">Quiet Hours</span>
                    <label class="toggle-switch">
                      <input type="checkbox" id="quietHoursEnabled">
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                </div>
                <div class="settings-section-content" id="quietHoursSettings">
                  <p class="settings-help-text">Non-critical notifications will be delayed during quiet hours:</p>
                  <div class="quiet-hours-config">
                    <div class="form-group">
                      <label for="quietStart">Start Time</label>
                      <input type="time" id="quietStart" value="22:00" class="form-control">
                    </div>
                    <div class="form-group">
                      <label for="quietEnd">End Time</label>
                      <input type="time" id="quietEnd" value="08:00" class="form-control">
                    </div>
                    <div class="form-group">
                      <label for="quietTimezone">Timezone</label>
                      <select id="quietTimezone" class="form-control">
                        <option value="UTC">UTC</option>
                        <option value="America/New_York">Eastern Time</option>
                        <option value="America/Chicago">Central Time</option>
                        <option value="America/Denver">Mountain Time</option>
                        <option value="America/Los_Angeles">Pacific Time</option>
                        <option value="Europe/London">London</option>
                        <option value="Europe/Paris">Paris</option>
                        <option value="Asia/Tokyo">Tokyo</option>
                        <option value="Asia/Shanghai">Shanghai</option>
                        <option value="Australia/Sydney">Sydney</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Test Notification -->
              <div class="settings-section">
                <div class="settings-section-header">
                  <span class="channel-icon">🧪</span>
                  <span class="channel-name">Test Notifications</span>
                </div>
                <div class="settings-section-content">
                  <p class="settings-help-text">Send a test notification to verify your settings:</p>
                  <div class="test-buttons">
                    <button class="btn btn-outline" id="testEmailBtn">Test Email</button>
                    <button class="btn btn-outline" id="testPushBtn">Test Push</button>
                    <button class="btn btn-outline" id="testSmsBtn">Test SMS</button>
                    <button class="btn btn-outline" id="testWebhookBtn">Test Webhook</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="settings-modal-footer">
            <button class="btn btn-secondary" id="cancelSettingsBtn">Cancel</button>
            <button class="btn btn-primary" id="saveSettingsBtn">
              <span class="btn-text">Save Preferences</span>
              <span class="btn-spinner" style="display: none;"></span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.modal = document.getElementById('notificationSettingsModal');
  }

  attachEventListeners() {
    // Close button
    this.modal.querySelector('.settings-modal-close').addEventListener('click', () => this.close());

    // Cancel button
    document.getElementById('cancelSettingsBtn').addEventListener('click', () => this.close());

    // Save button
    document.getElementById('saveSettingsBtn').addEventListener('click', () => this.savePreferences());

    // Close on backdrop click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    // Channel toggles
    ['email', 'push', 'sms', 'webhook', 'quietHours'].forEach(channel => {
      const toggle = document.getElementById(`${channel}Enabled`);
      const settings = document.getElementById(`${channel}Settings`);
      if (toggle && settings) {
        toggle.addEventListener('change', () => {
          settings.style.display = toggle.checked ? 'block' : 'none';
        });
      }
    });

    // Push subscription button
    document.getElementById('subscribePushBtn').addEventListener('click', () => this.subscribeToPush());

    // Test buttons
    document.getElementById('testEmailBtn').addEventListener('click', () => this.sendTestNotification('email'));
    document.getElementById('testPushBtn').addEventListener('click', () => this.sendTestNotification('push'));
    document.getElementById('testSmsBtn').addEventListener('click', () => this.sendTestNotification('sms'));
    document.getElementById('testWebhookBtn').addEventListener('click', () => this.sendTestNotification('webhook'));
  }

  async open() {
    this.modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    await this.loadPreferences();
  }

  close() {
    this.modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  async loadPreferences() {
    document.getElementById('settingsLoading').style.display = 'flex';
    document.getElementById('settingsContent').style.display = 'none';

    try {
      const response = await fetch('/api/notifications/preferences', {
        headers: this.getAuthHeaders()
      });

      if (response.ok) {
        this.preferences = await response.json();
      } else {
        this.preferences = this.getDefaultPreferences();
      }

      // Load VAPID key for push
      await this.loadVapidKey();

      this.populateForm();

      document.getElementById('settingsLoading').style.display = 'none';
      document.getElementById('settingsContent').style.display = 'block';
    } catch (error) {
      console.error('Failed to load preferences:', error);
      this.showToast('Failed to load preferences', 'error');
    }
  }

  async loadVapidKey() {
    try {
      const response = await fetch('/api/notifications/push/vapid-key', {
        headers: this.getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        this.vapidKey = data.vapidKey;
      }
    } catch (error) {
      console.error('Failed to load VAPID key:', error);
    }
  }

  getDefaultPreferences() {
    return {
      channels: {
        email: { enabled: true, types: ['budget_alert', 'budget_breach', 'goal_achieved', 'security_alert'] },
        push: { enabled: false, subscription: null, types: ['budget_alert', 'goal_achieved', 'security_alert'] },
        sms: { enabled: false, phoneNumber: null, types: ['security_alert'] },
        webhook: { enabled: false, url: null, secret: null, types: [] }
      },
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00',
        timezone: 'UTC'
      }
    };
  }

  populateForm() {
    const prefs = this.preferences;

    // Email settings
    document.getElementById('emailEnabled').checked = prefs.channels?.email?.enabled ?? true;
    this.populateNotificationTypes('email', prefs.channels?.email?.types || []);
    document.getElementById('emailSettings').style.display = prefs.channels?.email?.enabled ? 'block' : 'none';

    // Push settings
    document.getElementById('pushEnabled').checked = prefs.channels?.push?.enabled ?? false;
    this.populateNotificationTypes('push', prefs.channels?.push?.types || []);
    document.getElementById('pushSettings').style.display = prefs.channels?.push?.enabled ? 'block' : 'none';
    this.updatePushStatus();

    // SMS settings
    document.getElementById('smsEnabled').checked = prefs.channels?.sms?.enabled ?? false;
    document.getElementById('smsPhoneNumber').value = prefs.channels?.sms?.phoneNumber || '';
    this.populateNotificationTypes('sms', prefs.channels?.sms?.types || []);
    document.getElementById('smsSettings').style.display = prefs.channels?.sms?.enabled ? 'block' : 'none';

    // Webhook settings
    document.getElementById('webhookEnabled').checked = prefs.channels?.webhook?.enabled ?? false;
    document.getElementById('webhookUrl').value = prefs.channels?.webhook?.url || '';
    document.getElementById('webhookSecret').value = prefs.channels?.webhook?.secret || '';
    this.populateNotificationTypes('webhook', prefs.channels?.webhook?.types || []);
    document.getElementById('webhookSettings').style.display = prefs.channels?.webhook?.enabled ? 'block' : 'none';

    // Quiet hours
    document.getElementById('quietHoursEnabled').checked = prefs.quietHours?.enabled ?? false;
    document.getElementById('quietStart').value = prefs.quietHours?.start || '22:00';
    document.getElementById('quietEnd').value = prefs.quietHours?.end || '08:00';
    document.getElementById('quietTimezone').value = prefs.quietHours?.timezone || 'UTC';
    document.getElementById('quietHoursSettings').style.display = prefs.quietHours?.enabled ? 'block' : 'none';
  }

  populateNotificationTypes(channel, selectedTypes) {
    const container = document.getElementById(`${channel}Types`);
    container.innerHTML = '';

    Object.entries(this.eventTypes).forEach(([type, config]) => {
      const isChecked = selectedTypes.includes(type);
      const typeHTML = `
        <label class="notification-type-item">
          <input type="checkbox" name="${channel}_type_${type}" value="${type}" ${isChecked ? 'checked' : ''}>
          <span class="type-icon">${config.icon}</span>
          <div class="type-info">
            <span class="type-name">${config.name}</span>
            <span class="type-description">${config.description}</span>
          </div>
        </label>
      `;
      container.insertAdjacentHTML('beforeend', typeHTML);
    });
  }

  updatePushStatus() {
    const statusDiv = document.getElementById('pushStatus');
    const subscribeBtn = document.getElementById('subscribePushBtn');
    const hasSubscription = this.preferences?.channels?.push?.subscription;

    if (hasSubscription) {
      statusDiv.querySelector('.status-text').textContent = '✅ Subscribed';
      statusDiv.querySelector('.status-text').classList.add('subscribed');
      subscribeBtn.textContent = 'Unsubscribe';
      subscribeBtn.classList.remove('btn-primary');
      subscribeBtn.classList.add('btn-danger');
    } else {
      statusDiv.querySelector('.status-text').textContent = 'Not subscribed';
      statusDiv.querySelector('.status-text').classList.remove('subscribed');
      subscribeBtn.textContent = 'Enable Push';
      subscribeBtn.classList.add('btn-primary');
      subscribeBtn.classList.remove('btn-danger');
    }
  }

  async subscribeToPush() {
    const hasSubscription = this.preferences?.channels?.push?.subscription;

    if (hasSubscription) {
      await this.unsubscribeFromPush();
    } else {
      await this.registerPushSubscription();
    }
  }

  async registerPushSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      this.showToast('Push notifications are not supported in this browser', 'error');
      return;
    }

    if (!this.vapidKey) {
      this.showToast('Push service is not configured', 'error');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.showToast('Push notification permission denied', 'error');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidKey)
      });

      const response = await fetch('/api/notifications/push/subscribe', {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ subscription })
      });

      if (response.ok) {
        this.preferences.channels.push.subscription = subscription;
        this.preferences.channels.push.enabled = true;
        document.getElementById('pushEnabled').checked = true;
        this.updatePushStatus();
        this.showToast('Push notifications enabled!', 'success');
      } else {
        throw new Error('Failed to save subscription');
      }
    } catch (error) {
      console.error('Push subscription error:', error);
      this.showToast('Failed to enable push notifications', 'error');
    }
  }

  async unsubscribeFromPush() {
    try {
      const response = await fetch('/api/notifications/push/unsubscribe', {
        method: 'POST',
        headers: this.getAuthHeaders()
      });

      if (response.ok) {
        this.preferences.channels.push.subscription = null;
        this.updatePushStatus();
        this.showToast('Push notifications disabled', 'success');
      }
    } catch (error) {
      console.error('Unsubscribe error:', error);
      this.showToast('Failed to disable push notifications', 'error');
    }
  }

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  getSelectedTypes(channel) {
    const container = document.getElementById(`${channel}Types`);
    const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
  }

  async savePreferences() {
    const saveBtn = document.getElementById('saveSettingsBtn');
    saveBtn.disabled = true;
    saveBtn.querySelector('.btn-text').textContent = 'Saving...';

    try {
      const preferences = {
        channels: {
          email: {
            enabled: document.getElementById('emailEnabled').checked,
            types: this.getSelectedTypes('email')
          },
          push: {
            enabled: document.getElementById('pushEnabled').checked,
            subscription: this.preferences?.channels?.push?.subscription || null,
            types: this.getSelectedTypes('push')
          },
          sms: {
            enabled: document.getElementById('smsEnabled').checked,
            phoneNumber: document.getElementById('smsPhoneNumber').value || null,
            types: this.getSelectedTypes('sms')
          },
          webhook: {
            enabled: document.getElementById('webhookEnabled').checked,
            url: document.getElementById('webhookUrl').value || null,
            secret: document.getElementById('webhookSecret').value || null,
            types: this.getSelectedTypes('webhook')
          }
        },
        quietHours: {
          enabled: document.getElementById('quietHoursEnabled').checked,
          start: document.getElementById('quietStart').value,
          end: document.getElementById('quietEnd').value,
          timezone: document.getElementById('quietTimezone').value
        }
      };

      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(preferences)
      });

      if (response.ok) {
        this.preferences = preferences;
        this.showToast('Preferences saved successfully!', 'success');
        this.close();
      } else {
        throw new Error('Failed to save preferences');
      }
    } catch (error) {
      console.error('Save preferences error:', error);
      this.showToast('Failed to save preferences', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.querySelector('.btn-text').textContent = 'Save Preferences';
    }
  }

  async sendTestNotification(channel) {
    try {
      const response = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ channel })
      });

      if (response.ok) {
        this.showToast(`Test ${channel} notification sent!`, 'success');
      } else {
        throw new Error('Failed to send test');
      }
    } catch (error) {
      console.error('Test notification error:', error);
      this.showToast(`Failed to send test ${channel} notification`, 'error');
    }
  }

  getAuthHeaders() {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

// Notification Center Controller
class NotificationCenterController {
  constructor() {
    this.notifications = [];
    this.unreadCount = 0;
    this.panel = null;
    this.isOpen = false;
    this.page = 1;
    this.hasMore = true;
    this.init();
  }

  init() {
    this.createPanel();
    this.attachEventListeners();
    this.loadUnreadCount();
    this.setupSocketListeners();
  }

  createPanel() {
    const panelHTML = `
      <div id="notificationCenter" class="notification-center">
        <div class="notification-center-header">
          <h3>Notifications</h3>
          <div class="notification-center-actions">
            <button class="btn-icon" id="markAllReadBtn" title="Mark all as read">
              <span class="icon">✓✓</span>
            </button>
            <button class="btn-icon" id="notificationSettingsBtn" title="Settings">
              <span class="icon">⚙️</span>
            </button>
          </div>
        </div>
        <div class="notification-center-body" id="notificationList">
          <div class="notification-empty">
            <span class="empty-icon">🔔</span>
            <p>No notifications yet</p>
          </div>
        </div>
        <div class="notification-center-footer">
          <button class="btn btn-sm btn-link" id="loadMoreNotifications" style="display: none;">
            Load More
          </button>
        </div>
      </div>
    `;

    // Add notification bell to header if not exists
    const headerActions = document.querySelector('.header-actions, .nav-actions, header .actions');
    if (headerActions) {
      const bellHTML = `
        <button class="notification-bell" id="notificationBell" aria-label="Notifications">
          <span class="bell-icon">🔔</span>
          <span class="notification-badge" id="notificationBadge" style="display: none;">0</span>
        </button>
      `;
      headerActions.insertAdjacentHTML('afterbegin', bellHTML);
    }

    document.body.insertAdjacentHTML('beforeend', panelHTML);
    this.panel = document.getElementById('notificationCenter');
  }

  attachEventListeners() {
    // Bell click
    const bell = document.getElementById('notificationBell');
    if (bell) {
      bell.addEventListener('click', () => this.toggle());
    }

    // Mark all read
    document.getElementById('markAllReadBtn')?.addEventListener('click', () => this.markAllRead());

    // Settings button
    document.getElementById('notificationSettingsBtn')?.addEventListener('click', () => {
      this.close();
      if (window.notificationSettings) {
        window.notificationSettings.open();
      }
    });

    // Load more
    document.getElementById('loadMoreNotifications')?.addEventListener('click', () => this.loadMore());

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.panel.contains(e.target) && !e.target.closest('#notificationBell')) {
        this.close();
      }
    });
  }

  setupSocketListeners() {
    if (window.socket) {
      window.socket.on('notification', (notification) => {
        this.addNotification(notification);
      });

      window.socket.on('notification_count', (data) => {
        this.updateBadge(data.count);
      });
    }
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  async open() {
    this.panel.classList.add('open');
    this.isOpen = true;
    await this.loadNotifications();
  }

  close() {
    this.panel.classList.remove('open');
    this.isOpen = false;
  }

  async loadNotifications() {
    try {
      const response = await fetch(`/api/notifications?page=${this.page}&limit=20`, {
        headers: this.getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        this.notifications = data.notifications;
        this.hasMore = data.pagination?.hasMore ?? false;
        this.renderNotifications();
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }

  async loadMore() {
    this.page++;
    try {
      const response = await fetch(`/api/notifications?page=${this.page}&limit=20`, {
        headers: this.getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        this.notifications.push(...data.notifications);
        this.hasMore = data.pagination?.hasMore ?? false;
        this.renderNotifications();
      }
    } catch (error) {
      console.error('Failed to load more notifications:', error);
      this.page--;
    }
  }

  renderNotifications() {
    const container = document.getElementById('notificationList');

    if (this.notifications.length === 0) {
      container.innerHTML = `
        <div class="notification-empty">
          <span class="empty-icon">🔔</span>
          <p>No notifications yet</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.notifications.map(n => this.renderNotification(n)).join('');

    const loadMoreBtn = document.getElementById('loadMoreNotifications');
    if (loadMoreBtn) {
      loadMoreBtn.style.display = this.hasMore ? 'block' : 'none';
    }

    // Attach click handlers
    container.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', () => this.handleNotificationClick(item.dataset.id));
    });
  }

  renderNotification(notification) {
    const timeAgo = this.getTimeAgo(notification.createdAt);
    const unreadClass = notification.read ? '' : 'unread';
    const priorityClass = `priority-${notification.priority || 'low'}`;

    return `
      <div class="notification-item ${unreadClass} ${priorityClass}" data-id="${notification._id}">
        <span class="notification-icon">${notification.icon || notification.data?.icon || 'ℹ️'}</span>
        <div class="notification-content">
          <div class="notification-title">${notification.title}</div>
          <div class="notification-message">${notification.message}</div>
          <div class="notification-time">${timeAgo}</div>
        </div>
        ${!notification.read ? '<span class="unread-dot"></span>' : ''}
      </div>
    `;
  }

  addNotification(notification) {
    this.notifications.unshift(notification);
    this.unreadCount++;
    this.updateBadge(this.unreadCount);

    if (this.isOpen) {
      this.renderNotifications();
    }

    // Show toast for new notification
    this.showNotificationToast(notification);
  }

  async handleNotificationClick(notificationId) {
    const notification = this.notifications.find(n => n._id === notificationId);

    if (!notification?.read) {
      await this.markAsRead(notificationId);
    }

    if (notification?.data?.actionUrl) {
      window.location.href = notification.data.actionUrl;
    }

    this.close();
  }

  async markAsRead(notificationId) {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: this.getAuthHeaders()
      });

      const notification = this.notifications.find(n => n._id === notificationId);
      if (notification) {
        notification.read = true;
        this.unreadCount = Math.max(0, this.unreadCount - 1);
        this.updateBadge(this.unreadCount);
        this.renderNotifications();
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }

  async markAllRead() {
    try {
      await fetch('/api/notifications/mark-all-read', {
        method: 'PATCH',
        headers: this.getAuthHeaders()
      });

      this.notifications.forEach(n => n.read = true);
      this.unreadCount = 0;
      this.updateBadge(0);
      this.renderNotifications();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }

  async loadUnreadCount() {
    try {
      const response = await fetch('/api/notifications/unread-count', {
        headers: this.getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        this.unreadCount = data.count;
        this.updateBadge(this.unreadCount);
      }
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  }

  updateBadge(count) {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);

    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secondsInUnit);
      if (interval >= 1) {
        return `${interval} ${unit}${interval === 1 ? '' : 's'} ago`;
      }
    }

    return 'Just now';
  }

  showNotificationToast(notification) {
    const toast = document.createElement('div');
    toast.className = `notification-toast priority-${notification.priority || 'low'}`;
    toast.innerHTML = `
      <span class="toast-icon">${notification.icon || notification.data?.icon || 'ℹ️'}</span>
      <div class="toast-content">
        <div class="toast-title">${notification.title}</div>
        <div class="toast-message">${notification.message}</div>
      </div>
      <button class="toast-close">&times;</button>
    `;

    document.body.appendChild(toast);

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    });

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  getAuthHeaders() {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }
}


class SecurityController {
  constructor() {
    this.sessionsList = document.getElementById('active-sessions-list');
    this.securityLogBody = document.getElementById('security-log-body');
    this.init();
  }

  init() {
    // Attach listener to Security tab button
    // Find the button that switches to security tab
    const securityTabBtn = document.querySelector('button[data-tab="security"]') ||
      Array.from(document.querySelectorAll('.nav-item')).find(btn => btn.textContent.trim().includes('Security'));

    if (securityTabBtn) {
      securityTabBtn.addEventListener('click', () => this.loadData());
    }

    // Also load if already active (e.g. on page load if hash matches)
    if (document.getElementById('security-tab').classList.contains('active')) {
      this.loadData();
    }

    // Attach event listeners for Revoke buttons (delegation)
    if (this.sessionsList) {
      this.sessionsList.addEventListener('click', (e) => {
        if (e.target.closest('.revoke-session-btn')) {
          const btn = e.target.closest('.revoke-session-btn');
          this.revokeSession(btn.dataset.id);
        }
      });
    }

    // Revoke All button
    const revokeAllBtn = document.getElementById('revoke-all-btn');
    if (revokeAllBtn) {
      revokeAllBtn.addEventListener('click', () => this.revokeAllSessions());
    }
  }

  async loadData() {
    await Promise.all([
      this.loadActiveSessions(),
      this.loadSecurityLog()
    ]);
  }

  getAuthHeaders() {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  async loadActiveSessions() {
    if (!this.sessionsList) return;

    try {
      this.sessionsList.innerHTML = '<div class="setting-item"><div class="setting-info">Loading...</div></div>';

      const response = await fetch('/api/auth/sessions', {
        headers: this.getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        this.renderSessions(data.sessions);
      } else {
        throw new Error('Failed to load sessions');
      }
    } catch (error) {
      console.error('Load sessions error:', error);
      this.sessionsList.innerHTML = '<div class="setting-item"><div class="setting-info" style="color:red">Failed to load sessions</div></div>';
    }
  }

  renderSessions(sessions) {
    if (sessions.length === 0) {
      this.sessionsList.innerHTML = '<div class="setting-item"><div class="setting-info">No active sessions found.</div></div>';
      return;
    }

    this.sessionsList.innerHTML = sessions.map(session => {
      const isCurrent = session.isCurrent;
      const deviceName = session.device?.userAgent?.match(/\(([^)]+)\)/)?.[1] || session.device?.userAgent || 'Unknown Device';
      // Simple parse for Browser/OS could be better but using UA or custom fields

      return `
        <div class="setting-item session-item">
          <div class="setting-info">
            <div class="setting-label">
                ${session.device?.platform || 'Device'} 
                ${isCurrent ? '<span class="session-badge current" style="background:#64ffda; color:#0a192f; padding:2px 6px; border-radius:4px; font-size:0.75rem; margin-left:8px;">Current</span>' : ''}
            </div>
            <div class="setting-description">
              ${session.location?.city ? `${session.location.city}, ${session.location.country}` : 'Unknown Location'} • 
              Last active: ${new Date(session.lastAccessAt).toLocaleString()}
              <br>
              <small style="opacity:0.7">${deviceName}</small>
            </div>
          </div>
          <div class="setting-control">
            ${!isCurrent ? `<button class="btn-danger-sm revoke-session-btn" data-id="${session.id}">Revoke</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  async loadSecurityLog() {
    if (!this.securityLogBody) return;

    try {
      this.securityLogBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem;">Loading...</td></tr>';

      const response = await fetch('/api/auth/security/audit-trail?limit=15', {
        headers: this.getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        this.renderSecurityLog(data.auditTrail);
      } else {
        throw new Error('Failed to load security log');
      }
    } catch (error) {
      console.error('Load security log error:', error);
      this.securityLogBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem; color:red;">Failed to load logs</td></tr>';
    }
  }

  renderSecurityLog(logs) {
    if (!logs || logs.length === 0) {
      this.securityLogBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem;">No recent activity</td></tr>';
      return;
    }

    this.securityLogBody.innerHTML = logs.map(log => `
      <tr style="border-bottom: 1px solid rgba(100,255,218,0.1);">
        <td style="padding: 1rem;">${this.formatEventType(log.action)}</td>
        <td style="padding: 1rem;">${log.ipAddress || 'Unknown'}</td>
        <td style="padding: 1rem;">${log.deviceInfo?.platform || 'Unknown'}</td>
        <td style="padding: 1rem;">${new Date(log.createdAt).toLocaleString()}</td>
      </tr>
    `).join('');
  }

  formatEventType(action) {
    return action.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  async revokeSession(sessionId) {
    if (!confirm('Are you sure you want to revoke this session?')) return;

    try {
      const response = await fetch(`/api/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });

      if (response.ok) {
        this.loadActiveSessions(); // Reload list
        // showToast('Session revoked', 'success'); // Assuming showToast exists or I can add it
      } else {
        alert('Failed to revoke session');
      }
    } catch (error) {
      console.error('Revoke error:', error);
    }
  }

  async revokeAllSessions() {
    if (!confirm('Are you sure you want to sign out of all other devices?')) return;

    try {
      const response = await fetch('/api/auth/sessions/revoke-all', {
        method: 'POST',
        headers: this.getAuthHeaders()
      });

      if (response.ok) {
        this.loadActiveSessions();
        alert('All other sessions revoked');
      } else {
        alert('Failed to revoke sessions');
      }
    } catch (error) {
      console.error('Revoke all error:', error);
    }
  }
}

// Initialize controllers
document.addEventListener('DOMContentLoaded', () => {
  window.notificationSettings = new NotificationSettingsController();
  window.notificationCenter = new NotificationCenterController();
  window.securityController = new SecurityController();
});

