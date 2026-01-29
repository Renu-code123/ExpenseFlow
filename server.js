const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const socketAuth = require('./middleware/socketAuth');
const CronJobs = require('./services/cronJobs');
const { generalLimiter } = require('./middleware/rateLimiter');
const { sanitizeInput, mongoSanitizeMiddleware } = require('./middleware/sanitization');
const securityMonitor = require('./services/securityMonitor');
const protect=require("./middleware/authMiddleware");
require('dotenv').config();

const authRoutes = require('./routes/auth');
const expenseRoutes = require('./routes/expenses');
const syncRoutes = require('./routes/sync');
const splitsRoutes = require('./routes/splits');
const groupsRoutes = require('./routes/groups');

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
      scriptSrc: [
  "'self'",
  "'unsafe-inline'",
  "https://cdn.socket.io",
  "https://cdn.jsdelivr.net"
],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "https://res.cloudinary.com"],
      connectSrc: [
  "'self'",
  "http://localhost:3000",
  "ws://localhost:3000",

  // APIs
  "https://api.exchangerate-api.com",
  "https://api.frankfurter.app",

  // Media
  "https://res.cloudinary.com",

  // Source maps + CDNs
  "https://cdn.socket.io",
  "https://cdn.jsdelivr.net"
],
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

// Input sanitization
app.use(mongoSanitizeMiddleware);
app.use(sanitizeInput);

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
    // Initialize cron jobs after DB connection
    CronJobs.init();
    console.log('Email cron jobs initialized');
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
app.use('/api/currency', require('./routes/currency'));

app.use('/api/expenses', require('./middleware/rateLimiter').expenseLimiter, protect, expenseRoutes);
app.use('/api/sync', protect, syncRoutes);
app.use('/api/notifications', protect, require('./routes/notifications'));
app.use('/api/receipts', require('./middleware/rateLimiter').uploadLimiter, protect, require('./routes/receipts'));
app.use('/api/budgets', protect, require('./routes/budgets'));
app.use('/api/goals', protect, require('./routes/goals'));
app.use('/api/analytics', protect, require('./routes/analytics'));
app.use('/api/groups', protect, require('./routes/groups'));
app.use('/api/splits', protect, require('./routes/splits'));
app.use('/api/workspaces', protect, require('./routes/workspaces'));
app.use('/api/tax', protect, require('./routes/tax'));
app.use('/api/bills', protect, require('./routes/bills'));
app.use('/api/calendar', protect, require('./routes/calendar'));
app.use('/api/reminders', protect, require('./routes/reminders'));

// Root route to serve the UI
app.get('/', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Security features enabled: Rate limiting, Input sanitization, Security headers');
});
