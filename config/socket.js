/**
 * Socket.IO Configuration
 * Extracts Socket.IO setup and event handling into a separate file
 */

const socketIo = require('socket.io');
const socketAuth = require('../middleware/socketAuth');
const config = require('./index');

/**
 * Initialize and configure Socket.IO
 * @param {http.Server} server - HTTP server instance
 * @returns {socketIo.Server} Configured Socket.IO server instance
 */
function initializeSocket(server) {
  const io = socketIo(server, {
    cors: config.socket.cors
  });

  // Socket.IO authentication
  io.use(socketAuth);

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log(`User ${socket.user.name} connected`);

    // Join user-specific room
    socket.join(`user_${socket.userId}`);

    // Handle sync requests
    socket.on('sync_request', async (data) => {
      try {
        // Process sync queue for this user
        const SyncQueue = require('../models/SyncQueue');
        const pendingSync = await SyncQueue.find({
          user: socket.userId,
          processed: false
        }).sort({ createdAt: 1 });

        socket.emit('sync_data', pendingSync);
      } catch (error) {
        socket.emit('sync_error', { error: error.message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`User ${socket.user.name} disconnected`);
    });
  });

  return io;
}

module.exports = {
  initializeSocket
};
