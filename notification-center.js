// Advanced Notification System
class NotificationCenter {
  constructor() {
    this.apiUrl = 'http://localhost:3000/api';
    this.authToken = localStorage.getItem('token');
    this.notifications = [];
    this.unreadCount = 0;
    this.socket = null;
    this.swRegistration = null;
    
    this.initializeNotificationCenter();
    this.setupServiceWorker();
    this.connectSocket();
  }

  // Initialize notification center UI
  initializeNotificationCenter() {
    const notificationHTML = `
      <div id="notification-center" class="notification-center" style="display: none;">
        <div class="notification-header">
          <h3>🔔 Notifications</h3>
          <div class="notification-actions">
            <button id="mark-all-read-btn" class="btn-small">Mark All Read</button>
            <button id="notification-settings-btn" class="btn-small">⚙️ Settings</button>
            <button id="close-notifications-btn" class="btn-close">×</button>
          </div>
        </div>
        
        <div class="notification-filters">
          <button class="filter-btn active" data-filter="all">All</button>
          <button class="filter-btn" data-filter="unread">Unread</button>
          <button class="filter-btn" data-filter="budget_alert">Budget</button>
          <button class="filter-btn" data-filter="goal_achieved">Goals</button>
        </div>

        <div id="notifications-list" class="notifications-list">
          <div class="loading">Loading notifications...</div>
        </div>

        <div class="notification-pagination">
          <button id="load-more-btn" class="btn-secondary">Load More</button>
        </div>
      </div>

      <!-- Notification Settings Modal -->
      <div id="notification-settings-modal" class="modal" style="display: none;">
        <div class="modal-content">
          <h3>Notification Preferences</h3>
          <form id="notification-preferences-form">
            <div class="preference-section">
              <h4>📧 Email Notifications</h4>
              <label>
                <input type="checkbox" id="email-enabled"> Enable email notifications
              </label>
              <div class="notification-types">
                <label><input type="checkbox" name="email-types" value="budget_alert"> Budget Alerts</label>
                <label><input type="checkbox" name="email-types" value="goal_achieved"> Goal Achievements</label>
                <label><input type="checkbox" name="email-types" value="security_alert"> Security Alerts</label>
              </div>
            </div>

            <div class="preference-section">
              <h4>📱 Push Notifications</h4>
              <label>
                <input type="checkbox" id="push-enabled"> Enable push notifications
              </label>
              <div class="notification-types">
                <label><input type="checkbox" name="push-types" value="budget_alert"> Budget Alerts</label>
                <label><input type="checkbox" name="push-types" value="goal_achieved"> Goal Achievements</label>
                <label><input type="checkbox" name="push-types" value="expense_added"> New Expenses</label>
              </div>
            </div>

            <div class="preference-section">
              <h4>📱 SMS Notifications</h4>
              <label>
                <input type="checkbox" id="sms-enabled"> Enable SMS notifications
              </label>
              <input type="tel" id="sms-phone" placeholder="+1234567890" style="margin-top: 10px;">
              <div class="notification-types">
                <label><input type="checkbox" name="sms-types" value="budget_alert"> Budget Alerts</label>
                <label><input type="checkbox" name="sms-types" value="security_alert"> Security Alerts</label>
              </div>
            </div>

            <div class="preference-section">
              <h4>🔗 Webhook Integration</h4>
              <label>
                <input type="checkbox" id="webhook-enabled"> Enable webhook notifications
              </label>
              <input type="url" id="webhook-url" placeholder="https://your-webhook-url.com" style="margin-top: 10px;">
              <input type="password" id="webhook-secret" placeholder="Webhook Secret (optional)" style="margin-top: 10px;">
            </div>

            <div class="modal-actions">
              <button type="submit">Save Preferences</button>
              <button type="button" id="close-settings-modal">Cancel</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Notification Bell Icon -->
      <div id="notification-bell" class="notification-bell">
        🔔
        <span id="notification-badge" class="notification-badge" style="display: none;">0</span>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', notificationHTML);
    this.setupEventListeners();
    this.addNotificationStyles();
    this.loadNotifications();
    this.loadUnreadCount();
  }

  // Setup event listeners
  setupEventListeners() {
    // Notification bell click
    document.getElementById('notification-bell').addEventListener('click', () => {
      this.toggleNotificationCenter();
    });

    // Close notification center
    document.getElementById('close-notifications-btn').addEventListener('click', () => {
      this.hideNotificationCenter();
    });

    // Mark all as read
    document.getElementById('mark-all-read-btn').addEventListener('click', () => {
      this.markAllAsRead();
    });

    // Settings button
    document.getElementById('notification-settings-btn').addEventListener('click', () => {
      this.showSettingsModal();
    });

    // Close settings modal
    document.getElementById('close-settings-modal').addEventListener('click', () => {
      this.hideSettingsModal();
    });

    // Settings form
    document.getElementById('notification-preferences-form').addEventListener('submit', (e) => {
      this.savePreferences(e);
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.filterNotifications(e.target.dataset.filter);
      });
    });

    // Load more button
    document.getElementById('load-more-btn').addEventListener('click', () => {
      this.loadMoreNotifications();
    });

    // Push notification permission
    document.getElementById('push-enabled').addEventListener('change', (e) => {
      if (e.target.checked) {
        this.requestPushPermission();
      } else {
        this.unsubscribeFromPush();
      }
    });
  }

  // Setup service worker for push notifications
  async setupServiceWorker() {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        this.swRegistration = await navigator.serviceWorker.register('/sw-notifications.js');
        console.log('Notification service worker registered');
      } catch (error) {
        console.error('Service worker registration failed:', error);
      }
    }
  }

  // Connect to Socket.IO for real-time notifications
  connectSocket() {
    if (this.authToken && window.io) {
      this.socket = io('http://localhost:3000', {
        auth: { token: this.authToken }
      });

      this.socket.on('notification', (notification) => {
        this.handleRealTimeNotification(notification);
      });
    }
  }

  // Handle real-time notifications
  handleRealTimeNotification(notification) {
    // Add to notifications list
    this.notifications.unshift(notification);
    
    // Update unread count
    this.unreadCount++;
    this.updateNotificationBadge();
    
    // Show toast notification
    this.showToastNotification(notification);
    
    // Refresh notifications list if open
    if (document.getElementById('notification-center').style.display !== 'none') {
      this.displayNotifications();
    }
  }

  // Show toast notification
  showToastNotification(notification) {
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${notification.priority}`;
    toast.innerHTML = `
      <div class="toast-content">
        <h4>${notification.title}</h4>
        <p>${notification.message}</p>
      </div>
      <button class="toast-close">×</button>
    `;

    document.body.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 5000);

