// fraud-stream-connector.js
// Streaming connector for ingesting transactions in real time
// Simulates a real-time transaction stream for the fraud engine

class FraudStreamConnector {
  constructor(engine) {
    this.engine = engine;
    this.listeners = [];
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._interval = setInterval(() => {
      const tx = this._generateTransaction();
      this.engine.ingest(tx);
      this._notifyListeners(tx);
    }, 500);
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
    this.running = false;
  }

  onTransaction(listener) {
    this.listeners.push(listener);
  }

  _notifyListeners(tx) {
    this.listeners.forEach(fn => fn(tx));
  }

  _generateTransaction() {
    return {
      id: 'tx-' + Math.random().toString(36).substr(2, 9),
      amount: Math.random() * 1000,
      timestamp: Date.now(),
      userRiskScore: Math.random(),
      deviceRisk: Math.random(),
      locationRisk: Math.random(),
      userId: 'user-' + Math.floor(Math.random() * 10000)
    };
  }
}

export { FraudStreamConnector };
