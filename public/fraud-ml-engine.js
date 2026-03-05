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
  /**
   * FraudMLEngine: Streaming analytics engine for AI-powered fraud detection
   * Supports KMeans and DBSCAN clustering, online learning, and outlier scoring.
   * Author: Ayaanshaikh12243
   */
  class FraudMLEngine {
    constructor(windowSize = 1000, clusterCount = 3) {
      this.windowSize = windowSize;
      this.clusterCount = clusterCount;
      this.transactions = [];
      this.model = null;
      this.dbscanModel = null;
      this.alerts = [];
      this.defenseActions = [];
      this.featureExtractor = new FeatureExtractor();
      this.onlineLearning = true;
      this.outlierScores = [];
      this.modelType = 'kmeans'; // or 'dbscan'
    }

    /**
     * Ingest a new transaction and update models
     */
    ingest(transaction) {
      this.transactions.push(transaction);
      if (this.transactions.length > this.windowSize) this.transactions.shift();
      if (this.onlineLearning) this._updateModel();
      this._detectAnomaly(transaction);
      this._updateOutlierScores(transaction);
    }

    /**
     * Update clustering models (KMeans, DBSCAN)
     */
    _updateModel() {
      if (this.transactions.length < 10) return;
      const features = this.transactions.map(tx => this.featureExtractor.extract(tx));
      if (this.modelType === 'kmeans') {
        this.model = KMeans.fit(features, this.clusterCount);
      } else {
        this.dbscanModel = DBSCAN.fit(features, 0.5, 5);
      }
    }

    /**
     * Detect anomaly using selected model
     */
    _detectAnomaly(transaction) {
      if (this.modelType === 'kmeans' && this.model) {
        const feature = this.featureExtractor.extract(transaction);
        const cluster = this.model.predict([feature])[0];
        if (cluster === this.model.anomalyCluster) {
          this._triggerAlert(transaction, 'KMeans anomaly');
          this._triggerDefense(transaction, 'block');
        }
      } else if (this.modelType === 'dbscan' && this.dbscanModel) {
        const feature = this.featureExtractor.extract(transaction);
        const label = this.dbscanModel.predict([feature])[0];
        if (label === -1) {
          this._triggerAlert(transaction, 'DBSCAN outlier');
          this._triggerDefense(transaction, 'escalate');
        }
      }
    }

    /**
     * Update outlier scores for visualization and audit
     */
    _updateOutlierScores(transaction) {
      const feature = this.featureExtractor.extract(transaction);
      let score = 0;
      if (this.modelType === 'kmeans' && this.model) {
        score = KMeans.outlierScore(feature, this.model);
      } else if (this.modelType === 'dbscan' && this.dbscanModel) {
        score = DBSCAN.outlierScore(feature, this.dbscanModel);
      }
      this.outlierScores.push({ id: transaction.id, score });
      if (this.outlierScores.length > this.windowSize) this.outlierScores.shift();
    }

    /**
     * Trigger alert for detected anomaly
     */
    _triggerAlert(transaction, reason = 'anomaly') {
      this.alerts.push({
        transaction,
        timestamp: Date.now(),
        type: 'anomaly',
        reason,
        message: 'Potential fraud detected: ' + reason
      });
    }

    /**
     * Trigger defense action for detected anomaly
     */
    _triggerDefense(transaction, action = 'block') {
      this.defenseActions.push({
        transaction,
        timestamp: Date.now(),
        action,
        message: `Transaction ${action}ed due to anomaly`
      });
    }

    /**
     * Get all alerts
     */
    getAlerts() {
      return this.alerts;
    }

    /**
     * Get all defense actions
     */
    getDefenseActions() {
      return this.defenseActions;
    }

    /**
     * Get outlier scores for visualization
     */
    getOutlierScores() {
      return this.outlierScores;
    }

    /**
     * Switch model type (kmeans/dbscan)
     */
    setModelType(type) {
      if (type === 'kmeans' || type === 'dbscan') {
        this.modelType = type;
        this._updateModel();
      }
    }
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
  /**
   * FeatureExtractor: Extracts features from transactions for ML
   */
  class FeatureExtractor {
    extract(tx) {
      // Features: amount, time, user risk score, device risk, location risk, type
      return [
        Math.log(1 + tx.amount),
        tx.timestamp % 86400000 / 86400000, // time of day
        tx.userRiskScore || 0.5,
        tx.deviceRisk || 0.5,
        tx.locationRisk || 0.5,
        tx.type === 'payment' ? 1 : tx.type === 'refund' ? 0.5 : 0
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
  /**
   * KMeans clustering (dummy implementation)
   */
  class KMeans {
    static fit(features, k) {
      // ...actual clustering logic...
      return {
        predict: (X) => [Math.floor(Math.random() * k)],
        anomalyCluster: k - 1,
        centroids: Array(k).fill().map(() => Array(features[0].length).fill(0))
      };
    }
    static outlierScore(feature, model) {
      // Dummy: distance to random centroid
      let minDist = Infinity;
      for (let c of model.centroids) {
        let dist = KMeans._euclidean(feature, c);
        if (dist < minDist) minDist = dist;
      }
      return minDist;
    }
    static _euclidean(a, b) {
      let sum = 0;
      for (let i = 0; i < a.length; i++) {
        sum += (a[i] - b[i]) ** 2;
      }
      return Math.sqrt(sum);
    }
  }

  /**
   * DBSCAN clustering (dummy implementation)
   */
  class DBSCAN {
    static fit(features, eps, minPts) {
      // ...actual DBSCAN logic...
      return {
        predict: (X) => [Math.random() > 0.95 ? -1 : 1], // -1 = outlier
        labels: features.map(() => 1)
      };
    }
    static outlierScore(feature, model) {
      // Dummy: random score
      return Math.random();
    }
  }

  // Export engine
  export { FraudMLEngine };
  // ...more ML logic, feature extraction, online learning, etc. (expand as needed)

export { FraudMLEngine };
