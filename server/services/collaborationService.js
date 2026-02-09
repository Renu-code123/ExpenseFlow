const Workspace = require('../models/Workspace');
const ApprovalWorkflow = require('../models/ApprovalWorkflow');

class CollaborationService {
  async createWorkspace(ownerId, workspaceData) {
    const workspace = new Workspace({
      ...workspaceData,
      owner: ownerId,
      members: [{ user: ownerId, role: 'admin' }]
    });
    return await workspace.save();
  }

  async addMember(workspaceId, userId, role = 'member') {
    return await Workspace.findByIdAndUpdate(
      workspaceId,
      { $push: { members: { user: userId, role } } },
      { new: true }
    );
  }

  async getUserWorkspaces(userId) {
    return await Workspace.find({ 'members.user': userId });
  }

  async submitForApproval(expenseId, workspaceId, userId) {
    const workflow = new ApprovalWorkflow({
      expense: expenseId,
      workspace: workspaceId,
      submittedBy: userId
    });
    return await workflow.save();
  }

  async approveExpense(workflowId, approverId, comment) {
    return await ApprovalWorkflow.findByIdAndUpdate(
      workflowId,
      { 
        status: 'approved',
        $push: { 
          approvers: { user: approverId, status: 'approved', comment, actionDate: new Date() }
        }
      },
      { new: true }
    );
  }
}

module.exports = new CollaborationService();