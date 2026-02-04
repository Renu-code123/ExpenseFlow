# Real-Time Collaborative Workspaces with Multi-User Presence & Conflict Locking

## Overview

This feature introduces real-time collaboration capabilities to ExpenseFlow workspaces, enabling multiple users to work simultaneously with visual presence indicators, distributed locking for conflict prevention, and integrated messaging.

## Features

### 1. **Real-Time Presence Tracking**
- Live display of active users in workspace
- Status indicators (Online, Busy, Viewing, Away)
- Device and browser information
- Automatic presence heartbeat
- Avatar display with user information

### 2. **Distributed Locking System**
- Optimistic locking for expenses and budgets
- Automatic lock acquisition on edit start
- Lock expiration and renewal
- Visual lock indicators
- Lock conflict resolution

### 3. **Quick Discussion Threads**
- Workspace-level and expense-level discussions
- Real-time message delivery
- User mentions with notifications
- Message reactions
- Discussion status management

### 4. **Typing Indicators**
- Show who's typing in real-time
- Resource-specific indicators
- Automatic timeout

### 5. **Collaboration Deltas**
- Real-time synchronization of changes
- Conflict-free updates
- Version tracking
- Optimistic UI updates

## Architecture

### Backend Components

#### Models

**Workspace Model Extensions** (`models/Workspace.js`)
```javascript
{
  activeUsers: [{
    user: ObjectId,
    socketId: String,
    status: 'online' | 'busy' | 'viewing' | 'away',
    currentView: String,
    lastSeen: Date,
    device: Object
  }],
  
  locks: [{
    resourceType: 'expense' | 'budget' | 'workspace',
    resourceId: String,
    lockedBy: ObjectId,
    lockedAt: Date,
    expiresAt: Date,
    socketId: String
  }],
  
  discussions: [{
    parentType: 'workspace' | 'expense',
    parentId: String,
    title: String,
    messages: [{
      user: ObjectId,
      text: String,
      timestamp: Date,
      mentions: [ObjectId],
      reactions: [{
        emoji: String,
        users: [ObjectId]
      }]
    }],
    status: 'open' | 'resolved' | 'archived'
  }],
  
  typingUsers: [{
    user: ObjectId,
    resourceType: String,
    resourceId: String,
    expiresAt: Date
  }],
  
  collaborationSettings: {
    enableRealTimeSync: Boolean,
    lockTimeout: Number,
    typingIndicatorTimeout: Number,
    maxConcurrentEditors: Number,
    enableDiscussions: Boolean
  }
}
```

#### Socket Handler (`socket/collabHandler.js`)

Manages real-time events via Socket.IO:

```javascript
class CollaborativeHandler {
  // Connection events
  - authenticate
  - join:workspace
  - leave:workspace
  
  // Presence events
  - presence:update
  - presence:heartbeat
  
  // Lock events
  - lock:acquire
  - lock:release
  - lock:extend
  - lock:check
  
  // Typing events
  - typing:start
  - typing:stop
  
  // Discussion events
  - discussion:create
  - discussion:message
  - discussion:reaction
  
  // Delta events
  - delta:expense
  - delta:budget
}
```

#### Service Layer (`services/workspaceService.js`)

Business logic for collaboration features:

```javascript
class WorkspaceService {
  // Collaboration state
  getWorkspaceWithCollaboration(workspaceId, userId)
  
  // Locking
  acquireLock(workspaceId, userId, resourceType, resourceId, duration)
  releaseLock(workspaceId, userId, resourceType, resourceId)
  checkLock(workspaceId, resourceType, resourceId, userId)
  
  // Discussions
  getDiscussions(workspaceId, parentType, parentId)
  createDiscussion(workspaceId, userId, parentType, parentId, title, message)
  addDiscussionMessage(workspaceId, userId, discussionId, text, mentions)
  
  // Statistics
  getCollaborationStats(workspaceId)
}
```

#### API Routes (`routes/workspaces.js`)

RESTful endpoints for collaboration:

