// PWA Features Monitor - Comprehensive PWA functionality management

class PWAMonitor {
    constructor() {
        this.serviceWorker = null;
        this.registration = null;
        this.cacheNames = [];
        this.storageInfo = {};
        this.intervals = {};
        this.notifications = [];
        this.syncQueue = [];
    }

    async init() {
        await this.checkServiceWorker();
        await this.checkStorage();
        await this.checkNotifications();
        await this.checkInstallability();
        await this.setupBackgroundSync();
        this.startMonitoring();
    }

    async checkServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                this.registration = await navigator.serviceWorker.getRegistration();
                if (this.registration) {
                    this.serviceWorker = this.registration.active;
                    this.updateSWStatus('Enabled');
                    this.updateSWVersion('v1.2.3');

                    // Listen for updates
                    this.registration.addEventListener('updatefound', () => {
                        const newWorker = this.registration.installing;
                        if (newWorker) {
                            newWorker.addEventListener('statechange', () => {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    this.showUpdateNotification();
                                }
                            });
                        }
                    });
                } else {
                    this.updateSWStatus('Disabled');
                }
            } catch (error) {
                console.error('Service Worker check failed:', error);
                this.updateSWStatus('Error');
            }
        } else {
            this.updateSWStatus('Not Supported');
        }
    }

    async checkStorage() {
        try {
            // Check Cache Storage
            if ('caches' in window) {
                this.cacheNames = await caches.keys();
                let totalCacheSize = 0;

                for (const cacheName of this.cacheNames) {
                    const cache = await caches.open(cacheName);
                    const keys = await cache.keys();
                    // Estimate size (rough calculation)
                    totalCacheSize += keys.length * 50; // Rough estimate per item
                }

                this.updateStorageValue('cache-storage', `${totalCacheSize} KB`);
            }

            // Check IndexedDB
            if ('indexedDB' in window) {
                // This is a simplified check - in reality you'd need to iterate through all databases
                this.updateStorageValue('indexeddb-storage', '856 MB');
            }

            // Check Local Storage
            const localStorageSize = JSON.stringify(localStorage).length;
            this.updateStorageValue('local-storage', `${(localStorageSize / 1024).toFixed(1)} KB`);

            // Check available space (if supported)
            if ('storage' in navigator && 'estimate' in navigator.storage) {
                const estimate = await navigator.storage.estimate();
                const available = estimate.quota - estimate.usage;
                this.updateStorageValue('available-space', `${(available / 1024 / 1024 / 1024).toFixed(1)} GB`);
            }

            this.updateStorageValue('storage-used', '1.2 GB');
        } catch (error) {
            console.error('Storage check failed:', error);
        }
    }

    async checkNotifications() {
        if ('Notification' in window) {
            const permission = Notification.permission;
            this.updateNotificationStatus(permission);

            if (permission === 'granted') {
                // Load notification history (simulated)
                this.notifications = [
                    { id: 1, title: 'Expense Alert', message: 'Large transaction detected', enabled: true },
                    { id: 2, title: 'Budget Warning', message: '80% budget reached', enabled: true },
                    { id: 3, title: 'Weekly Report', message: 'Summary ready', enabled: false },
                    { id: 4, title: 'Sync Complete', message: 'Data synchronized', enabled: true }
                ];

                this.updateNotificationCount(this.notifications.length);
            }
        } else {
            this.updateNotificationStatus('Not Supported');
        }
    }

    async checkInstallability() {
        // Check if app is installable
        let installable = false;

        if ('standalone' in window.navigator && window.navigator.standalone) {
            // iOS Safari
            installable = true;
        } else if (window.matchMedia('(display-mode: standalone)').matches) {
            // Android Chrome or other browsers
            installable = true;
        }

        this.updateInstallStatus(installable ? 'Installed' : 'Available');

        // Listen for install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.updateInstallPrompt('Ready to Install');
        });

        window.addEventListener('appinstalled', () => {
            this.updateInstallStatus('Installed');
            this.deferredPrompt = null;
        });
    }

    async setupBackgroundSync() {
        if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
            try {
                // Register background sync
                await this.registration.sync.register('expense-sync');
                this.updateSyncStatus('Active');

                // Simulate sync queue
                this.syncQueue = [
                    { id: 1, type: 'expense', data: 'New expense entry' },
                    { id: 2, type: 'receipt', data: 'Receipt upload' },
                    { id: 3, type: 'budget', data: 'Budget update' }
                ];

                this.updateSyncQueue(this.syncQueue.length);
            } catch (error) {
                console.error('Background sync setup failed:', error);
                this.updateSyncStatus('Error');
            }
        } else {
            this.updateSyncStatus('Not Supported');
        }
    }

    startMonitoring() {
        // Monitor online/offline status
        this.updateOfflineStatus(navigator.onLine);

        window.addEventListener('online', () => {
            this.updateOfflineStatus(true);
        });

        window.addEventListener('offline', () => {
            this.updateOfflineStatus(false);
        });

        // Periodic storage monitoring
        this.intervals.storage = setInterval(() => {
            this.checkStorage();
        }, 30000); // Every 30 seconds
    }

    // Update UI methods
    updateSWStatus(status) {
        const element = document.getElementById('sw-status');
        if (element) {
            element.textContent = status;
            element.className = `feature-status ${this.getStatusClass(status)}`;
        }
    }

    updateSWVersion(version) {
        const element = document.getElementById('sw-version');
        if (element) {
            element.textContent = version;
        }
    }

    updateOfflineStatus(isOnline) {
        const element = document.getElementById('offline-status');
        if (element) {
            element.textContent = isOnline ? 'Online' : 'Offline';
            element.className = `feature-status ${isOnline ? 'status-enabled' : 'status-disabled'}`;
        }
    }

    updateNotificationStatus(status) {
        const element = document.getElementById('notification-status');
        if (element) {
            element.textContent = status;
            element.className = `feature-status ${this.getStatusClass(status)}`;
        }
    }

    updateNotificationCount(count) {
        const element = document.getElementById('notification-count');
        if (element) {
            element.textContent = count;
        }
    }

    updateInstallStatus(status) {
        const element = document.getElementById('install-status');
        if (element) {
            element.textContent = status;
            element.className = `feature-status ${this.getStatusClass(status)}`;
        }
    }

    updateInstallPrompt(text) {
        const element = document.getElementById('install-prompt');
        if (element) {
            element.textContent = text;
        }
    }

    updateSyncStatus(status) {
        const element = document.getElementById('sync-status');
        if (element) {
            element.textContent = status;
            element.className = `feature-status ${this.getStatusClass(status)}`;
        }
    }

    updateSyncQueue(count) {
        const element = document.getElementById('sync-queue');
        if (element) {
            element.textContent = count;
        }
    }

    updateStorageValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    getStatusClass(status) {
        switch (status.toLowerCase()) {
            case 'enabled':
            case 'active':
            case 'online':
            case 'installed':
            case 'granted':
                return 'status-enabled';
            case 'disabled':
            case 'offline':
            case 'denied':
                return 'status-disabled';
            case 'partial':
            case 'default':
                return 'status-partial';
            default:
                return 'status-disabled';
        }
    }

    // Action methods
    async checkStatus() {
        await Promise.all([
            this.checkServiceWorker(),
            this.checkStorage(),
            this.checkNotifications(),
            this.checkInstallability()
        ]);
    }

    async updatePWA() {
        if (this.registration && this.registration.waiting) {
            this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            window.location.reload();
        } else {
            // Force update check
            await this.registration.update();
        }
    }

    async clearSpecificCache(cacheName) {
        if ('caches' in window) {
            await caches.delete(cacheName);
            await this.checkStorage();
        }
    }

    async sendTestNotification() {
        if (Notification.permission === 'granted') {
            const notification = new Notification('ExpenseFlow PWA', {
                body: 'This is a test notification from your PWA!',
                icon: '/icon-192x192.png',
                badge: '/icon-192x192.png',
                tag: 'test-notification'
            });

            notification.onclick = () => {
                window.focus();
                notification.close();
            };

            // Auto close after 5 seconds
            setTimeout(() => notification.close(), 5000);
        } else {
            throw new Error('Notifications not permitted');
        }
    }

    async exportLogs() {
        const logs = {
            timestamp: new Date().toISOString(),
            serviceWorker: {
                status: this.serviceWorker ? 'active' : 'inactive',
                version: 'v1.2.3'
            },
            storage: this.storageInfo,
            notifications: this.notifications,
            syncQueue: this.syncQueue,
            caches: this.cacheNames,
            online: navigator.onLine
        };

        return logs;
    }

    async resetPWA() {
        // Clear all caches
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
        }

        // Clear storage
        localStorage.clear();
        sessionStorage.clear();

        // Clear IndexedDB (simplified)
        if ('indexedDB' in window) {
            // In a real app, you'd iterate through all databases
            indexedDB.deleteDatabase('expenseflow-db');
        }

        // Unregister service worker
        if (this.registration) {
            await this.registration.unregister();
        }

        // Reset all data
        this.notifications = [];
        this.syncQueue = [];
        this.cacheNames = [];
    }

    showUpdateNotification() {
        // Create a custom update notification in the UI
        const updateBanner = document.createElement('div');
        updateBanner.style.cssText = `
            position: fixed;
            top: 70px;
            left: 50%;
            transform: translateX(-50%);
            background: #667eea;
            color: white;
            padding: 1rem 2rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 1rem;
        `;
        updateBanner.innerHTML = `
            <div>
                <strong>New version available!</strong>
                <br>
                <small>Click to update</small>
            </div>
            <button onclick="this.parentElement.remove(); pwaMonitor.updatePWA()" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">Update</button>
        `;

        document.body.appendChild(updateBanner);

        // Auto remove after 10 seconds
        setTimeout(() => {
            if (updateBanner.parentElement) {
                updateBanner.remove();
            }
        }, 10000);
    }

    destroy() {
        // Clear intervals
        Object.values(this.intervals).forEach(interval => clearInterval(interval));

        // Remove event listeners (would need to store references)
    }
}

// Export for global use
window.PWAMonitor = PWAMonitor;