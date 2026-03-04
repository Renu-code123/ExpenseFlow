// expense-approval-api.js
// API server for managing expense approval workflows
const express = require('express');
const bodyParser = require('body-parser');
const { startExpenseApprovalWorkflow, getWorkflowStatus } = require('../temporal/client');

const app = express();
app.use(bodyParser.json());

app.post('/api/expense/submit', async (req, res) => {
  try {
    const handle = await startExpenseApprovalWorkflow(req.body);
    res.json({ workflowId: handle.workflowId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/expense/status/:workflowId', async (req, res) => {
  try {
    const result = await getWorkflowStatus(req.params.workflowId);
    res.json({ status: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3002, () => {
  console.log('Expense Approval API running on http://localhost:3002');
});
