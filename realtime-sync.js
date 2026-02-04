// Real-time synchronization with Socket.IO
var API_BASE_URL = '/api';
let socket = null;
var authToken = localStorage.getItem('token');
var currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
let offlineQueue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
let deviceId = localStorage.getItem('deviceId') || generateDeviceId();

// Generate unique device ID
function generateDeviceId() {
  const id = 'device_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('deviceId', id);
  return id;
}

// Initialize Socket.IO connection
function initSocket() {
  if (!authToken) return;

  socket = io({
    auth: { token: authToken }
  });

  socket.on('connect', () => {
    console.log('Connected to server');
    showNotification('Connected - Real-time sync enabled', 'success');
    syncOfflineData();
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
    showNotification('Disconnected - Working offline', 'warning');
  });

  // Real-time expense events
  socket.on('expense_created', (expense) => {
    if (!isFromCurrentDevice(expense)) {
      addExpenseToUI(expense);
      showNotification('New expense synced from another device', 'info');
    }
  });

  socket.on('expense_updated', (expense) => {
    if (!isFromCurrentDevice(expense)) {
      updateExpenseInUI(expense);
      showNotification('Expense updated from another device', 'info');
    }
  });

  socket.on('expense_deleted', (data) => {
    if (!isFromCurrentDevice(data)) {
      removeExpenseFromUI(data.id);
      showNotification('Expense deleted from another device', 'info');
    }
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    showNotification('Connection error - Working offline', 'error');
  });
}

// Check if action is from current device
function isFromCurrentDevice(data) {
  return data.deviceId === deviceId;
}

// Add expense to UI without API call
function addExpenseToUI(expense) {
  const transaction = {
    id: expense._id,
    text: expense.description,
    amount: expense.type === 'expense' ? -expense.amount : expense.amount,
    category: expense.category,
    type: expense.type,
    date: expense.date
  };

  transactions.push(transaction);
  displayTransactions();
  updateValues();
  updateLocalStorage();
}

// Update expense in UI
function updateExpenseInUI(expense) {
  const index = transactions.findIndex(t => t.id === expense._id);
  if (index !== -1) {
    transactions[index] = {
      id: expense._id,
      text: expense.description,
      amount: expense.type === 'expense' ? -expense.amount : expense.amount,
      category: expense.category,
      type: expense.type,
      date: expense.date
    };
    displayTransactions();
    updateValues();
    updateLocalStorage();
  }
}

// Remove expense from UI
function removeExpenseFromUI(expenseId) {
  transactions = transactions.filter(t => t.id !== expenseId);
  displayTransactions();
  updateValues();
  updateLocalStorage();
}

// Queue offline operations
function queueOfflineOperation(action, resourceType, resourceId, data = null) {
  const operation = {
    action,
    resourceType,
    resourceId,
    data,
    deviceId,
    timestamp: Date.now()
  };

  offlineQueue.push(operation);
  localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
}

// Sync offline data when online
async function syncOfflineData() {
  if (offlineQueue.length === 0) return;

  try {
    const response = await fetch(`${API_BASE_URL}/sync/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ operations: offlineQueue })
    });

    if (response.ok) {
      const result = await response.json();

      // Process sync results
      result.results.forEach((syncResult, index) => {
        if (syncResult.success) {
          // Update local IDs with server IDs for CREATE operations
          if (offlineQueue[index].action === 'CREATE' && syncResult.data) {
            const localTransaction = transactions.find(t => t.id === offlineQueue[index].resourceId);
            if (localTransaction) {
              localTransaction.id = syncResult.data._id;
            }
          }
        }
      });

      // Clear synced operations
      offlineQueue = [];
      localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
      updateLocalStorage();

      showNotification(`Synced ${result.results.length} operations`, 'success');
    }
  } catch (error) {
    console.error('Sync error:', error);
    showNotification('Sync failed - Will retry later', 'error');
  }
}

// Modified API functions with offline support
async function saveExpense(expense) {
  const tempId = 'temp_' + Date.now();

  try {
    if (navigator.onLine && socket?.connected) {
      const response = await fetch(`${API_BASE_URL}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ ...expense, deviceId })
      });

      if (!response.ok) throw new Error('Failed to save expense');
      return await response.json();
    } else {
      throw new Error('Offline');
    }
  } catch (error) {
    // Queue for offline sync
    queueOfflineOperation('CREATE', 'expense', tempId, expense);

    // Return temporary expense for UI
    return {
      _id: tempId,
      ...expense,
      date: new Date().toISOString(),
      user: currentUser.id
    };
  }
}

