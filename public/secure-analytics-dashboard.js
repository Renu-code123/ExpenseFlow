// secure-analytics-dashboard.js
// UI dashboard for privacy-preserving analytics with homomorphic encryption
import { SecureAnalyticsEngine } from './secure-analytics-engine.js';
import { SecureDataIngestor } from './secure-data-ingestor.js';
import { SecureKeyManager } from './secure-key-manager.js';
import { formatDate } from './secure-analytics-utils.js';

class SecureAnalyticsDashboard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.engine = new SecureAnalyticsEngine();
    this.ingestor = new SecureDataIngestor(this.engine);
    this.keyManager = new SecureKeyManager();
    this.data = [];
    this.initUI();
    this.ingestor.onIngest(value => this.onIngest(value));
  }

  initUI() {
    this.container.innerHTML = `
      <div class="secure-header">
        <h2>Privacy-Preserving Analytics Dashboard</h2>
      </div>
      <form id="secure-ingest-form">
        <input type="number" id="secure-value" placeholder="Enter value" required />
        <button type="submit">Ingest Securely</button>
      </form>
      <div id="secure-analytics-results"></div>
      <div id="secure-raw-data"></div>
    `;
    this.formEl = this.container.querySelector('#secure-ingest-form');
    this.resultsEl = this.container.querySelector('#secure-analytics-results');
    this.rawEl = this.container.querySelector('#secure-raw-data');
    this.formEl.addEventListener('submit', e => {
      e.preventDefault();
      const value = parseFloat(this.formEl.querySelector('#secure-value').value);
      if (!isNaN(value)) {
        this.ingestor.ingest(value);
        this.formEl.reset();
      }
    });
    this.renderResults();
    this.renderRawData();
  }

  onIngest(value) {
    this.data.push({ value, timestamp: Date.now() });
    this.renderResults();
    this.renderRawData();
  }

  renderResults() {
    const encryptedSum = this.engine.encryptedSum();
    const encryptedAvg = this.engine.encryptedAverage();
    this.resultsEl.innerHTML = `
      <h3>Encrypted Analytics Results</h3>
      <ul>
        <li>Encrypted Sum: ${encryptedSum}</li>
        <li>Encrypted Average: ${encryptedAvg}</li>
      </ul>
    `;
  }

  renderRawData() {
    this.rawEl.innerHTML = '<h3>Raw Data (for demo)</h3>' +
      '<ul>' +
      this.data.map(d => `<li>${d.value} | ${formatDate(d.timestamp)}</li>`).join('') +
      '</ul>';
  }
}

window.SecureAnalyticsDashboard = SecureAnalyticsDashboard;
