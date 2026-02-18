# Intelligent Financial Anomaly Detection & Risk Scoring

## 🚀 Overview
Issue #645 implements a security-first layer for financial tracking. It uses statistical modeling (Z-scores and Standard Deviation) to automatically flag unusual transactions, protecting users from fraud and helping them identify significant spending deviations.

## 🏗️ Technical Architecture

### 1. Statistical Core (`utils/statisticalMath.js`)
The engine is powered by standard statistical algorithms:
- **Z-Score Analysis**: Measures how many standard deviations an amount is from the user's mean. Anything > 3.0 is flagged as an extreme outlier.
- **IQR (Interquartile Range)**: Used as a fallback for non-normal distributions to find outlier thresholds.
- **Moving Averages**: Tracks spending velocity over time.

### 2. Risk Profiling (`models/RiskProfile.js`)
Every user has a dynamic `RiskProfile` that stores:
- **Baselines**: Calculated mean and standard deviation for overall spending.
- **Category Benchmarks**: Typical spending amounts for specifically categorized items (e.g., Food, Transport).
- **Historical Flags**: An audit trail of every transaction that was ever flagged as suspicious.

### 3. Real-time Fraud Guard (`middleware/fraudGuard.js`)
A proactive middleware that intercepts every new transaction. It:
- Synchronously passes the transaction through the **AnomalyService**.
- Generates a **Risk Score (0-100)**.
- If the score exceeds 75, it triggers an immediate high-priority notification via the `NotificationHub`.

### 4. Anomaly Service (`services/anomalyService.js`)
The central orchestrator that analyzes:
- **Amount Outliers**: Extreme deviations from average.
- **Category Spikes**: Unusual increases in specific spending areas.
- **Merchant Novelty**: Large payments to previously unseen merchants.

### 5. Trend Analyzer Job (`jobs/trendAnalyzer.js`)
An autonomous worker that runs nightly to:
- Recalculate all user baselines based on the latest 30 days of data.
- Evolve the risk profiles as user habits change (ensuring the system doesn't stay static).

## 🛠️ API Reference

### `GET /api/security/risk-profile`
Returns the user's current statistical baselines and list of historical flags.

### `GET /api/security/anomalies`
Lists all transactions currently flagged as anomalies by the engine.

### `POST /api/security/recalculate-baselines`
Triggers an on-demand baseline update (useful after bulk imports).

## ✅ Implementation Checklist
- [x] Statistical utility with standard deviation logic.
- [x] Risk metadata added to `Transaction` schema.
- [x] In-memory interception via `fraudGuard` middleware.
- [x] Notification integration for high-risk alerts.
- [x] Nightly cron job for baseline maintenance.

## 🧪 Testing
Run the anomaly detection test suite:
```bash
npm test tests/anomaly.test.js
```
