// fraud-dashboard.js
// UI dashboard for streaming fraud analytics and adaptive defense
import { FraudMLEngine } from './fraud-ml-engine.js';
import { FraudStreamConnector } from './fraud-stream-connector.js';
import { FraudDefenseActions } from './fraud-defense-actions.js';
import { formatDate } from './fraud-utils.js';

class FraudDashboard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.engine = new FraudMLEngine();
    this.stream = new FraudStreamConnector(this.engine);
    this.defense = new FraudDefenseActions();
    this.transactions = [];
    this.initUI();
    this.stream.onTransaction(tx => this.onTransaction(tx));
    this.stream.start();
  }

  initUI() {
    this.container.innerHTML = `
      <div class="fraud-header">
        <h2>AI-Powered Fraud Detection Dashboard</h2>
      </div>
      <div id="fraud-alerts"></div>
      <div id="fraud-defenses"></div>
      <div id="fraud-transactions"></div>
    `;
    this.alertsEl = this.container.querySelector('#fraud-alerts');
    this.defensesEl = this.container.querySelector('#fraud-defenses');
    this.txEl = this.container.querySelector('#fraud-transactions');
  }

  onTransaction(tx) {
    this.transactions.push(tx);
    if (this.transactions.length > 100) this.transactions.shift();
    this.renderTransactions();
    this.renderAlerts();
    this.renderDefenses();
  }

  renderTransactions() {
    this.txEl.innerHTML = '<h3>Recent Transactions</h3>' +
      '<ul>' +
      this.transactions.map(tx => `<li>${tx.id} | $${tx.amount.toFixed(2)} | ${tx.userId} | ${formatDate(tx.timestamp)}</li>`).join('') +
      '</ul>';
  }

  renderAlerts() {
    const alerts = this.engine.getAlerts();
    this.alertsEl.innerHTML = '<h3>Fraud Alerts</h3>' +
      '<ul>' +
      alerts.map(a => `<li>${a.message} | ${a.transaction.id} | ${formatDate(a.timestamp)}</li>`).join('') +
      '</ul>';
  }

  renderDefenses() {
    const defenses = this.engine.getDefenseActions().concat(this.defense.getActions());
    this.defensesEl.innerHTML = '<h3>Defense Actions</h3>' +
      '<ul>' +
      defenses.map(d => `<li>${d.action} | ${d.transaction ? d.transaction.id : d.userId} | ${d.message} | ${formatDate(d.timestamp)}</li>`).join('') +
      '</ul>';
  }
}

window.FraudDashboard = FraudDashboard;
