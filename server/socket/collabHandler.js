/**
 * Collaborative Workspace Socket Handler (#471)
 * Handles real-time collaboration features:
 * - User presence tracking
 * - Distributed locking
 * - Typing indicators
 * - Quick discussions
 * - Collaboration deltas
 */

const Workspace = require('../models/Workspace');
const User = require('../models/User');

// Store socket to workspace mappings
const socketWorkspaceMap = new Map();
const workspaceSocketsMap = new Map();

class CollaborativeHandler {
  constructor(io) {
    this.io = io;
    this.collaborationNamespace = io.of('/collaboration');
    this.setupHandlers();
  }

  setupHandlers() {
    this.collaborationNamespace.on('connection', (socket) => {
      console.log(`[Collaboration] Client connected: ${socket.id}`);

      // Authentication
      socket.on('authenticate', async (data) => {
        await this.handleAuthenticate(socket, data);
      });

      // Workspace join/leave
      socket.on('join:workspace', async (data) => {
        await this.handleJoinWorkspace(socket, data);
      });

      socket.on('leave:workspace', async (data) => {
        await this.handleLeaveWorkspace(socket, data);
      });

      // Presence updates
      socket.on('presence:update', async (data) => {
        await this.handlePresenceUpdate(socket, data);
      });

      socket.on('presence:heartbeat', async (data) => {
        await this.handlePresenceHeartbeat(socket, data);
      });

      // Locking
      socket.on('lock:acquire', async (data) => {
        await this.handleAcquireLock(socket, data);
      });

      socket.on('lock:release', async (data) => {
        await this.handleReleaseLock(socket, data);
      });

      socket.on('lock:extend', async (data) => {
        await this.handleExtendLock(socket, data);
      });

      socket.on('lock:check', async (data) => {
        await this.handleCheckLock(socket, data);
      });

      // Typing indicators
      socket.on('typing:start', async (data) => {
        await this.handleTypingStart(socket, data);
      });

      socket.on('typing:stop', async (data) => {
        await this.handleTypingStop(socket, data);
      });

      // Discussions
      socket.on('discussion:create', async (data) => {
        await this.handleCreateDiscussion(socket, data);
      });

      socket.on('discussion:message', async (data) => {
        await this.handleDiscussionMessage(socket, data);
      });

      socket.on('discussion:reaction', async (data) => {
        await this.handleDiscussionReaction(socket, data);
      });

      // Collaboration deltas
      socket.on('delta:expense', async (data) => {
        await this.handleExpenseDelta(socket, data);
      });

      socket.on('delta:budget', async (data) => {
        await this.handleBudgetDelta(socket, data);
      });

      // Disconnect
      socket.on('disconnect', async () => {
        await this.handleDisconnect(socket);
      });

      // Error handling
      socket.on('error', (error) => {
        console.error(`[Collaboration] Socket error:`, error);
      });
    });
  }

  /**
   * Authenticate socket connection
   */
  async handleAuthenticate(socket, data) {
    try {
      const { userId, token } = data;

      // Verify token (implement your JWT verification)
      // For now, we'll just store the userId
      socket.userId = userId;
      socket.authenticated = true;

      socket.emit('authenticated', { success: true });
    } catch (error) {
      console.error('[Collaboration] Authentication error:', error);
      socket.emit('authenticated', { success: false, error: error.message });
    }
  }

