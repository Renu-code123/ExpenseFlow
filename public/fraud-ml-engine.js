// fraud-ml-engine.js
// Streaming analytics engine for AI-powered fraud detection
// This module uses KMeans clustering for unsupervised anomaly detection
// and maintains a rolling window of transactions for adaptive learning.

class FraudMLEngine {
  constructor(windowSize = 1000, clusterCount = 3) {
    this.windowSize = windowSize;
    this.clusterCount = clusterCount;
    this.transactions = [];
    this.model = null;
    this.alerts = [];
    this.defenseActions = [];
    this.featureExtractor = new FeatureExtractor();
  }

  ingest(transaction) {
    this.transactions.push(transaction);
    if (this.transactions.length > this.windowSize) this.transactions.shift();
    this._updateModel();
    this._detectAnomaly(transaction);
  }

  _updateModel() {
    if (this.transactions.length < 10) return;
    const features = this.transactions.map(tx => this.featureExtractor.extract(tx));
    this.model = KMeans.fit(features, this.clusterCount);
  }

  _detectAnomaly(transaction) {
    if (!this.model) return;
    const feature = this.featureExtractor.extract(transaction);
    const cluster = this.model.predict([feature])[0];
    if (cluster === this.model.anomalyCluster) {
      this._triggerAlert(transaction);
      this._triggerDefense(transaction);
    }
  }

  _triggerAlert(transaction) {
    this.alerts.push({
      transaction,
      timestamp: Date.now(),
      type: 'anomaly',
      message: 'Potential fraud detected'
    });
  }

  _triggerDefense(transaction) {
    this.defenseActions.push({
      transaction,
      timestamp: Date.now(),
      action: 'block',
      message: 'Transaction blocked due to anomaly'
    });
  }

  getAlerts() {
    return this.alerts;
  }

  getDefenseActions() {
    return this.defenseActions;
  }
}

class FeatureExtractor {
  extract(tx) {
    // Example: amount, time, user risk score, device risk, location risk
    return [
      Math.log(1 + tx.amount),
      tx.timestamp % 86400000 / 86400000, // time of day
      tx.userRiskScore || 0.5,
      tx.deviceRisk || 0.5,
      tx.locationRisk || 0.5
    ];
  }
}

// Dummy KMeans implementation for demonstration
class KMeans {
  static fit(features, k) {
    // ...actual clustering logic...
    return {
      predict: (X) => [Math.floor(Math.random() * k)],
      anomalyCluster: k - 1
    };
  }
}

export { FraudMLEngine };
