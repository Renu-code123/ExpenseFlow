/**
 * IndexedDB Manager for Offline-First Support
 */
class DBManager {
    constructor() {
        this.dbName = 'ExpenseFlowDB';
        this.dbVersion = 2; // Increment version for new store
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store for all expenses (mirrors server)
                if (!db.objectStoreNames.contains('expenses')) {
                    const expenseStore = db.createObjectStore('expenses', { keyPath: 'id' });
                    expenseStore.createIndex('userId', 'userId', { unique: false });
                    expenseStore.createIndex('version', 'version', { unique: false });
                }

                // Store for pending sync operations
                if (!db.objectStoreNames.contains('syncQueue')) {
                    db.createObjectStore('syncQueue', { keyPath: 'localId', autoIncrement: true });
                }

                // Store for app metadata (lastSyncTime, etc)
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
                
                // Store for forecast data (Issue #470)
                if (!db.objectStoreNames.contains('forecasts')) {
                    const forecastStore = db.createObjectStore('forecasts', { keyPath: 'id' });
                    forecastStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('IndexedDB Error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async getAllExpenses() {
        return this.getAll('expenses');
    }

    async saveExpense(expense) {
        // Ensure id is present, if it's a new local expense, it might have a temp id
        return this.put('expenses', expense);
    }

    async deleteExpense(id) {
        return this.delete('expenses', id);
    }

    async addToSyncQueue(change) {
        // change: { id, localId, version, data, action: 'create'|'update'|'delete' }
        return this.add('syncQueue', {
            ...change,
            timestamp: Date.now()
        });
    }

    async getSyncQueue() {
        return this.getAll('syncQueue');
    }

    async clearSyncQueue() {
        return this.clear('syncQueue');
    }

    async removeFromSyncQueue(localId) {
        return this.delete('syncQueue', localId);
    }

    async setMetadata(key, value) {
        return this.put('metadata', { key, value });
    }

    async getMetadata(key) {
        const result = await this.get('metadata', key);
        return result ? result.value : null;
    }

    // Generic helpers
    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async put(storeName, item) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(item);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async add(storeName, item) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(item);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    // ========================
    // FORECAST DATA METHODS (Issue #470)
    // ========================
    
    async saveForecast(forecastData) {
        const data = {
            id: 'latest',
            timestamp: new Date(),
            ...forecastData
        };
        return this.put('forecasts', data);
    }
    
    async getForecast() {
        return this.get('forecasts', 'latest');
    }
    
    async clearForecast() {
        return this.delete('forecasts', 'latest');
    }
}

const dbManager = new DBManager();
// Initialize on script load
dbManager.init().then(() => console.log('DBManager initialized'));