async function deleteExpense(id) {
  try {
    if (navigator.onLine && socket?.connected) {
      const response = await fetch(`${API_BASE_URL}/expenses/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ deviceId })
      });

      if (!response.ok) throw new Error('Failed to delete expense');
      return await response.json();
    } else {
      throw new Error('Offline');
    }
  } catch (error) {
    // Queue for offline sync if not a temp ID
    if (!id.startsWith('temp_')) {
      queueOfflineOperation('DELETE', 'expense', id);
    }
    throw error;
  }
}

// Connection status monitoring
window.addEventListener('online', () => {
  showNotification('Back online - Syncing data...', 'success');
  if (socket) {
    socket.connect();
  } else {
    initSocket();
  }
});

window.addEventListener('offline', () => {
  showNotification('Gone offline - Changes will be queued', 'warning');
});

// Initialize real-time sync with IndexedDB and Versioning
async function initRealTimeSync() {
  if (authToken && currentUser) {
    // Init DB first
    await dbManager.init();
    initSocket();

    // Perform initial pull to sync with server
    await pullServerChanges();

    // Periodic sync check
    setInterval(() => {
      if (navigator.onLine && socket?.connected) {
        syncWithServer();
      }
    }, 60000); // Check every minute
  }
}

// Pull changes from server since last sync
async function pullServerChanges() {
  try {
    const lastSyncTime = await dbManager.getMetadata('lastSyncTime');
    const response = await fetch(`${API_BASE_URL}/sync/pull?lastSyncTime=${lastSyncTime || ''}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!response.ok) throw new Error('Pull failed');
    const data = await response.json();

    if (data.success && data.changes.length > 0) {
      for (const change of data.changes) {
        await dbManager.saveExpense(change);
        // Update UI if needed
        updateExpenseInUI(change);
      }
      showNotification(`Synced ${data.changes.length} updates from cloud`, 'success');
    }

    await dbManager.setMetadata('lastSyncTime', data.serverTime);
  } catch (error) {
    console.error('Pull error:', error);
  }
}

// Sync with server (Push Delta + Pull)
async function syncWithServer() {
  const queue = await dbManager.getSyncQueue();
  if (queue.length === 0) {
    return pullServerChanges();
  }

  try {
    const response = await fetch(`${API_BASE_URL}/sync/delta`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ changes: queue })
    });

    if (!response.ok) throw new Error('Sync failed');
    const result = await response.json();

    // 1. Handle Successes
    for (const success of result.success) {
      if (success.action === 'delete') {
        // Already deleted locally, just clean queue
      } else {
        // Update local storage with server ID and new version
        const existing = await dbManager.get('expenses', success.serverId || success.id);
        if (existing) {
          existing.version = success.version;
          if (success.serverId) existing.id = success.serverId;
          await dbManager.saveExpense(existing);
        }
      }
    }

    // 2. Handle Conflicts
    if (result.conflicts.length > 0) {
      handleConflicts(result.conflicts);
    }

    // 3. Cleanup processed queue items
    // For simplicity, we clear all successful ones
    const successfulIds = result.success.map(s => s.localId || s.id);
    const currentQueue = await dbManager.getSyncQueue();
    for (const item of currentQueue) {
      if (successfulIds.includes(item.localId || item.id)) {
        await dbManager.removeFromSyncQueue(item.localId);
      }
    }

    updateSyncStatusUI('synced');
    pullServerChanges();
  } catch (error) {
    console.error('Sync error:', error);
    updateSyncStatusUI('offline');
  }
}

// Conflict Resolution UI Logic
function handleConflicts(conflicts) {
  conflicts.forEach(conflict => {
    showConflictModal(conflict);
  });
}

