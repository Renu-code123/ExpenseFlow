const jwt = require('jsonwebtoken');
const Workspace = require('../models/Workspace');
const User = require('../models/User');
const emailService = require('./emailService');

class InvitationService {
    /**
     * Create and send invitation
     * @param {string} workspaceId - ID of workspace
     * @param {string} email - Invite email
     * @param {string} role - Invited role
     * @param {Object} invitedBy - User object who invited
     */
    async inviteUser(workspaceId, email, role, invitedBy) {
        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) throw new Error('Workspace not found');

        // Check if user already in workspace
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            const isMember = workspace.members.find(m => m.user.toString() === existingUser._id.toString());
            if (isMember) throw new Error('User is already a member of this workspace');
        }

        // Generate invitation token
        const token = jwt.sign(
            { workspaceId, email: email.toLowerCase(), role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/join-workspace.html?token=${token}`;

        // Send email
        await emailService.sendWorkspaceInvitation(email, {
            workspaceName: workspace.name,
            invitedBy: invitedBy.name,
            role,
            inviteLink
        });

        return { success: true, token };
    }

    /**
     * Verify invitation token and join workspace
     * @param {string} token - Invitation token
     * @param {string} userId - ID of user joining
     */
    async joinWorkspace(token, userId) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const { workspaceId, email, role } = decoded;

            const user = await User.findById(userId);
            if (!user) throw new Error('User not found');

            // Verify email match (optional, but safer)
            if (user.email.toLowerCase() !== email.toLowerCase()) {
                throw new Error('This invitation was sent to a different email address');
            }

            const workspace = await Workspace.findById(workspaceId);
            if (!workspace) throw new Error('Workspace not found');

            // Check if already a member
            const isMember = workspace.members.find(m => m.user.toString() === userId.toString());
            if (isMember) throw new Error('You are already a member of this workspace');

            // Add to members
            workspace.members.push({
                user: userId,
                role: role || 'viewer',
                joinedAt: new Date()
            });

            await workspace.save();
            return { success: true, workspaceName: workspace.name };
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error('Invitation link has expired');
            }
            throw error;
        }
    }
}

module.exports = new InvitationService();
