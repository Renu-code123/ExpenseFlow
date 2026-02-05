const express = require('express');
// Global error handlers for unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Optionally, perform cleanup or alerting here
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
  // Optionally, perform cleanup or alerting here
});
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const socketAuth = require('./middleware/socketAuth');
const CronJobs = require('./services/cronJobs');
const { generalLimiter } = require('./middleware/rateLimiter');
const { sanitizeInput, sanitizationMiddleware, validateDataTypes } = require('./middleware/sanitizer');
const securityMonitor = require('./services/securityMonitor');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const expenseRoutes = require('./routes/expenses');
const syncRoutes = require('./routes/sync');
const splitsRoutes = require('./routes/splits');
const groupsRoutes = require('./routes/groups');
const backupRoutes = require('./routes/backups');
const backupService = require('./services/backupService');
const twoFactorAuthRoutes = require('./routes/twoFactorAuth');
const cron = require('node-cron');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "https://res.cloudinary.com"],
      connectSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://api.exchangerate-api.com", "https://api.frankfurter.app", "https://res.cloudinary.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.FRONTEND_URL
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
app.use(generalLimiter);

// Comprehensive input sanitization and validation middleware
// Issue #461: Missing Input Validation on User Data
app.use(sanitizationMiddleware);
app.use(validateDataTypes);

// Security monitoring
app.use(securityMonitor.blockSuspiciousIPs());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static('public'));
app.use(express.static('.'));

// Security logging middleware
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function (data) {
    // Log failed requests
    if (res.statusCode >= 400) {
      securityMonitor.logSecurityEvent(req, 'suspicious_activity', {
        statusCode: res.statusCode,
        response: typeof data === 'string' ? data.substring(0, 200) : 'Non-string response'
      });
    }
    originalSend.call(this, data);
  };
  next();
});

// Make io available to the  routes
app.set('io', io);

// Make io globally available for notifications
global.io = io;

// Database connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    // Initialize cron jobs after DB connection (includes backup scheduling)
    // Issue #462: Automated Backup System for Financial Data
    CronJobs.init();
    console.log('✓ Cron jobs initialized (includes backup scheduling)');
  })
  .catch(err => console.error('MongoDB connection error:', err));

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
      const SyncQueue = require('./models/SyncQueue');
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

// Routes
app.use('/api/auth', require('./middleware/rateLimiter').authLimiter, authRoutes);
app.use('/api/expenses', require('./middleware/rateLimiter').expenseLimiter, expenseRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/receipts', require('./middleware/rateLimiter').uploadLimiter, require('./routes/receipts'));
app.use('/api/budgets', require('./routes/budgets'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/currency', require('./routes/currency'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/splits', require('./routes/splits'));
app.use('/api/workspaces', require('./routes/workspaces'));
app.use('/api/tax', require('./routes/tax'));
app.use('/api/backups', backupRoutes); // Issue #462: Backup Management API
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/2fa', require('./middleware/auth'), twoFactorAuthRoutes); // Issue #503: 2FA Management

// Express error handler middleware (must be after all routes)
app.use((err, req, res, next) => {
  console.error('Express route error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
});

// Root route to serve the UI
app.get('/', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Security features enabled: Rate limiting, Input sanitization, Security headers');
});