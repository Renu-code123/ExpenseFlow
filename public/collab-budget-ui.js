/* collab-budget-ui.js
   UI logic for collaborative budget editing using CRDT and WebSocket sync
*/
import { BudgetCRDT } from './collab-budget-crdt.js';

class CollaborativeBudgetUI {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.crdt = new BudgetCRDT();
    this.ws = null;
    this.userId = 'user-' + Math.floor(Math.random() * 10000);
    this.initUI();
    this.connectWebSocket();
  }

  initUI() {
    this.container.innerHTML = `
      <div class="collab-budget-header">
        <h2>Collaborative Budget Editor</h2>
        <span id="collab-status">Connecting...</span>
      </div>
      <div id="budget-list"></div>
      <form id="add-budget-form">
        <input type="text" id="item-name" placeholder="Item Name" required />
        <input type="number" id="item-amount" placeholder="Amount" required />
        <button type="submit">Add Item</button>
      </form>
      <div id="collab-users"></div>
    `;
    this.listEl = this.container.querySelector('#budget-list');
    this.formEl = this.container.querySelector('#add-budget-form');
    this.statusEl = this.container.querySelector('#collab-status');
    this.usersEl = this.container.querySelector('#collab-users');
    this.formEl.addEventListener('submit', e => {
      e.preventDefault();
      this.addItem();
    });
  }

  connectWebSocket() {
    this.ws = new WebSocket('ws://localhost:8080');
    this.ws.onopen = () => {
      this.statusEl.textContent = 'Connected';
      this.sendUserJoin();
    };
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'init') {
        this.crdt.doc = this.crdt.merge(JSON.parse(data.doc));
        this.renderList();
      } else if (data.type === 'changes') {
        this.crdt.applyChanges(data.changes);
        this.renderList();
      } else if (data.type === 'user-join') {
        this.renderUsers(data.users);
      }
    };
    this.ws.onclose = () => {
      this.statusEl.textContent = 'Disconnected';
    };
  }

  sendUserJoin() {
    this.ws.send(JSON.stringify({ type: 'user-join', userId: this.userId }));
  }

  addItem() {
    const name = this.formEl.querySelector('#item-name').value;
    const amount = parseFloat(this.formEl.querySelector('#item-amount').value);
    if (!name || isNaN(amount)) return;
    const item = { name, amount, userId: this.userId, timestamp: Date.now() };
    this.crdt.addItem(item);
    // ...existing code...
    import {
      formatCurrency,
      formatDate,
      generateId,
      debounce,
      throttle,
      deepClone,
      isEqual,
      sortByAmount,
      sortByName,
      filterByUser,
      filterByDate
    } from './collab-budget-utils.js';

    class CollaborativeBudgetUI {
      constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.crdt = new BudgetCRDT();
        this.ws = null;
        this.userId = 'user-' + Math.floor(Math.random() * 10000);
        this.sortMode = 'amount';
        this.filterUser = null;
        this.filterDate = null;
        this.initUI();
        this.connectWebSocket();
      }

      initUI() {
        this.container.innerHTML = `
          <div class="collab-budget-header">
            <h2>Collaborative Budget Editor</h2>
            <span id="collab-status">Connecting...</span>
          </div>
          <div class="collab-budget-controls">
            <label>Sort by:
              <select id="sort-mode">
                <option value="amount">Amount</option>
                <option value="name">Name</option>
              </select>
            </label>
            <label>Filter by User:
              <input type="text" id="filter-user" placeholder="User ID" />
            </label>
            <label>Filter by Date:
              <input type="date" id="filter-date" />
            </label>
            <button id="undo-btn">Undo</button>
            <button id="redo-btn">Redo</button>
            <button id="clear-history-btn">Clear History</button>
          </div>
          <div id="budget-list"></div>
          <form id="add-budget-form">
            <input type="text" id="item-name" placeholder="Item Name" required />
            <input type="number" id="item-amount" placeholder="Amount" required />
            <button type="submit">Add Item</button>
          </form>
          <div id="collab-users"></div>
        `;
        this.listEl = this.container.querySelector('#budget-list');
        this.formEl = this.container.querySelector('#add-budget-form');
        this.statusEl = this.container.querySelector('#collab-status');
        this.usersEl = this.container.querySelector('#collab-users');
        this.sortEl = this.container.querySelector('#sort-mode');
        this.filterUserEl = this.container.querySelector('#filter-user');
        this.filterDateEl = this.container.querySelector('#filter-date');
        this.undoBtn = this.container.querySelector('#undo-btn');
        this.redoBtn = this.container.querySelector('#redo-btn');
        this.clearHistoryBtn = this.container.querySelector('#clear-history-btn');

        this.formEl.addEventListener('submit', e => {
          e.preventDefault();
          this.addItem();
        });
        this.sortEl.addEventListener('change', () => {
          this.sortMode = this.sortEl.value;
          this.renderList();
        });
        this.filterUserEl.addEventListener('input', debounce(() => {
          this.filterUser = this.filterUserEl.value || null;
          this.renderList();
        }, 300));
        this.filterDateEl.addEventListener('change', () => {
          this.filterDate = this.filterDateEl.value ? new Date(this.filterDateEl.value) : null;
          this.renderList();
        });
        this.undoBtn.addEventListener('click', () => {
          this.crdt.undo();
          this.renderList();
        });
        this.redoBtn.addEventListener('click', () => {
          this.crdt.redo();
          this.renderList();
        });
        this.clearHistoryBtn.addEventListener('click', () => {
          this.crdt.clearHistory();
          this.renderList();
        });
      }

      connectWebSocket() {
        this.ws = new WebSocket('ws://localhost:8080');
        this.ws.onopen = () => {
          this.statusEl.textContent = 'Connected';
          this.sendUserJoin();
        };
        this.ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'init') {
            this.crdt.doc = this.crdt.merge(JSON.parse(data.doc));
            this.renderList();
          } else if (data.type === 'changes') {
            this.crdt.applyChanges(data.changes);
            this.renderList();
          } else if (data.type === 'user-join') {
            this.renderUsers(data.users);
          }
        };
        this.ws.onclose = () => {
          this.statusEl.textContent = 'Disconnected';
        };
      }

      sendUserJoin() {
        this.ws.send(JSON.stringify({ type: 'user-join', userId: this.userId }));
      }

      addItem() {
        const name = this.formEl.querySelector('#item-name').value;
        const amount = parseFloat(this.formEl.querySelector('#item-amount').value);
        if (!name || isNaN(amount)) return;
        const item = {
          id: generateId(),
          name,
          amount,
          userId: this.userId,
          timestamp: Date.now()
        };
        this.crdt.addItem(item);
        this.sendChanges();
        this.formEl.reset();
        this.renderList();
      }

      updateItem(index, updates) {
        this.crdt.updateItem(index, updates);
        this.sendChanges();
        this.renderList();
      }

      removeItem(index) {
        this.crdt.removeItem(index);
        this.sendChanges();
        this.renderList();
      }

      sendChanges() {
        const changes = this.crdt.getChanges();
        this.ws.send(JSON.stringify({ type: 'changes', changes }));
      }

      renderList() {
        let items = this.crdt.getItems();
        if (this.filterUser) items = filterByUser(items, this.filterUser);
        if (this.filterDate) items = filterByDate(items, this.filterDate);
        if (this.sortMode === 'amount') items = sortByAmount(items);
        else items = sortByName(items);
        this.listEl.innerHTML = '';
        items.forEach((item, idx) => {
          const el = document.createElement('div');
          el.className = 'budget-item';
          el.innerHTML = `
            <span>${item.name}</span>
            <span>${formatCurrency(item.amount)}</span>
            <span>${formatDate(item.timestamp)}</span>
            <span>${item.userId}</span>
            <button data-idx="${idx}" class="edit-btn">Edit</button>
            <button data-idx="${idx}" class="remove-btn">Remove</button>
          `;
          el.querySelector('.edit-btn').onclick = () => this.showEditDialog(idx, item);
          el.querySelector('.remove-btn').onclick = () => this.removeItem(idx);
          this.listEl.appendChild(el);
        });
      }

      showEditDialog(index, item) {
        const dialog = document.createElement('div');
        dialog.className = 'edit-dialog';
        dialog.innerHTML = `
          <form id="edit-form">
            <input type="text" id="edit-name" value="${item.name}" required />
            <input type="number" id="edit-amount" value="${item.amount}" required />
            <button type="submit">Save</button>
            <button type="button" id="cancel-btn">Cancel</button>
          </form>
        `;
        document.body.appendChild(dialog);
        const form = dialog.querySelector('#edit-form');
        form.onsubmit = (e) => {
          e.preventDefault();
          const name = form.querySelector('#edit-name').value;
          const amount = parseFloat(form.querySelector('#edit-amount').value);
          this.updateItem(index, { name, amount });
          document.body.removeChild(dialog);
        };
        dialog.querySelector('#cancel-btn').onclick = () => {
          document.body.removeChild(dialog);
        };
      }

      renderUsers(users) {
        this.usersEl.innerHTML = '<strong>Active Users:</strong> ' + users.join(', ');
      }
    }

    window.CollaborativeBudgetUI = CollaborativeBudgetUI;
