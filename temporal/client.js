// client.js
// Temporal.io client for starting and querying expense approval workflows
const { Connection, WorkflowClient } = require('@temporalio/client');

async function startExpenseApprovalWorkflow(request) {
  const connection = await Connection.connect();
  const client = new WorkflowClient(connection.service);
  const handle = await client.start('expenseApprovalWorkflow', {
    taskQueue: 'expense-approval-queue',
    workflowId: `expense-${request.expenseId}`,
    args: [request],
  });
  return handle;
}

async function getWorkflowStatus(workflowId) {
  const connection = await Connection.connect();
  const client = new WorkflowClient(connection.service);
  const handle = client.getHandle(workflowId);
  return await handle.result();
}

module.exports = { startExpenseApprovalWorkflow, getWorkflowStatus };