async function showConflictModal(conflict) {
  // Try to get local data to show comparison
  const localData = await dbManager.get('expenses', conflict.id);

  const modal = document.createElement('div');
  modal.id = `conflict-modal-${conflict.id}`;
  modal.className = 'modal conflict-modal active';
  modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
    `;

  modal.innerHTML = `
        <div class="modal-content" style="background: #1a1a2e; padding: 2rem; border-radius: 12px; max-width: 600px; width: 90%; color: white; border: 1px solid #64ffda;">
            <div class="modal-header" style="margin-bottom: 1.5rem;">
                <h3 style="display: flex; align-items: center; gap: 0.5rem; color: #ffc107;">
                    <i class="fas fa-exclamation-triangle"></i> Version Conflict Detected
                </h3>
            </div>
            <div class="modal-body">
                <p style="margin-bottom: 1.5rem; font-size: 0.95rem; color: #b4b4b4;">
                    The expense "<strong>${localData ? localData.description : 'Deleted locally'}</strong>" was modified elsewhere. 
                    Which version do you want to keep?
                </p>
                <div class="conflict-cards" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem;">
                    <div class="conflict-card" style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                        <h4 style="color: #64ffda; margin-bottom: 0.5rem;">My Device</h4>
                        <div style="font-size: 0.85rem; margin-bottom: 1rem;">
                            <div>Amount: ${localData ? (localData.amount > 0 ? '+' : '') + localData.amount : 'N/A'}</div>
                            <div>Category: ${localData ? localData.category : 'N/A'}</div>
                        </div>
                        <button onclick="resolveConflict('${conflict.id}', 'local')" style="width: 100%; padding: 0.5rem; background: #64ffda; color: #0f0f23; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Keep Mine</button>
                    </div>
                    <div class="conflict-card" style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                        <h4 style="color: #64ffda; margin-bottom: 0.5rem;">Cloud Version</h4>
                        <div style="font-size: 0.85rem; margin-bottom: 1rem;">
                            <div>Amount: ${conflict.serverData.amount}</div>
                            <div>Category: ${conflict.serverData.category}</div>
                        </div>
                        <button onclick="resolveConflict('${conflict.id}', 'server')" style="width: 100%; padding: 0.5rem; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Take Cloud</button>
                    </div>
                </div>
            </div>
        </div>
    `;
  document.body.appendChild(modal);
}

window.resolveConflict = async (id, choice) => {
  const modal = document.getElementById(`conflict-modal-${id}`);

  if (choice === 'server') {
    // 1. Accept server's version: fetch conflict data and update local DB
    // We already have serverData in the context or we can use the pull mechanism
    // But for immediate resolution, we can pass it via a global store or just wait for the next pull
    // Let's mark the queue item as resolved so it gets removed
    await dbManager.removeFromSyncQueue(id);
    showNotification('Accepted cloud version.', 'info');
  } else {
    // 2. Keep local: Mark queue item to "force push" by incrementing version
    const queueItem = (await dbManager.getSyncQueue()).find(q => q.id === id || q.localId === id);
    if (queueItem) {
      // Get the current server version from the error result (stored in some way or refetched)
      // For now, we'll just increment the version significantly or mark it as a resolve-local action
      queueItem.version = 999999; // Simple "win anytime" versioning for demo, or we'd get server version + 1
      await dbManager.updateSyncQueue(queueItem);
      showNotification('Keeping local version. Will push on next sync.', 'success');
    }
  }

  modal.remove();
  // Trigger sync again to process the resolution
  syncWithServer();
};

function updateSyncStatusUI(status) {
  const icon = document.getElementById('sync-status-icon');
  if (!icon) return;

  if (status === 'synced') {
    icon.className = 'fas fa-cloud-check sync-success';
    icon.title = 'All changes synced';
  } else if (status === 'syncing') {
    icon.className = 'fas fa-sync fa-spin sync-progress';
    icon.title = 'Syncing...';
  } else {
    icon.className = 'fas fa-cloud-slash sync-warning';
    icon.title = 'Working offline';
  }
}

// Override Save/Delete to use DBManager
async function saveExpense(expense) {
  const localId = 'local_' + Date.now();
  const expenseData = {
    ...expense,
    id: localId,
    version: 0,
    status: 'pending'
  };

  await dbManager.saveExpense(expenseData);
  await dbManager.addToSyncQueue({
    localId,
    action: 'create',
    data: expense,
    version: 0
  });

  if (navigator.onLine) syncWithServer();
  return expenseData;
}

async function deleteExpense(id) {
  // If it's a local ID, just remove from DB and queue
  if (id.startsWith('local_')) {
    await dbManager.delete('expenses', id);
    await dbManager.removeFromSyncQueue(id);
  } else {
    // If it's a server ID, mark as pending delete
    const expense = await dbManager.get('expenses', id);
    if (expense) {
      expense.status = 'deleted';
      await dbManager.saveExpense(expense);
      await dbManager.addToSyncQueue({
        id,
        action: 'delete',
        version: expense.version || 0
      });
    }
  }

  if (navigator.onLine) syncWithServer();
  return { success: true };
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  if (authToken && currentUser) {
    initRealTimeSync();
  }
});

// Enhanced notification system
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <i class="fas ${type === 'success' ? 'fa-check-circle' :
      type === 'error' ? 'fa-exclamation-circle' :
        type === 'warning' ? 'fa-exclamation-triangle' :
          'fa-info-circle'}"></i>
      <span>${message}</span>
    </div>
  `;

  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '1rem',
    borderRadius: '8px',
    color: 'white',
    background: type === 'success' ? '#4CAF50' :
      type === 'error' ? '#f44336' :
        type === 'warning' ? '#ff9800' : '#2196F3',
    zIndex: '10000',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    minWidth: '300px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    animation: 'slideIn 0.3s ease-out'
  });

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
  .notification-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
`;
document.head.appendChild(style);

// Export functions for use in other scripts
window.ExpenseSync = {
  initRealTimeSync,
  syncWithServer, // Replaces syncOfflineData
  saveExpense,
  deleteExpense,
  showNotification
};