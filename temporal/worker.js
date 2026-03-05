// worker.js
// Temporal.io worker setup for expense approval workflow
const { Worker } = require('@temporalio/worker');
const path = require('path');

async function runWorker() {
  const worker = await Worker.create({
    workflowsPath: require.resolve('./workflows/expenseApprovalWorkflow'),
    activities: {
      ...require('./activities/validation'),
      ...require('./activities/notification'),
      ...require('./activities/logging'),
      ...require('./activities/compensation'),
      ...require('./activities/waitForApproval'),
      finalizeExpense: async (expenseId) => {
        // Simulate finalization logic
        return true;
      }
    },
    taskQueue: 'expense-approval-queue',
  });
  await worker.run();
}

runWorker().catch(err => {
  console.error('Worker failed:', err);
});
