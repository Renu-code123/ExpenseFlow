// expenseApprovalWorkflow.js
// Temporal.io workflow for distributed expense approval
const { proxyActivities } = require('@temporalio/workflow');
const activities = proxyActivities({ startToCloseTimeout: '1 minute' });

/**
 * Expense Approval Workflow
 * @param {Object} request - Expense approval request
 * @param {string} request.expenseId
 * @param {number} request.amount
 * @param {string} request.submitter
 * @param {string[]} request.approvers
 * @returns {Promise<string>} Workflow result
 */
async function expenseApprovalWorkflow(request) {
  await activities.logEvent('Workflow started', request);
  await activities.validateExpense(request.expenseId, request.amount);
  for (const approver of request.approvers) {
    await activities.notifyApprover(approver, request.expenseId);
    const approved = await activities.waitForApproval(approver, request.expenseId);
    if (!approved) {
      await activities.compensateExpense(request.expenseId);
      await activities.logEvent('Expense rejected', { expenseId: request.expenseId, approver });
      return 'Rejected';
    }
    await activities.logEvent('Expense approved by', { expenseId: request.expenseId, approver });
  }
  await activities.finalizeExpense(request.expenseId);
  await activities.logEvent('Workflow completed', request);
  return 'Approved';
}

exports.expenseApprovalWorkflow = expenseApprovalWorkflow;