```
GET    /api/workspaces/:id/collaboration
GET    /api/workspaces/:id/collaboration/stats
POST   /api/workspaces/:id/locks
DELETE /api/workspaces/:id/locks/:type/:id
GET    /api/workspaces/:id/locks/:type/:id
GET    /api/workspaces/:id/discussions
POST   /api/workspaces/:id/discussions
POST   /api/workspaces/:id/discussions/:id/messages
PUT    /api/workspaces/:id/collaboration/settings
```

### Frontend Components

#### Collaboration Client (`public/workspace-feature.js`)

```javascript
class CollaborationClient {
  constructor(workspaceId, userId)
  
  // Connection
  connect()
  disconnect()
  
  // Presence
  updatePresence(status, currentView)
  getActiveUsers()
  
  // Locking
  acquireLock(resourceType, resourceId)
  releaseLock(resourceType, resourceId)
  checkLock(resourceType, resourceId)
  
  // Discussions
  createDiscussion(parentType, parentId, title, message)
  sendMessage(discussionId, text, mentions)
  
  // Typing
  startTyping(resourceType, resourceId)
  stopTyping(resourceType, resourceId)
  
  // Deltas
  sendDelta(resourceType, resourceId, delta, version)
  
  // Event handlers
  on(event, callback)
}
```

#### Real-Time Sync Integration (`public/realtime-sync.js`)

Extends existing offline-first sync to handle collaboration deltas:

```javascript
// Handle incoming deltas without full page refresh
syncEngine.on('delta:received', (delta) => {
  // Apply delta to local state
  // Update UI optimistically
  // Resolve conflicts
});
```

#### UI Components

**Presence Indicators** (`public/index.html`)
```html
<div class="workspace-presence">
  <div class="active-users">
    <div class="user-avatar" data-status="online">
      <img src="avatar.jpg" />
      <span class="status-indicator"></span>
    </div>
  </div>
  <span class="user-count">3 active</span>
</div>
```

**Lock Indicators** (`public/trackerscript.js`)
```html
<div class="expense-item locked">
  <div class="lock-indicator">
    <i class="fas fa-lock"></i>
    <span>Locked by John Doe</span>
  </div>
</div>
```

**Discussion Panel**
```html
<div class="discussion-panel">
  <div class="discussion-header">
    <h3>Quick Discussion</h3>
    <button class="new-thread">New Thread</button>
  </div>
  <div class="discussion-threads">
    <!-- Thread list -->
  </div>
  <div class="discussion-messages">
    <!-- Messages -->
  </div>
  <div class="typing-indicators">
    <span>John is typing...</span>
  </div>
  <div class="message-input">
    <textarea placeholder="Type a message..."></textarea>
    <button class="send">Send</button>
  </div>
</div>
```

#### Styles (`public/expensetracker.css`)

```css
/* Presence indicators */
.workspace-presence { ... }
.user-avatar { ... }
.status-indicator { ... }
.status-online { background: #10b981; }
.status-busy { background: #f59e0b; }
.status-away { background: #6b7280; }

/* Lock indicators */
.expense-item.locked { ... }
.lock-indicator { ... }
.lock-animation { ... }

/* Discussion panel */
.discussion-panel { ... }
.discussion-thread { ... }
.typing-indicator { ... }
.message-bubble { ... }
.mention { ... }
```

## Implementation Guide

### 1. Server Setup

**Register Socket Handler** (`server.js`)

```javascript
const CollaborativeHandler = require('./socket/collabHandler');

// After Socket.IO initialization
const collaborativeHandler = new CollaborativeHandler(io);
collaborativeHandler.startPeriodicCleanup();

console.log('Collaboration handler initialized');
```

### 2. Client Integration

**Initialize Collaboration Client**

```javascript
// When workspace loads
const collab = new CollaborationClient(workspaceId, userId);

collab.connect();

// Update presence
collab.updatePresence('online', 'dashboard');

// Listen for events
collab.on('presence:joined', (user) => {
  console.log(`${user.name} joined`);
  updatePresenceUI();
});

collab.on('lock:acquired', (lock) => {
  console.log(`Resource locked: ${lock.resourceId}`);
  updateLockUI(lock);
});
```

