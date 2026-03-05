// secure-analytics-api.js
// Backend API for privacy-preserving analytics with homomorphic encryption
// Provides endpoints for data ingestion, analytics queries, key management, and audit logging

const express = require('express');
const bodyParser = require('body-parser');
const { PaillierKeyPair, generatePaillierKeyPair } = require('./public/homomorphic-crypto.js');
const { SecureAnalyticsEngine } = require('./public/secure-analytics-engine.js');
const { SecureKeyManager } = require('./public/secure-key-manager.js');

const app = express();
app.use(bodyParser.json());

const engine = new SecureAnalyticsEngine();
const keyManager = new SecureKeyManager();
const auditLog = [];

function logAudit(event, details) {
  auditLog.push({ event, details, timestamp: Date.now() });
}

app.post('/api/ingest', (req, res) => {
  const { value, userId } = req.body;
  if (!keyManager.isAuthorized(userId)) {
    logAudit('unauthorized_ingest_attempt', { userId, value });
    return res.status(403).json({ error: 'User not authorized' });
  }
  engine.ingest(value);
  logAudit('data_ingested', { userId, value });
  res.json({ success: true });
});

app.get('/api/analytics/sum', (req, res) => {
  const sum = engine.encryptedSum();
  logAudit('analytics_sum_requested', {});
  res.json({ encryptedSum: sum });
});

app.get('/api/analytics/average', (req, res) => {
  const avg = engine.encryptedAverage();
  logAudit('analytics_average_requested', {});
  res.json({ encryptedAverage: avg });
});

app.get('/api/analytics/raw', (req, res) => {
  res.json({ rawData: engine.getRawData() });
});

app.post('/api/key/authorize', (req, res) => {
  const { userId } = req.body;
  keyManager.authorizeUser(userId);
  logAudit('user_authorized', { userId });
  res.json({ success: true });
});

app.post('/api/key/revoke', (req, res) => {
  const { userId } = req.body;
  keyManager.revokeUser(userId);
  logAudit('user_revoked', { userId });
  res.json({ success: true });
});

app.get('/api/audit', (req, res) => {
  res.json({ auditLog });
});

app.listen(3001, () => {
  console.log('Secure Analytics API running on http://localhost:3001');
});
