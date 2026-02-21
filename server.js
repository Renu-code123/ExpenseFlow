const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Initialize Asynchronous Listeners (Issue #711)
require('./listeners/EmailListeners').init();
require('./listeners/AuditListeners').init();


/* ================================
   SECURITY
================================ */

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: [
        "'self'",
        "https:",
        "wss:",
        "http://localhost:3000",
        "ws://localhost:3000"
      ]
    }
  }
}));

/* ================================
   CORS (VERCEL SAFE)
================================ */

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

/* ================================
   BODY PARSER
================================ */

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(require('./middleware/encryptionInterceptor'));
app.use(require('./middleware/validationInterceptor'));


/* ================================
   DATABASE CONNECTION
================================ */

async function connectDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });

    console.log('✅ MongoDB connected');

    // Cron jobs only in development
    if (process.env.NODE_ENV !== 'production') {
      try {
        const CronJobs = require('./jobs/cronJobs');
        CronJobs.init();

        require('./jobs/trendAnalyzer').start();
        require('./jobs/reportScheduler').start();
        require('./jobs/accessAuditor').start();
        require('./jobs/forecastRetrainer').start();
        require('./jobs/taxonomyAuditor').start();
        require('./jobs/conflictCleaner').start();
        require('./jobs/logRotator').start();
        require('./jobs/searchIndexer').start();


        // Start resilient orchestrator
        require('./services/jobOrchestrator').start();



        console.log('✓ Cron jobs initialized');
      } catch (err) {
        console.log('Cron jobs skipped:', err.message);
      }
    }

  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
  }
}

connectDatabase();

/* ================================
   ROUTES
================================ */

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/workspaces', require('./routes/workspaces'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/export', require('./routes/export'));
app.use('/api/forecasting', require('./routes/forecasting'));
app.use('/api/governance', require('./routes/governance'));
app.use('/api/taxonomy', require('./routes/taxonomy'));
app.use('/api/sync', require('./routes/syncManager'));
app.use('/api/telemetry', require('./routes/telemetry'));
app.use('/api/jobs', require('./routes/jobs'));






/* ================================
   STATIC FILES (ONLY DEV)
================================ */

if (process.env.NODE_ENV !== 'production') {
  const path = require('path');
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}

/* ================================
   HEALTH CHECK
================================ */

app.get('/', (req, res) => {
  res.json({ status: 'Server running 🚀' });
});

/* ================================
   ERROR HANDLER
================================ */

app.use(require('./middleware/globalErrorHandler'));

/* ================================
   SERVER START (ONLY DEV)
================================ */

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'production') {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

/* ================================
   EXPORT FOR VERCEL
================================ */

module.exports = app;

