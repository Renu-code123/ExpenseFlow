// collab-budget-crdt.js
// CRDT logic for collaborative budget editing using Automerge
import Automerge from 'automerge';

export class BudgetCRDT {
  constructor(doc) {
    this.doc = doc || Automerge.init();
  }

  addItem(item) {
    this.doc = Automerge.change(this.doc, 'Add budget item', doc => {
      if (!doc.items) doc.items = [];
      doc.items.push(item);
    });
    this._saveHistory();
    return this.doc;
  }

  updateItem(index, updates) {
    this.doc = Automerge.change(this.doc, 'Update budget item', doc => {
      Object.assign(doc.items[index], updates);
    });
    this._saveHistory();
    return this.doc;
  }

  removeItem(index) {
    this.doc = Automerge.change(this.doc, 'Remove budget item', doc => {
      doc.items.splice(index, 1);
    });
    this._saveHistory();
    return this.doc;
  }

  getItems() {
    return this.doc.items || [];
  }

  merge(remoteDoc) {
    this.doc = Automerge.merge(this.doc, remoteDoc);
    this._saveHistory();
    return this.doc;
  }

  getChanges() {
    return Automerge.getAllChanges(this.doc);
  }

  applyChanges(changes) {
    this.doc = Automerge.applyChanges(this.doc, changes);
    this._saveHistory();
    return this.doc;
  }

  // Advanced operations
  findItemById(id) {
    return this.getItems().find(item => item.id === id);
  }

  updateItemById(id, updates) {
    const idx = this.getItems().findIndex(item => item.id === id);
    if (idx !== -1) {
      return this.updateItem(idx, updates);
    }
    return this.doc;
  }

  removeItemById(id) {
    const idx = this.getItems().findIndex(item => item.id === id);
    if (idx !== -1) {
      return this.removeItem(idx);
    }
    return this.doc;
  }

  // History, undo/redo
  _saveHistory() {
    if (!this.history) this.history = [];
    this.history.push(Automerge.save(this.doc));
    if (this.history.length > 100) this.history.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.history && this.history.length > 1) {
      const last = this.history.pop();
      this.redoStack = this.redoStack || [];
      this.redoStack.push(last);
      this.doc = Automerge.load(this.history[this.history.length - 1]);
    }
    return this.doc;
  }

  redo() {
    if (this.redoStack && this.redoStack.length > 0) {
      const next = this.redoStack.pop();
      this.doc = Automerge.load(next);
      this.history.push(next);
    }
    return this.doc;
  }

  getHistory() {
    return this.history || [];
  }

  clearHistory() {
    this.history = [];
    this.redoStack = [];
  }
}
