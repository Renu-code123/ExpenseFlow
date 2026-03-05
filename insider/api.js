// Insider Threat Detection API Integration Example
const express = require('express');
const app = express();
const orchestrator = require('./insider-orchestrator');

app.use(express.json());

app.post('/activity', (req, res) => {
    const { userId, activity } = req.body;
    orchestrator.monitorUser(userId, activity);
    res.json({ success: true });
});

app.get('/alerts', (req, res) => {
    res.json({ alerts: orchestrator.getAlerts() });
});

app.post('/report', (req, res) => {
    const { filePath } = req.body;
    orchestrator.generateReport(filePath || 'insider-threat-report.json');
    res.json({ success: true, filePath: filePath || 'insider-threat-report.json' });
});

app.listen(4002, () => {
    console.log('Insider Threat Detection API running on port 4002');
});
