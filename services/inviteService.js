const WorkspaceInvite = require('../models/WorkspaceInvite');
const Workspace = require('../models/Workspace');
const User = require('../models/User');
const nodemailer = require('nodemailer');

/**
 * Workspace Invite Service
 * Issue #420: Token-based email invite system
 */

class InviteService {
  constructor() {
    // Initialize email transporter
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // Base URL for invite links
    this.baseUrl = process.env.APP_URL || 'http://localhost:3000';
  }

  /**
   * Create and send workspace invite
   * @param {Object} params - Invite parameters
   * @returns {Object} Created invite
   */
  async createInvite({
    workspaceId,
    email,
    role = 'viewer',
    invitedById,
    message = '',
    expiryDays = 7
  }) {
    // Validate workspace exists
    const workspace = await Workspace.findById(workspaceId)
      .populate('owner', 'name email');
    
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Check if workspace has reached member limit
    if (workspace.inviteSettings?.maxMembers && 
        workspace.members.length >= workspace.inviteSettings.maxMembers) {
      throw new Error('Workspace has reached maximum member limit');
    }

    // Check domain restriction
    if (workspace.inviteSettings?.domainRestriction) {
      const allowedDomain = workspace.inviteSettings.domainRestriction;
      if (!email.toLowerCase().endsWith(allowedDomain.toLowerCase())) {
        throw new Error(`Only emails from ${allowedDomain} are allowed`);
      }
    }

    // Check if user is already a member
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      const isMember = workspace.members.some(
        m => m.user.toString() === existingUser._id.toString()
      );
      if (isMember) {
        throw new Error('User is already a member of this workspace');
      }
    }

    // Check if there's already a pending invite
    const pendingInvite = await WorkspaceInvite.isPendingInvite(workspaceId, email);
    if (pendingInvite) {
      throw new Error('There is already a pending invite for this email');
    }

    // Generate secure token
    const { token, tokenHash } = WorkspaceInvite.generateToken();

    // Calculate expiry date
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    // Create invite
    const invite = new WorkspaceInvite({
      workspace: workspaceId,
      email: email.toLowerCase(),
      role,
      token,
      tokenHash,
      invitedBy: invitedById,
      message,
      expiresAt
    });

    await invite.save();

    // Log activity
    workspace.logActivity('invite:created', invitedById, {
      targetEmail: email,
      role
    });
    await workspace.save();

    // Send invite email
    await this.sendInviteEmail(invite, workspace);

