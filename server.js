/**
 * Server Entry Point
 * Modular server with async initialization
 */

const express = require('express');
const http = require('http');
const mongoose = require('mongoose');

const config = require('./config');
const { configureMiddleware } = require('./config/middleware');
const { initializeSocket } = require('./config/socket');
const { configureRoutes } = require('./routes');
const CronJobs = require('./services/cronJobs');

const app = express();
const server = http.createServer(app);

/**
 * Connect to MongoDB database
 * @returns {Promise<void>}
 */
async function connectDatabase() {
  try {
    await mongoose.connect(config.database.uri, config.database.options);
    console.log('MongoDB connected');
    return true;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Initialize cron jobs after database connection
 */
function initializeCronJobs() {
  CronJobs.init();
  console.log('Email cron jobs initialized');
}

/**
 * Setup Socket.IO with the server
 * @returns {socketIo.Server}
 */
function setupSocketIO() {
  const io = initializeSocket(server);
  
  // Make io available to routes
  app.set('io', io);
  
  // Make io globally available for notifications
  global.io = io;
  
  return io;
}

/**
 * Start the server
 * @returns {Promise<void>}
 */
async function startServer() {
  try {
    // Step 1: Configure middleware
    configureMiddleware(app);
    console.log('Middleware configured');

    // Step 2: Configure routes
    configureRoutes(app);
    console.log('Routes configured');

    // Step 3: Connect to database first
    await connectDatabase();

    // Step 4: Initialize cron jobs after DB connection
    initializeCronJobs();

    // Step 5: Setup Socket.IO
    setupSocketIO();
    console.log('Socket.IO initialized');

    // Step 6: Start listening
    server.listen(config.server.port, () => {
      console.log(`Server running on port ${config.server.port}`);
      console.log('Security features enabled: Rate limiting, Input sanitization, Security headers');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Export for testing
module.exports = {
  app,
  server,
  connectDatabase,
  startServer
};

// Start the server if this is the main module
if (require.main === module) {
  startServer();
}