**Acquire Lock Before Edit**

```javascript
async function editExpense(expenseId) {
  // Check if locked
  const lockStatus = await collab.checkLock('expense', expenseId);
  
  if (lockStatus.locked) {
    alert(`This expense is currently being edited by ${lockStatus.lockedByUser.name}`);
    return;
  }
  
  // Acquire lock
  const result = await collab.acquireLock('expense', expenseId);
  
  if (!result.success) {
    alert('Failed to acquire lock');
    return;
  }
  
  // Open edit form
  openExpenseForm(expenseId);
  
  // Release lock on close/save
  formCloseHandler = () => {
    collab.releaseLock('expense', expenseId);
  };
}
```

**Send Deltas on Edit**

```javascript
function onExpenseFieldChange(field, value) {
  const delta = {
    type: 'update',
    field,
    value,
    timestamp: Date.now()
  };
  
  collab.sendDelta('expense', expenseId, delta, currentVersion);
}

// Receive deltas from others
collab.on('delta:expense', (data) => {
  if (data.expenseId === currentExpenseId) {
    // Apply delta to form without losing focus
    applyDeltaToForm(data.delta);
  }
});
```

**Typing Indicators**

```javascript
const discussionInput = document.querySelector('.discussion-input');

let typingTimeout;

discussionInput.addEventListener('input', () => {
  collab.startTyping('discussion', discussionId);
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    collab.stopTyping('discussion', discussionId);
  }, 3000);
});

collab.on('typing:started', ({ userId, resourceId }) => {
  if (resourceId === discussionId) {
    showTypingIndicator(userId);
  }
});
```

### 3. Discussion Integration

**Create Discussion**

```javascript
async function createDiscussion(expenseId) {
  const discussion = await collab.createDiscussion(
    'expense',
    expenseId,
    'Budget Question',
    'Is this within our Q1 budget?'
  );
  
  openDiscussionPanel(discussion.id);
}

// Send messages
async function sendMessage(discussionId, text) {
  await collab.sendMessage(discussionId, text, []);
}

// Listen for new messages
collab.on('discussion:message', ({ discussionId, message }) => {
  appendMessageToUI(discussionId, message);
});
```

## Configuration

### Environment Variables

```env
# Socket.IO settings
SOCKET_IO_PATH=/socket.io
SOCKET_IO_CORS_ORIGIN=*

# Collaboration settings
COLLAB_LOCK_TIMEOUT=300
COLLAB_TYPING_TIMEOUT=10
COLLAB_MAX_EDITORS=10
```

### Workspace Settings

Configurable per workspace via UI or API:

```javascript
{
  enableRealTimeSync: true,
  lockTimeout: 300,              // seconds
  typingIndicatorTimeout: 10,    // seconds
  presenceUpdateInterval: 30,    // seconds
  maxConcurrentEditors: 10,
  enableDiscussions: true,
  notifyOnMention: true,
  notifyOnLock: true
}
```

## Security Considerations

1. **Authentication**: All socket connections require authentication
2. **Authorization**: Check workspace permissions before operations
3. **Lock Validation**: Verify lock ownership before accepting deltas
4. **Rate Limiting**: Limit socket message frequency
5. **Input Sanitization**: Sanitize discussion messages
6. **XSS Prevention**: Escape user-generated content

## Performance Optimization

1. **Cleanup Tasks**:
   - Remove stale active users (>5 minutes inactive)
   - Clean expired locks (every 1 minute)
   - Archive old discussions

2. **Efficient Broadcasting**:
   - Use socket rooms for workspace isolation
   - Only broadcast to relevant users
   - Throttle presence updates

3. **Database Optimization**:
   - Index on workspaceId, userId, expiresAt
   - Limit discussion message arrays
   - Use TTL for temporary data

## Testing

### Manual Testing

1. **Presence**:
   - Open workspace in multiple browsers
   - Verify avatars appear/disappear
   - Check status updates

2. **Locking**:
   - Edit same expense in two browsers
   - Verify lock acquisition/denial
   - Test lock expiration

3. **Discussions**:
   - Create threads and send messages
   - Test mentions and reactions
   - Verify real-time delivery