    return {
      invite: {
        _id: invite._id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt,
        expiresIn: invite.expiresIn
      },
      inviteLink: this.getInviteLink(token)
    };
  }

  /**
   * Get invite link URL
   */
  getInviteLink(token) {
    return `${this.baseUrl}/join-workspace.html?token=${token}`;
  }

  /**
   * Send invite email
   */
  async sendInviteEmail(invite, workspace) {
    const inviter = await User.findById(invite.invitedBy);
    const inviteLink = this.getInviteLink(invite.token);

    const roleDescriptions = {
      manager: 'can manage members and workspace settings',
      editor: 'can add and edit expenses',
      viewer: 'can view expenses and reports'
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
          .content { background: #f8f9fa; padding: 30px; border: 1px solid #e9ecef; }
          .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
          .role-badge { display: inline-block; background: #667eea; color: white; padding: 4px 12px; border-radius: 12px; font-size: 14px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          .message-box { background: white; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 You're Invited!</h1>
            <p>Join ${workspace.name} on ExpenseFlow</p>
          </div>
          <div class="content">
            <p>Hi there,</p>
            <p><strong>${inviter?.name || 'A team member'}</strong> has invited you to join the workspace <strong>${workspace.name}</strong> on ExpenseFlow.</p>
            
            <p>Your role: <span class="role-badge">${invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}</span></p>
            <p>As a ${invite.role}, you ${roleDescriptions[invite.role] || 'can collaborate with the team'}.</p>
            
            ${invite.message ? `
              <div class="message-box">
                <strong>Message from ${inviter?.name || 'the inviter'}:</strong>
                <p>${invite.message}</p>
              </div>
            ` : ''}
            
            <div style="text-align: center;">
              <a href="${inviteLink}" class="button">Accept Invitation</a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              This invitation will expire in ${invite.expiresIn}.<br>
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${inviteLink}" style="color: #667eea;">${inviteLink}</a>
            </p>
          </div>
          <div class="footer">
            <p>ExpenseFlow - Smart Money Management</p>
            <p>If you didn't expect this invitation, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from: `"ExpenseFlow" <${process.env.SMTP_USER || 'noreply@expenseflow.com'}>`,
        to: invite.email,
        subject: `${inviter?.name || 'Someone'} invited you to join ${workspace.name} on ExpenseFlow`,
        html: htmlContent
      });

      // Update invite with email sent info
      invite.emailSentAt = new Date();
      invite.emailSentCount = (invite.emailSentCount || 0) + 1;
      await invite.save();

      return true;
    } catch (error) {
      console.error('Failed to send invite email:', error);
      // Don't throw - invite is still created, just email failed
      return false;
    }
  }

  /**
   * Resend invite email
   */
  async resendInvite(inviteId, resenderId) {
    const invite = await WorkspaceInvite.findById(inviteId)
      .populate('workspace', 'name');
    
    if (!invite) {
      throw new Error('Invite not found');
    }

    if (invite.status !== 'pending') {
      throw new Error('Cannot resend - invite is no longer pending');
    }

    if (invite.isExpired()) {
      throw new Error('Cannot resend - invite has expired');
    }

    // Rate limit: max 3 emails per invite
    if (invite.emailSentCount >= 3) {
      throw new Error('Maximum resend limit reached for this invite');
    }

    const workspace = await Workspace.findById(invite.workspace);
    const success = await this.sendInviteEmail(invite, workspace);

    return { success, invite };
  }

  /**
   * Accept invite and join workspace
   */
  async acceptInvite(token, userId) {
    // Find invite by token
    const invite = await WorkspaceInvite.findByToken(token);
    
    if (!invite) {
      throw new Error('Invalid or expired invitation');
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify email matches (optional - can be removed to allow any logged-in user)
    // if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    //   throw new Error('This invitation was sent to a different email address');
    // }

    // Get workspace
    const workspace = await Workspace.findById(invite.workspace);
    if (!workspace) {
      throw new Error('Workspace no longer exists');
    }

    // Check if user is already a member
    const existingMember = workspace.members.find(
      m => m.user.toString() === userId.toString()
    );
    if (existingMember) {
      // Mark invite as accepted anyway
      await invite.accept(userId);
      throw new Error('You are already a member of this workspace');
    }

    // Add user to workspace
    workspace.members.push({
      user: userId,
      role: invite.role,
      invitedBy: invite.invitedBy,
      inviteAcceptedAt: new Date(),
      joinedAt: new Date(),
      status: 'active'
    });

    // Log activity
    workspace.logActivity('member:joined', userId, {
      role: invite.role,
      invitedBy: invite.invitedBy
    });

    await workspace.save();

    // Mark invite as accepted
    await invite.accept(userId);

    return {
      workspace: {
        _id: workspace._id,
        name: workspace.name,
        description: workspace.description
      },
      role: invite.role,
      message: `Successfully joined ${workspace.name} as ${invite.role}`
    };
  }

  /**
   * Decline invite
   */
  async declineInvite(token) {
    const invite = await WorkspaceInvite.findByToken(token);
    
    if (!invite) {
      throw new Error('Invalid or expired invitation');
    }

    await invite.decline();

    return { success: true, message: 'Invitation declined' };
  }

  /**
   * Revoke invite (by workspace admin)
   */
  async revokeInvite(inviteId, revokedById, workspaceId) {
    const invite = await WorkspaceInvite.findOne({
      _id: inviteId,
      workspace: workspaceId,
      status: 'pending'
    });

    if (!invite) {
      throw new Error('Invite not found or already processed');
    }

    await invite.revoke(revokedById);

    // Log activity
    const workspace = await Workspace.findById(workspaceId);
    workspace.logActivity('invite:revoked', revokedById, {
      targetEmail: invite.email
    });
    await workspace.save();

    return { success: true, message: 'Invitation revoked' };
  }

  /**
   * Get pending invites for a workspace
   */
  async getWorkspaceInvites(workspaceId) {
    return WorkspaceInvite.getPendingInvites(workspaceId);
  }

  /**
   * Get user's pending invites
   */
  async getUserInvites(email) {
    return WorkspaceInvite.getUserPendingInvites(email);
  }

  /**
   * Get invite details by token (for preview page)
   */
  async getInviteDetails(token) {
    const invite = await WorkspaceInvite.findByToken(token);
    
    if (!invite) {
      return null;
    }

    // Track view
    await invite.trackView();

    return {
      workspace: invite.workspace,
      invitedBy: invite.invitedBy,
      role: invite.role,
      message: invite.message,
      expiresIn: invite.expiresIn,
      isValid: invite.isValid()
    };
  }

  /**
   * Generate shareable invite link (for open workspaces)
   */
  async generateShareableLink(workspaceId, role = 'viewer', expiryDays = 30) {
    const workspace = await Workspace.findById(workspaceId);
    
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    if (!workspace.inviteSettings?.inviteLinkEnabled) {
      throw new Error('Invite links are not enabled for this workspace');
    }

    const { token, tokenHash } = WorkspaceInvite.generateToken();
    
    workspace.inviteSettings.inviteLinkToken = tokenHash;
    workspace.inviteSettings.inviteLinkRole = role;
    workspace.inviteSettings.inviteLinkExpiry = new Date(
      Date.now() + expiryDays * 24 * 60 * 60 * 1000
    );
    
    await workspace.save();

    return {
      link: `${this.baseUrl}/join-workspace.html?link=${token}`,
      expiresAt: workspace.inviteSettings.inviteLinkExpiry,
      role
    };
  }

  /**
   * Join via shareable link
   */
  async joinViaLink(linkToken, userId) {
    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(linkToken).digest('hex');

    const workspace = await Workspace.findOne({
      'inviteSettings.inviteLinkToken': tokenHash,
      'inviteSettings.inviteLinkEnabled': true,
      'inviteSettings.inviteLinkExpiry': { $gt: new Date() }
    });

    if (!workspace) {
      throw new Error('Invalid or expired invite link');
    }

    // Check if already a member
    const existingMember = workspace.members.find(
      m => m.user.toString() === userId.toString()
    );
    if (existingMember) {
      throw new Error('You are already a member of this workspace');
    }

    // Check member limit
    if (workspace.inviteSettings?.maxMembers && 
        workspace.members.length >= workspace.inviteSettings.maxMembers) {
      throw new Error('Workspace has reached maximum member limit');
    }

    // Add member
    const role = workspace.inviteSettings.inviteLinkRole || 'viewer';
    workspace.members.push({
      user: userId,
      role,
      joinedAt: new Date(),
      status: 'active'
    });

    workspace.logActivity('member:joined', userId, {
      role,
      joinMethod: 'invite_link'
    });

    await workspace.save();

    return {
      workspace: {
        _id: workspace._id,
        name: workspace.name,
        description: workspace.description
      },
      role,
      message: `Successfully joined ${workspace.name} as ${role}`
    };
  }

  /**
   * Cleanup expired invites (call via cron)
   */
  async cleanupExpiredInvites() {
    const result = await WorkspaceInvite.updateMany(
      {
        status: 'pending',
        expiresAt: { $lt: new Date() }
      },
      {
        $set: { status: 'expired' }
      }
    );

    return { expiredCount: result.modifiedCount };
  }
}

module.exports = new InviteService();
