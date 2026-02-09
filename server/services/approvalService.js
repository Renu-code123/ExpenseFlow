const Transaction = require('../models/Transaction');
const ApprovalWorkflow = require('../models/ApprovalWorkflow');
const Team = require('../models/Team');
const User = require('../models/User');

class ApprovalService {
    /**
   * Check if a transaction requires approval
   */
    async requiresApproval(transactionData, workspaceId) {
        // Logic: If amount > team/user limit, return true
        const user = await User.findById(transactionData.user);
        const team = await Team.findOne({ 'members.user': user._id });

        if (team && transactionData.amount > team.approvalLimit) {
            return true;
        }

        const workflow = await this.getApplicableWorkflow(transactionData);
        if (workflow && workflow.steps.length > 0) {
            // Check if first step has an auto-approve threshold
            if (workflow.steps[0].autoApproveUnder && transactionData.amount > workflow.steps[0].autoApproveUnder) {
                return true;
            }
        }

        return false;
    }

    /**
     * Submit an expense for approval
       */
    async submitForApproval(transactionId, userId) {
        const transaction = await Transaction.findOne({ _id: transactionId, user: userId });
        if (!transaction) throw new Error('Transaction not found');

        if (transaction.approvalStatus !== 'draft') {
            throw new Error('Transaction already submitted or processed');
        }

        // Identify workflow
        const workflow = await this.getApplicableWorkflow(transaction);

        transaction.approvalStatus = 'pending';
        transaction.submissionDate = new Date();
        transaction.auditTrail.push({
            action: 'submission',
            user: userId,
            details: `Submitted for approval using workflow: ${workflow.name}`
        });

        await transaction.save();

        // Notify first level approvers
        await this.notifyApprovers(transaction, workflow, 1);

        return transaction;
    }

    /**
     * Approve an expense
     */
    async approveTransaction(transactionId, approverId, comment) {
        const transaction = await Transaction.findById(transactionId);
        if (!transaction) throw new Error('Transaction not found');

        if (transaction.approvalStatus !== 'pending') {
            throw new Error('Transaction is not in pending state');
        }

        transaction.approvalStatus = 'approved';
        transaction.approver = approverId;

        if (comment) {
            transaction.approvalComments.push({
                user: approverId,
                comment: comment
            });
        }

        transaction.auditTrail.push({
            action: 'approval',
            user: approverId,
            details: 'Transaction approved'
        });

        await transaction.save();
        return transaction;
    }

    /**
     * Reject an expense
     */
    async rejectTransaction(transactionId, approverId, comment) {
        if (!comment) throw new Error('Reason for rejection is mandatory');

        const transaction = await Transaction.findById(transactionId);
        if (!transaction) throw new Error('Transaction not found');

        transaction.approvalStatus = 'rejected';
        transaction.approver = approverId;

        transaction.approvalComments.push({
            user: approverId,
            comment: comment
        });

        transaction.auditTrail.push({
            action: 'rejection',
            user: approverId,
            details: `Transaction rejected: ${comment}`
        });

        await transaction.save();
        return transaction;
    }

    /**
     * Find applicable workflow based on transaction and user
     */
    async getApplicableWorkflow(transaction) {
        const user = await User.findById(transaction.user);

        // Logic: Look for department specific workflow, then default
        let workflow = await ApprovalWorkflow.findOne({
            department: transaction.department || 'General',
            isActive: true
        });

        if (!workflow) {
            workflow = await ApprovalWorkflow.findOne({ isDefault: true, isActive: true });
        }

        if (!workflow) {
            // Create a basic default one if none exists
            workflow = new ApprovalWorkflow({
                name: 'Standard Approval',
                isDefault: true,
                steps: [{ order: 1, approverRole: 'manager' }]
            });
            await workflow.save();
        }

        return workflow;
    }

    /**
     * Notify approvers for the current step
     */
    async notifyApprovers(transaction, workflow, stepOrder) {
        // Placeholder for notification logic (Email/Push)
        console.log(`[ApprovalService] Notifying approvers for step ${stepOrder} of ${workflow.name}`);
    }

    /**
     * Get pending approvals for a manager
     */
    async getPendingApprovals(managerId) {
        // In a real system, we'd check if managerId is an approver for these transactions
        return await Transaction.find({
            approvalStatus: 'pending'
        }).populate('user', 'name email');
    }
}

module.exports = new ApprovalService();
