// Data Retention & Deletion API Integration Example
const express = require('express');
const app = express();
const orchestrator = require('./retention-orchestrator');

app.use(express.json());

app.post('/policy', (req, res) => {
    const { type, durationDays, appliesTo } = req.body;
    orchestrator.addPolicy(type, durationDays, appliesTo);
    res.json({ success: true });
});

app.post('/record', (req, res) => {
    const { id, type, createdAt } = req.body;
    orchestrator.addRecord(id, type, createdAt);
    res.json({ success: true });
});

app.post('/enforce', (req, res) => {
    orchestrator.enforceRetention();
    res.json({ success: true });
});

app.get('/logs', (req, res) => {
    res.json({ logs: orchestrator.getLogs() });
});

app.listen(4004, () => {
    console.log('Data Retention API running on port 4004');
});
