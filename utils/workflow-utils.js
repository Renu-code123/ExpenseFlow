// workflow-utils.js
// Utility functions for distributed workflow orchestration

function generateExpenseId() {
  return 'exp-' + Math.random().toString(36).substr(2, 9);
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function logAudit(event, details) {
  // Simulate audit logging
  console.log(`[AUDIT] ${event}:`, details);
}

function retry(fn, retries = 3, delay = 1000) {
  return async function(...args) {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn(...args);
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(res => setTimeout(res, delay));
      }
    }
  };
}

function compensateWorkflow(expenseId) {
  // Simulate compensation logic
  logAudit('compensation_triggered', { expenseId });
  return true;
}

function notifyMonitoring(event, details) {
  // Simulate sending event to monitoring system
  console.log(`[MONITOR] ${event}:`, details);
}

module.exports = {
  generateExpenseId,
  formatDate,
  logAudit,
  retry,
  compensateWorkflow,
  notifyMonitoring
};