  /**
   * User joins workspace
   */
  async handleJoinWorkspace(socket, data) {
    try {
      const { workspaceId, device } = data;
      const userId = socket.userId;

      if (!userId) {
        return socket.emit('error', { message: 'Not authenticated' });
      }

      // Verify user has access to workspace
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        return socket.emit('join:workspace:error', { message: 'Workspace not found' });
      }

      const hasAccess = workspace.hasPermission(userId, 'expenses:view');
      if (!hasAccess) {
        return socket.emit('join:workspace:error', { message: 'Access denied' });
      }

      // Join socket room
      socket.join(`workspace:${workspaceId}`);

      // Track socket-workspace mapping
      socketWorkspaceMap.set(socket.id, workspaceId);
      
      if (!workspaceSocketsMap.has(workspaceId)) {
        workspaceSocketsMap.set(workspaceId, new Set());
      }
      workspaceSocketsMap.get(workspaceId).add(socket.id);

      // Add user to active users
      await workspace.addActiveUser(userId, socket.id, device);

      // Get current state
      const activeUsers = workspace.activeUsers.map(u => ({
        userId: u.user,
        status: u.status,
        currentView: u.currentView,
        device: u.device
      }));

      const activeLocks = workspace.locks.filter(l => l.expiresAt > new Date());

      // Notify user of successful join
      socket.emit('join:workspace:success', {
        workspaceId,
        activeUsers,
        activeLocks
      });

      // Notify other users
      socket.to(`workspace:${workspaceId}`).emit('presence:joined', {
        userId,
        status: 'online',
        device
      });

      console.log(`[Collaboration] User ${userId} joined workspace ${workspaceId}`);
    } catch (error) {
      console.error('[Collaboration] Join workspace error:', error);
      socket.emit('join:workspace:error', { message: error.message });
    }
  }

  /**
   * User leaves workspace
   */
  async handleLeaveWorkspace(socket, data) {
    try {
      const { workspaceId } = data;
      const userId = socket.userId;

      if (!workspaceId || !userId) return;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return;

      // Remove from active users
      await workspace.removeActiveUser(userId);

      // Release all locks held by this user
      workspace.locks = workspace.locks.filter(
        lock => lock.lockedBy.toString() !== userId.toString()
      );
      await workspace.save();

      // Leave socket room
      socket.leave(`workspace:${workspaceId}`);

      // Remove from mappings
      socketWorkspaceMap.delete(socket.id);
      const sockets = workspaceSocketsMap.get(workspaceId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          workspaceSocketsMap.delete(workspaceId);
        }
      }

      // Notify other users
      socket.to(`workspace:${workspaceId}`).emit('presence:left', { userId });

      console.log(`[Collaboration] User ${userId} left workspace ${workspaceId}`);
    } catch (error) {
      console.error('[Collaboration] Leave workspace error:', error);
    }
  }

  /**
   * Update user presence status
   */
  async handlePresenceUpdate(socket, data) {
    try {
      const { workspaceId, status, currentView } = data;
      const userId = socket.userId;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return;

      await workspace.updateUserStatus(userId, status, currentView);

      // Notify other users
      socket.to(`workspace:${workspaceId}`).emit('presence:updated', {
        userId,
        status,
        currentView
      });
    } catch (error) {
      console.error('[Collaboration] Presence update error:', error);
    }
  }

  /**
   * Handle presence heartbeat
   */
  async handlePresenceHeartbeat(socket, data) {
    try {
      const { workspaceId } = data;
      const userId = socket.userId;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return;

      const activeUser = workspace.activeUsers.find(
        u => u.user.toString() === userId.toString()
      );

      if (activeUser) {
        activeUser.lastSeen = new Date();
        await workspace.save();
      }
    } catch (error) {
      console.error('[Collaboration] Heartbeat error:', error);
    }
  }

  /**
   * Acquire distributed lock
   */
  async handleAcquireLock(socket, data) {
    try {
      const { workspaceId, resourceType, resourceId, lockDuration } = data;
      const userId = socket.userId;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        return socket.emit('lock:acquire:error', { message: 'Workspace not found' });
      }

      // Check permissions
      const hasPermission = workspace.hasPermission(userId, `${resourceType}s:edit`);
      if (!hasPermission) {
        return socket.emit('lock:acquire:error', { message: 'Permission denied' });
      }

      // Attempt to acquire lock
      const result = await workspace.acquireLock(
        resourceType,
        resourceId,
        userId,
        socket.id,
        lockDuration || workspace.collaborationSettings.lockTimeout
      );

      if (result.success) {
        // Notify user
        socket.emit('lock:acquired', {
          resourceType,
          resourceId,
          expiresAt: result.expiresAt
        });

        // Notify other users
        socket.to(`workspace:${workspaceId}`).emit('lock:status', {
          resourceType,
          resourceId,
          locked: true,
          lockedBy: userId,
          expiresAt: result.expiresAt
        });

        console.log(`[Collaboration] Lock acquired: ${resourceType}:${resourceId} by ${userId}`);
      } else {
        // Lock already held by another user
        const lockedByUser = await User.findById(result.lockedBy).select('name email');
        
        socket.emit('lock:acquire:failed', {
          resourceType,
          resourceId,
          lockedBy: {
            id: result.lockedBy,
            name: lockedByUser?.name,
            email: lockedByUser?.email
          },
          expiresAt: result.expiresAt
        });
      }
    } catch (error) {
      console.error('[Collaboration] Acquire lock error:', error);
      socket.emit('lock:acquire:error', { message: error.message });
    }
  }

  /**
   * Release distributed lock
   */
  async handleReleaseLock(socket, data) {
    try {
      const { workspaceId, resourceType, resourceId } = data;
      const userId = socket.userId;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return;

      await workspace.releaseLock(resourceType, resourceId, userId);

      // Notify user
      socket.emit('lock:released', { resourceType, resourceId });

      // Notify other users
      socket.to(`workspace:${workspaceId}`).emit('lock:status', {
        resourceType,
        resourceId,
        locked: false
      });

      console.log(`[Collaboration] Lock released: ${resourceType}:${resourceId} by ${userId}`);
    } catch (error) {
      console.error('[Collaboration] Release lock error:', error);
    }
  }

  /**
   * Extend lock duration
   */
  async handleExtendLock(socket, data) {
    try {
      const { workspaceId, resourceType, resourceId, additionalDuration } = data;
      const userId = socket.userId;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return;

      const lock = workspace.locks.find(
        l => l.resourceType === resourceType && 
             l.resourceId === resourceId &&
             l.lockedBy.toString() === userId.toString()
      );

      if (lock) {
        lock.expiresAt = new Date(lock.expiresAt.getTime() + additionalDuration * 1000);
        await workspace.save();

        socket.emit('lock:extended', {
          resourceType,
          resourceId,
          expiresAt: lock.expiresAt
        });

        // Notify other users
        socket.to(`workspace:${workspaceId}`).emit('lock:status', {
          resourceType,
          resourceId,
          locked: true,
          lockedBy: userId,
          expiresAt: lock.expiresAt
        });
      }
    } catch (error) {
      console.error('[Collaboration] Extend lock error:', error);
    }
  }

  /**
   * Check lock status
   */
  async handleCheckLock(socket, data) {
    try {
      const { workspaceId, resourceType, resourceId } = data;
      const userId = socket.userId;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return;

      const lockStatus = workspace.isLocked(resourceType, resourceId, userId);

      socket.emit('lock:status', {
        resourceType,
        resourceId,
        ...lockStatus
      });
    } catch (error) {
      console.error('[Collaboration] Check lock error:', error);
    }
  }

  /**
   * User starts typing
   */
  async handleTypingStart(socket, data) {
    try {
      const { workspaceId, resourceType, resourceId } = data;
      const userId = socket.userId;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return;

      await workspace.setTyping(
        userId,
        resourceType,
        resourceId,
        workspace.collaborationSettings.typingIndicatorTimeout
      );

      // Notify other users
      socket.to(`workspace:${workspaceId}`).emit('typing:started', {
        userId,
        resourceType,
        resourceId
      });
    } catch (error) {
      console.error('[Collaboration] Typing start error:', error);
    }
  }

  /**
   * User stops typing
   */
  async handleTypingStop(socket, data) {
    try {
      const { workspaceId, resourceType, resourceId } = data;
      const userId = socket.userId;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return;

      await workspace.clearTyping(userId, resourceType, resourceId);

      // Notify other users
      socket.to(`workspace:${workspaceId}`).emit('typing:stopped', {
        userId,
        resourceType,
        resourceId
      });
    } catch (error) {
      console.error('[Collaboration] Typing stop error:', error);
    }
  }

  /**
   * Create discussion thread
   */
  async handleCreateDiscussion(socket, data) {
    try {
      const { workspaceId, parentType, parentId, title, initialMessage } = data;
      const userId = socket.userId;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        return socket.emit('discussion:error', { message: 'Workspace not found' });
      }

      if (!workspace.collaborationSettings.enableDiscussions) {
        return socket.emit('discussion:error', { message: 'Discussions are disabled' });
      }

      await workspace.createDiscussion(parentType, parentId, title, userId, initialMessage);
      await workspace.populate('discussions.messages.user', 'name email avatar');

      const discussion = workspace.discussions[workspace.discussions.length - 1];

      // Notify all users
      this.collaborationNamespace.to(`workspace:${workspaceId}`).emit('discussion:created', {
        discussion: {
          id: discussion._id,
          parentType: discussion.parentType,
          parentId: discussion.parentId,
          title: discussion.title,
          messages: discussion.messages,
          status: discussion.status,
          createdAt: discussion.createdAt
        }
      });

      console.log(`[Collaboration] Discussion created in workspace ${workspaceId}`);
    } catch (error) {
      console.error('[Collaboration] Create discussion error:', error);
      socket.emit('discussion:error', { message: error.message });
    }
  }

  /**
   * Add message to discussion
   */
  async handleDiscussionMessage(socket, data) {
    try {
      const { workspaceId, discussionId, text, mentions } = data;
      const userId = socket.userId;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return;

      await workspace.addMessage(discussionId, userId, text, mentions);
      await workspace.populate('discussions.messages.user', 'name email avatar');

      const discussion = workspace.discussions.id(discussionId);
      const message = discussion.messages[discussion.messages.length - 1];

      // Notify all users
      this.collaborationNamespace.to(`workspace:${workspaceId}`).emit('discussion:message', {
        discussionId,
        message: {
          id: message._id,
          user: message.user,
          text: message.text,
          timestamp: message.timestamp,
          mentions: message.mentions
        }
      });

      // Send notifications for mentions
      if (mentions && mentions.length > 0 && workspace.collaborationSettings.notifyOnMention) {
        // Emit mention notifications
        mentions.forEach(mentionedUserId => {
          const userSockets = this.getUserSockets(workspaceId, mentionedUserId);
          userSockets.forEach(socketId => {
            this.collaborationNamespace.to(socketId).emit('notification:mention', {
              discussionId,
              messageId: message._id,
              from: userId,
              text: text.substring(0, 100)
            });
          });
        });
      }

      console.log(`[Collaboration] Message added to discussion ${discussionId}`);
    } catch (error) {
      console.error('[Collaboration] Discussion message error:', error);
    }
  }

  /**
   * Add reaction to message
   */
  async handleDiscussionReaction(socket, data) {
    try {
      const { workspaceId, discussionId, messageId, emoji } = data;
      const userId = socket.userId;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return;

      const discussion = workspace.discussions.id(discussionId);
      if (!discussion) return;

      const message = discussion.messages.id(messageId);
      if (!message) return;

      // Find or create reaction
      let reaction = message.reactions.find(r => r.emoji === emoji);
      if (!reaction) {
        reaction = { emoji, users: [] };
        message.reactions.push(reaction);
      }

      // Toggle user in reaction
      const userIndex = reaction.users.findIndex(u => u.toString() === userId.toString());
      if (userIndex > -1) {
        reaction.users.splice(userIndex, 1);
      } else {
        reaction.users.push(userId);
      }

      await workspace.save();

      // Notify all users
      this.collaborationNamespace.to(`workspace:${workspaceId}`).emit('discussion:reaction', {
        discussionId,
        messageId,
        emoji,
        users: reaction.users
      });
    } catch (error) {
      console.error('[Collaboration] Discussion reaction error:', error);
    }
  }

  /**
   * Handle expense delta (collaborative edit)
   */
  async handleExpenseDelta(socket, data) {
    try {
      const { workspaceId, expenseId, delta, version } = data;
      const userId = socket.userId;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return;

      // Verify lock
      const lockStatus = workspace.isLocked('expense', expenseId, userId);
      if (lockStatus.locked && !lockStatus.ownLock) {
        return socket.emit('delta:error', {
          message: 'Expense is locked by another user',
          lockedBy: lockStatus.lockedBy
        });
      }

      // Broadcast delta to other users
      socket.to(`workspace:${workspaceId}`).emit('delta:expense', {
        expenseId,
        delta,
        version,
        userId
      });

      console.log(`[Collaboration] Expense delta: ${expenseId}`);
    } catch (error) {
      console.error('[Collaboration] Expense delta error:', error);
    }
  }

  /**
   * Handle budget delta
   */
  async handleBudgetDelta(socket, data) {
    try {
      const { workspaceId, budgetId, delta, version } = data;
      const userId = socket.userId;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return;

      // Verify lock
      const lockStatus = workspace.isLocked('budget', budgetId, userId);
      if (lockStatus.locked && !lockStatus.ownLock) {
        return socket.emit('delta:error', {
          message: 'Budget is locked by another user'
        });
      }

      // Broadcast delta to other users
      socket.to(`workspace:${workspaceId}`).emit('delta:budget', {
        budgetId,
        delta,
        version,
        userId
      });
    } catch (error) {
      console.error('[Collaboration] Budget delta error:', error);
    }
  }

  /**
   * Handle disconnect
   */
  async handleDisconnect(socket) {
    try {
      const userId = socket.userId;
      const workspaceId = socketWorkspaceMap.get(socket.id);

      if (workspaceId) {
        const workspace = await Workspace.findById(workspaceId);
        if (workspace) {
          // Remove from active users
          await workspace.removeActiveUser(userId);

          // Release all locks held by this socket
          workspace.locks = workspace.locks.filter(
            lock => lock.socketId !== socket.id
          );

          // Clear typing indicators
          workspace.typingUsers = workspace.typingUsers.filter(
            t => t.user.toString() !== userId.toString()
          );

          await workspace.save();

          // Notify other users
          socket.to(`workspace:${workspaceId}`).emit('presence:left', { userId });

          // Broadcast lock releases
          this.collaborationNamespace.to(`workspace:${workspaceId}`).emit('lock:released:all', {
            userId
          });
        }

        // Clean up mappings
        socketWorkspaceMap.delete(socket.id);
        const sockets = workspaceSocketsMap.get(workspaceId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            workspaceSocketsMap.delete(workspaceId);
          }
        }
      }

      console.log(`[Collaboration] Client disconnected: ${socket.id}`);
    } catch (error) {
      console.error('[Collaboration] Disconnect error:', error);
    }
  }

  /**
   * Get all socket IDs for a user in a workspace
   */
  getUserSockets(workspaceId, userId) {
    const sockets = workspaceSocketsMap.get(workspaceId) || new Set();
    const userSockets = [];

    sockets.forEach(socketId => {
      const socket = this.collaborationNamespace.sockets.get(socketId);
      if (socket && socket.userId === userId.toString()) {
        userSockets.push(socketId);
      }
    });

    return userSockets;
  }

  /**
   * Cleanup expired locks periodically
   */
  async cleanupExpiredLocks() {
    try {
      const workspaces = await Workspace.find({
        'locks.0': { $exists: true }
      });

      for (const workspace of workspaces) {
        const removed = workspace.cleanExpiredLocks();
        if (removed > 0) {
          await workspace.save();
          console.log(`[Collaboration] Cleaned ${removed} expired locks from workspace ${workspace._id}`);
        }
      }
    } catch (error) {
      console.error('[Collaboration] Cleanup error:', error);
    }
  }

  /**
   * Start periodic cleanup
   */
  startPeriodicCleanup() {
    // Clean up expired locks every minute
    setInterval(() => {
      this.cleanupExpiredLocks();
    }, 60 * 1000);

    console.log('[Collaboration] Started periodic lock cleanup');
  }
}

module.exports = CollaborativeHandler;