### Automated Tests

```javascript
describe('Collaboration', () => {
  it('should track active users', async () => {
    const workspace = await Workspace.findById(workspaceId);
    await workspace.addActiveUser(userId, socketId, device);
    expect(workspace.activeUsers).toHaveLength(1);
  });
  
  it('should acquire and release locks', async () => {
    const result = await workspace.acquireLock('expense', expenseId, userId, socketId);
    expect(result.success).toBe(true);
    
    await workspace.releaseLock('expense', expenseId, userId);
    const lockStatus = workspace.isLocked('expense', expenseId);
    expect(lockStatus.locked).toBe(false);
  });
});
```

## Troubleshooting

### Common Issues

**Issue**: Lock not releasing on disconnect
- **Solution**: Ensure disconnect handler properly cleans up locks

**Issue**: Presence not updating
- **Solution**: Check heartbeat interval and network connectivity

**Issue**: Messages not delivered
- **Solution**: Verify socket room membership and authentication

**Issue**: Stale locks blocking edits
- **Solution**: Implement force release for admins, check lock cleanup

## Future Enhancements

1. **Video/Audio Calls**: Integrate WebRTC for voice chat
2. **Collaborative Cursors**: Show real-time cursor positions
3. **Change History**: Track and replay collaborative edits
4. **Conflict Resolution**: Automatic merge strategies
5. **Offline Support**: Queue deltas when disconnected
6. **Mobile App**: Native collaboration features
7. **AI Suggestions**: Smart expense categorization during collaboration

## API Reference

### REST Endpoints

#### Get Collaboration State
```
GET /api/workspaces/:id/collaboration
```

**Response**:
```json
{
  "success": true,
  "data": {
    "activeUsers": [...],
    "locks": [...],
    "discussions": [...],
    "settings": {...}
  }
}
```

#### Acquire Lock
```
POST /api/workspaces/:id/locks
Body: {
  "resourceType": "expense",
  "resourceId": "123",
  "lockDuration": 300
}
```

**Response**:
```json
{
  "success": true,
  "expiresAt": "2026-01-31T12:00:00Z"
}
```

### Socket Events

#### Client → Server

- `authenticate`: Authenticate socket connection
- `join:workspace`: Join workspace room
- `leave:workspace`: Leave workspace room
- `presence:update`: Update user status
- `lock:acquire`: Request lock
- `lock:release`: Release lock
- `typing:start`: Start typing
- `discussion:message`: Send message
- `delta:expense`: Send expense update

#### Server → Client

- `authenticated`: Authentication result
- `join:workspace:success`: Joined workspace
- `presence:joined`: User joined
- `presence:left`: User left
- `presence:updated`: User status changed
- `lock:acquired`: Lock granted
- `lock:acquire:failed`: Lock denied
- `lock:status`: Lock status update
- `typing:started`: User typing
- `discussion:created`: New discussion
- `discussion:message`: New message
- `delta:expense`: Expense updated

## Migration Guide

For existing workspaces, run migration to add collaboration fields:

```javascript
const Workspace = require('./models/Workspace');

async function migrate() {
  const workspaces = await Workspace.find({});
  
  for (const workspace of workspaces) {
    if (!workspace.collaborationSettings) {
      workspace.collaborationSettings = {
        enableRealTimeSync: true,
        lockTimeout: 300,
        typingIndicatorTimeout: 10,
        presenceUpdateInterval: 30,
        maxConcurrentEditors: 10,
        enableDiscussions: true,
        notifyOnMention: true,
        notifyOnLock: true
      };
      workspace.activeUsers = [];
      workspace.locks = [];
      workspace.discussions = [];
      workspace.typingUsers = [];
      
      await workspace.save();
    }
  }
  
  console.log('Migration complete');
}

migrate();
```

## License

This feature is part of the ExpenseFlow project and follows the same license.

## Contributors

- Feature implementation: Real-Time Collaborative Workspaces (#471)
- Socket.IO integration
- Distributed locking system
- Discussion threads

## Support

For issues or questions, please open a GitHub issue with the `collaboration` label.