    // Manual close
    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });
  }

  // Toggle notification center
  toggleNotificationCenter() {
    const center = document.getElementById('notification-center');
    if (center.style.display === 'none') {
      this.showNotificationCenter();
    } else {
      this.hideNotificationCenter();
    }
  }

  // Show notification center
  showNotificationCenter() {
    document.getElementById('notification-center').style.display = 'block';
    this.loadNotifications();
  }

  // Hide notification center
  hideNotificationCenter() {
    document.getElementById('notification-center').style.display = 'none';
  }

  // Load notifications from API
  async loadNotifications(page = 1) {
    try {
      const response = await fetch(`${this.apiUrl}/notifications?page=${page}&limit=20`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      if (!response.ok) throw new Error('Failed to load notifications');
      
      const data = await response.json();
      
      if (page === 1) {
        this.notifications = data.notifications;
      } else {
        this.notifications.push(...data.notifications);
      }
      
      this.displayNotifications();
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  // Display notifications in the list
  displayNotifications() {
    const container = document.getElementById('notifications-list');
    container.innerHTML = '';

    if (this.notifications.length === 0) {
      container.innerHTML = '<div class="no-notifications">No notifications yet</div>';
      return;
    }

    this.notifications.forEach(notification => {
      const notificationElement = this.createNotificationElement(notification);
      container.appendChild(notificationElement);
    });
  }

  // Create notification element
  createNotificationElement(notification) {
    const element = document.createElement('div');
    element.className = `notification-item ${notification.read ? 'read' : 'unread'} priority-${notification.priority}`;
    element.innerHTML = `
      <div class="notification-content">
        <div class="notification-header">
          <h4>${notification.title}</h4>
          <span class="notification-time">${this.formatTime(notification.timestamp || notification.createdAt)}</span>
        </div>
        <p>${notification.message}</p>
        <div class="notification-actions">
          ${!notification.read ? `<button onclick="notificationCenter.markAsRead('${notification.id}')">Mark Read</button>` : ''}
          <button onclick="notificationCenter.deleteNotification('${notification.id}')">Delete</button>
        </div>
      </div>
    `;

    return element;
  }

  // Load unread count
  async loadUnreadCount() {
    try {
      const response = await fetch(`${this.apiUrl}/notifications/unread-count`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      if (!response.ok) throw new Error('Failed to load unread count');
      
      const data = await response.json();
      this.unreadCount = data.count;
      this.updateNotificationBadge();
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  }

  // Update notification badge
  updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (this.unreadCount > 0) {
      badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  }

  // Mark notification as read
  async markAsRead(notificationId) {
    try {
      await fetch(`${this.apiUrl}/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      // Update local state
      const notification = this.notifications.find(n => n.id === notificationId);
      if (notification) {
        notification.read = true;
        this.unreadCount = Math.max(0, this.unreadCount - 1);
        this.updateNotificationBadge();
        this.displayNotifications();
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  // Mark all as read
  async markAllAsRead() {
    try {
      await fetch(`${this.apiUrl}/notifications/mark-all-read`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      // Update local state
      this.notifications.forEach(n => n.read = true);
      this.unreadCount = 0;
      this.updateNotificationBadge();
      this.displayNotifications();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }

  // Delete notification
  async deleteNotification(notificationId) {
    try {
      await fetch(`${this.apiUrl}/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      // Update local state
      const index = this.notifications.findIndex(n => n.id === notificationId);
      if (index !== -1) {
        if (!this.notifications[index].read) {
          this.unreadCount = Math.max(0, this.unreadCount - 1);
          this.updateNotificationBadge();
        }
        this.notifications.splice(index, 1);
        this.displayNotifications();
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  }

  // Request push notification permission
  async requestPushPermission() {
    if (!('Notification' in window)) {
      alert('This browser does not support notifications');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await this.subscribeToPush();
    }
  }

  // Subscribe to push notifications
  async subscribeToPush() {
    try {
      // Get VAPID public key
      const keyResponse = await fetch(`${this.apiUrl}/notifications/push/vapid-key`);
      const { publicKey } = await keyResponse.json();

      // Subscribe to push
      const subscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(publicKey)
      });

      // Send subscription to server
      await fetch(`${this.apiUrl}/notifications/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({ subscription })
      });

      console.log('Push subscription successful');
    } catch (error) {
      console.error('Push subscription failed:', error);
    }
  }

  // Utility function for VAPID key conversion
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Format time for display
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }

  // Show settings modal
  showSettingsModal() {
    document.getElementById('notification-settings-modal').style.display = 'flex';
    this.loadPreferences();
  }

  // Hide settings modal
  hideSettingsModal() {
    document.getElementById('notification-settings-modal').style.display = 'none';
  }

  // Load notification preferences
  async loadPreferences() {
    try {
      const response = await fetch(`${this.apiUrl}/notifications/preferences`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      if (!response.ok) throw new Error('Failed to load preferences');
      
      const preferences = await response.json();
      this.populatePreferencesForm(preferences);
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  }

  // Populate preferences form
  populatePreferencesForm(preferences) {
    // Email preferences
    document.getElementById('email-enabled').checked = preferences.channels.email.enabled;
    preferences.channels.email.types.forEach(type => {
      const checkbox = document.querySelector(`input[name="email-types"][value="${type}"]`);
      if (checkbox) checkbox.checked = true;
    });

    // Push preferences
    document.getElementById('push-enabled').checked = preferences.channels.push.enabled;
    preferences.channels.push.types.forEach(type => {
      const checkbox = document.querySelector(`input[name="push-types"][value="${type}"]`);
      if (checkbox) checkbox.checked = true;
    });

    // SMS preferences
    document.getElementById('sms-enabled').checked = preferences.channels.sms.enabled;
    document.getElementById('sms-phone').value = preferences.channels.sms.phoneNumber || '';
    preferences.channels.sms.types.forEach(type => {
      const checkbox = document.querySelector(`input[name="sms-types"][value="${type}"]`);
      if (checkbox) checkbox.checked = true;
    });

    // Webhook preferences
    document.getElementById('webhook-enabled').checked = preferences.channels.webhook.enabled;
    document.getElementById('webhook-url').value = preferences.channels.webhook.url || '';
    document.getElementById('webhook-secret').value = preferences.channels.webhook.secret || '';
  }

  // Save preferences
  async savePreferences(e) {
    e.preventDefault();

    const preferences = {
      channels: {
        email: {
          enabled: document.getElementById('email-enabled').checked,
          types: Array.from(document.querySelectorAll('input[name="email-types"]:checked')).map(cb => cb.value)
        },
        push: {
          enabled: document.getElementById('push-enabled').checked,
          types: Array.from(document.querySelectorAll('input[name="push-types"]:checked')).map(cb => cb.value)
        },
        sms: {
          enabled: document.getElementById('sms-enabled').checked,
          phoneNumber: document.getElementById('sms-phone').value,
          types: Array.from(document.querySelectorAll('input[name="sms-types"]:checked')).map(cb => cb.value)
        },
        webhook: {
          enabled: document.getElementById('webhook-enabled').checked,
          url: document.getElementById('webhook-url').value,
          secret: document.getElementById('webhook-secret').value,
          types: ['budget_alert', 'goal_achieved', 'security_alert']
        }
      }
    };

    try {
      await fetch(`${this.apiUrl}/notifications/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(preferences)
      });

      this.hideSettingsModal();
      this.showNotification('Preferences saved successfully', 'success');
    } catch (error) {
      console.error('Error saving preferences:', error);
      this.showNotification('Failed to save preferences', 'error');
    }
  }

  // Add notification styles
  addNotificationStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .notification-bell {
        position: fixed;
        top: 20px;
        right: 20px;
        background: #667eea;
        color: white;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 20px;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      }

      .notification-badge {
        position: absolute;
        top: -5px;
        right: -5px;
        background: #ff4757;
        color: white;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .notification-center {
        position: fixed;
        top: 80px;
        right: 20px;
        width: 400px;
        max-height: 600px;
        background: white;
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        z-index: 1001;
        overflow: hidden;
      }

      .notification-header {
        background: #667eea;
        color: white;
        padding: 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .notification-filters {
        display: flex;
        padding: 10px;
        gap: 5px;
        border-bottom: 1px solid #eee;
      }

      .filter-btn {
        padding: 5px 10px;
        border: 1px solid #ddd;
        background: white;
        border-radius: 15px;
        cursor: pointer;
        font-size: 12px;
      }

      .filter-btn.active {
        background: #667eea;
        color: white;
      }

      .notifications-list {
        max-height: 400px;
        overflow-y: auto;
      }

      .notification-item {
        padding: 15px;
        border-bottom: 1px solid #eee;
        cursor: pointer;
      }

      .notification-item.unread {
        background: #f8f9ff;
        border-left: 4px solid #667eea;
      }

      .notification-item.priority-high {
        border-left-color: #ff4757;
      }

      .notification-item.priority-critical {
        border-left-color: #ff3742;
        background: #fff5f5;
      }

      .toast-notification {
        position: fixed;
        top: 100px;
        right: 20px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 15px;
        max-width: 300px;
        z-index: 1002;
        animation: slideIn 0.3s ease-out;
      }

      .toast-notification.toast-high {
        border-left: 4px solid #ff9500;
      }

      .toast-notification.toast-critical {
        border-left: 4px solid #ff4757;
      }

      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }

      .modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1003;
      }

      .modal-content {
        background: white;
        padding: 30px;
        border-radius: 10px;
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
      }

      .preference-section {
        margin-bottom: 20px;
        padding: 15px;
        border: 1px solid #eee;
        border-radius: 5px;
      }

      .notification-types {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
    `;
    document.head.appendChild(style);
  }

  // Show notification (reuse existing function)
  showNotification(message, type = 'info') {
    if (window.ExpenseSync && window.ExpenseSync.showNotification) {
      window.ExpenseSync.showNotification(message, type);
    } else {
      alert(message);
    }
  }
}

// Initialize notification center
const notificationCenter = new NotificationCenter();

// Export for global use
window.NotificationCenter = notificationCenter;