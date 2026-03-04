// secure-data-ingestor.js
// Secure data ingestion and encryption for privacy-preserving analytics
import { SecureAnalyticsEngine } from './secure-analytics-engine.js';

class SecureDataIngestor {
  constructor(engine) {
    this.engine = engine;
    this.listeners = [];
  }

  ingest(value) {
    this.engine.ingest(value);
    this._notifyListeners(value);
  }

  onIngest(listener) {
    this.listeners.push(listener);
  }

  _notifyListeners(value) {
    this.listeners.forEach(fn => fn(value));
  }
}

export { SecureDataIngestor };
