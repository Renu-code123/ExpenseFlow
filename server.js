const { registerServer, setupGracefulShutdown } = require('./utils/gracefulShutdown');
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const socketAuth = require('./middleware/socketAuth');
const CronJobs = require('./services/cronJobs');
const { generalLimiter } = require('./middleware/rateLimiter');
const { sanitizeInput, sanitizationMiddleware, validateDataTypes } = require('./middleware/sanitizer');
const securityMonitor = require('./services/securityMonitor');
const apiGateway = require('./middleware/apiGateway');
const requestContext = require('./middleware/requestContext');
const requestCorrelation = require('./middleware/requestCorrelation');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const expenseRoutes = require('./routes/expenses');
const syncRoutes = require('./routes/sync');
const splitsRoutes = require('./routes/splits');
const groupsRoutes = require('./routes/groups');
const backupRoutes = require('./routes/backups');
const backupService = require('./services/backupService');
const twoFactorAuthRoutes = require('./routes/twoFactorAuth');
const encryptionRoutes = require('./routes/encryption');
const automatedForecastingRoutes = require('./routes/automatedForecasting');
const auditComplianceRoutes = require('./routes/auditCompliance');
const apiGatewayRoutes = require('./routes/apiGateway');
const realtimeCollaborationRoutes = require('./routes/realtimeCollaboration');
const adaptiveRiskEngineRoutes = require('./routes/adaptiveRiskEngine');
const attackGraphRoutes = require('./routes/attackGraph'); // Issue #848: Cross-Account Attack Graph Detection
const incidentPlaybookRoutes = require('./routes/incidentPlaybooks'); // Issue #851: Autonomous Incident Response Playbooks
const incidentAutomationRoutes = require('./routes/incidentAutomation'); // Issue #919: Incident Response Automation Engine
const sessionTrustScoringRoutes = require('./routes/sessionTrustScoring'); // Issue #852: Continuous Session Trust Re-Scoring
const sessionRecoveryRoutes = require('./routes/sessionRecovery'); // Issue #881: Session Hijacking Prevention & Recovery
const sessionHijackingMiddleware = require('./middleware/sessionHijackingDetection'); // Issue #881
const mlAnomalyRoutes = require('./routes/mlAnomaly'); // Issue #878: Behavioral ML Anomaly Detection
const crossSessionCorrelationRoutes = require('./routes/crossSessionCorrelation'); // Issue #879: Cross-Session Threat Correlation
const privilegeTransitionMonitorRoutes = require('./routes/privilegeTransitionMonitor'); // Issue #872: Zero-Trust Privilege Transition Monitoring
const realtimeCollaborationService = require('./services/realtimeCollaborationService');
const attackGraphIntegrationService = require('./services/attackGraphIntegrationService'); // Issue #848
const mlAnomalyDetectionService = require('./services/mlAnomalyDetectionService'); // Issue #878
const threatIntelIntegrationService = require('./services/threatIntelIntegrationService'); // Issue #877
const crossSessionThreatCorrelationService = require('./services/crossSessionThreatCorrelationService'); // Issue #879
const containmentActionSystem = require('./services/containmentActionSystem'); // Issue #879
const trustedRelationshipsManager = require('./services/trustedRelationshipsManager'); // Issue #879
const { transportSecuritySuite } = require('./middleware/transportSecurity');
const cron = require('node-cron');
const { Server } = require('socket.io');

// Distributed real-time sync dependencies (Safe Initialization)
let redisPub = null;
let redisSub = null;

global.redisPub = redisPub;
global.redisSub = redisSub;

const REDIS_ENABLED = !!process.env.REDIS_URL;

if (REDIS_ENABLED) {
  try {
    const Redis = require('ioredis');

    redisPub = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      }
    });

    redisSub = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3
    });

    redisPub.on('error', (err) => {
      console.warn('[Redis Publisher Error]:', err.message);
    });

    redisSub.on('error', (err) => {
      console.warn('[Redis Subscriber Error]:', err.message);
    });

    console.log('✅ Redis initialized');
  } catch (err) {
    console.warn('⚠ Redis initialization failed. Running without Redis.');
    redisPub = null;
    redisSub = null;
  }
} else {
  console.log('⚠ REDIS_URL not set. Running without Redis.');
}

// Redis pub/sub channel for distributed sync
const SYNC_CHANNEL = 'expenseflow:sync';
const COLLAB_CHANNEL = 'expenseflow:collab';
const SERVER_INSTANCE_ID = process.env.SERVER_INSTANCE_ID || crypto.randomUUID();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});


// Initialize Asynchronous Listeners (Issue #711)
require('./listeners/EmailListeners').init();
require('./listeners/AuditListeners').init();


/* ================================
   SECURITY
================================ */

// Security middleware
// Transport Security (HTTPS, HSTS, Security Headers)
// Issue #827: End-to-End Encryption for Sensitive Data
app.use(transportSecuritySuite({
  enforceHTTPS: process.env.NODE_ENV === 'production',
  enforceHSTS: process.env.NODE_ENV === 'production',
  securityHeaders: true,
  enforceTLS: process.env.NODE_ENV === 'production',
  validateCipher: process.env.NODE_ENV === 'production'
}));

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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 🔥 Register correlation middleware EARLY
app.use(requestCorrelation);

app.use(requestContext);
app.use(require('./middleware/encryptionInterceptor'));
app.use(require('./middleware/validationInterceptor'));
app.use(require('./middleware/auditInterceptor'));
app.use(require('./middleware/auditTraceability'));
app.use(require('./middleware/taxDeductionInterceptor')); // Issue #843
app.use(require('./middleware/shardResolver')); // Issue #842: Distributed Ledger Fabric
app.use(require('./middleware/partitionAwareGuard')); // Issue #868: Multi-Master Consensus
app.use(require('./middleware/privacyProverGuard')); // Issue #867: ZK-Compliance Attestation
app.use(require('./middleware/tenantResolver'));
// Inject Circuit Breaker protection early in the pipeline
// We pass 'TRANSACTION' as a default, though specific routers might override it
app.use(require('./middleware/complianceGuard')('TRANSACTION'));
app.use(require('./middleware/leakageGuard'));
app.use(require('./middleware/liquidityGuard'));
app.use(require('./middleware/balanceGuard'));
app.use(require('./middleware/governanceGuard'));
app.use(require('./middleware/journalInterceptor'));
app.use(require('./middleware/fieldMasker'));
app.use(require('./middleware/performanceInterceptor'));
app.use(require('./middleware/leakageMonitor'));
app.use(require('./middleware/integrityMonitor')); // Issue #910: Financial Integrity Watchtower
app.use(require('./middleware/liquidityAlertGuard')); // Issue #909: Predictive Liquidity Prophet
app.use(require('./middleware/threatIntelGuard')); // Issue #907: Adversarial Fraud Prevention
app.use(require('./middleware/jurisdictionGuard')); // Issue #961: Autonomous Tax-Jurisdiction Nexus Engine
app.use(require('./middleware/quantumIntegrityGuard')); // Issue #960: PQC Forensic Integrity
app.use(require('./middleware/liquidityProvisionGuard')); // Issue #959: JIT Liquidity Rebalancing




/* ================================
   DATABASE CONNECTION
================================ */

async function connectDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });

    console.log('✅ MongoDB connected');

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
        require('./jobs/searchPruner').start();
        require('./jobs/conflictPruner').start();
        require('./jobs/liquidityAnalyzer').start();
        require('./jobs/liquidityRebalancer').start();
        require('./jobs/policyAuditor').start();
        require('./jobs/journalApplier').start();
        require('./jobs/metricFlusher').start();
        require('./jobs/integrityAuditor').start();
        require('./jobs/cachePruner').start();
        require('./jobs/velocityCalculator').start();
        require('./jobs/keyRotator').start();
        require('./jobs/neuralReindexer').start();
        require('./jobs/nightlyReconciler').start(); // Issue #910: Self-Healing Reconciliation
        require('./jobs/weeklyProphet').start(); // Issue #909: Predictive Liquidity Prophet
        require('./jobs/redTeamSweep').start(); // Issue #907: Adversarial Fraud Simulation
        require('./jobs/nexusUpdateJob').start(); // Issue #961: Tax Nexus Global Sync
        require('./jobs/anchorGenerator').start(); // Issue #960: PQC Forensic Anchoring
        require('./jobs/nightlyBalancer').start(); // Issue #959: Capital Efficiency sweep
        require('./services/jitFundingOrchestrator').start(); // Issue #959: JIT Funding loop


        require('./services/jobOrchestrator').start();

        console.log('✓ Cron jobs initialized');

      } catch (err) {
        console.log('Cron jobs skipped:', err.message);
      }
    }

    attackGraphIntegrationService.initialize();
    console.log('✓ Attack graph detection initialized');

    // Initialize ML anomaly detection system
    // Issue #878: Behavioral ML Anomaly Detection
    mlAnomalyDetectionService.initialize()
      .then(() => {
        console.log('✓ ML anomaly detection initialized');
      })
      .catch(err => {
        console.error('ML anomaly detection initialization error:', err);
        console.log('⚠ ML system will train on first use');
      });

    // Initialize threat intelligence integration
    // Issue #877: Real-Time Threat Intelligence Integration
    threatIntelIntegrationService.initialize();
    console.log('✓ Threat intelligence integration initialized');

    // Initialize cross-session threat correlation system
    // Issue #879: Cross-Session Threat Correlation
    crossSessionThreatCorrelationService.initialize()
      .then(() => {
        console.log('✓ Cross-session threat correlation initialized');
      })
      .catch(err => {
        console.error('Cross-session correlation initialization error:', err);
      });

    // Initialize containment action system
    containmentActionSystem.initialize()
      .then(() => {
        console.log('✓ Containment action system initialized');
      })
      .catch(err => {
        console.error('Containment action system initialization error:', err);
      });

    // Initialize trusted relationships manager
    trustedRelationshipsManager.initialize()
      .then(() => {
        console.log('✓ Trusted relationships manager initialized');
      })
      .catch(err => {
        console.error('Trusted relationships manager initialization error:', err);
      });

    // Initialize session hijacking detection system
    // Issue #881: Session Hijacking Prevention & Recovery
    console.log('✓ Session hijacking detection initialized');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}

connectDatabase();




io.use(socketAuth);

io.on('connection', (socket) => {
  console.log(`User ${socket.user.name} connected to instance ${SERVER_INSTANCE_ID}`);

  // Listen for client expense changes and broadcast to Redis
  socket.on('expense_created', (expense) => {
    io.emit('expense_created', expense);
    if (redisPub) {
      redisPub.publish(SYNC_CHANNEL, JSON.stringify({ type: 'expense_created', expense }));
    }
  });

  socket.on('expense_updated', (expense) => {
    io.emit('expense_updated', expense);
    if (redisPub) {
      redisPub.publish(SYNC_CHANNEL, JSON.stringify({ type: 'expense_updated', expense }));
    }
  });

  socket.on('expense_deleted', (data) => {
    io.emit('expense_deleted', data);
    if (redisPub) {
      redisPub.publish(SYNC_CHANNEL, JSON.stringify({ type: 'expense_deleted', data }));
    }
  });

  socket.on('collab:join', async (payload = {}) => {
    try {
      const { documentId } = payload;
      if (!documentId) {
        socket.emit('collab:error', { error: 'documentId is required' });
        return;
      }

      const snapshot = await realtimeCollaborationService.getDocument(documentId, socket.userId);
      socket.join(`collab_doc_${documentId}`);
      socket.emit('collab:snapshot', {
        documentId,
        snapshot
      });

      await realtimeCollaborationService.markPresence(documentId, socket.userId, true);

      io.to(`collab_doc_${documentId}`).emit('collab:presence', {
        documentId,
        userId: socket.userId,
        status: 'online',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      socket.emit('collab:error', { error: error.message });
    }
  });

  socket.on('collab:operations', async (payload = {}) => {
    try {
      const { documentId, operations = [], deviceId } = payload;
      if (!documentId) {
        socket.emit('collab:error', { error: 'documentId is required' });
        return;
      }

      const result = await realtimeCollaborationService.applyOperations(
        documentId,
        socket.userId,
        deviceId,
        Array.isArray(operations) ? operations : []
      );

      socket.emit('collab:ack', {
        documentId,
        version: result.version,
        appliedResults: result.appliedResults
      });

      const eventPayload = {
        serverInstanceId: SERVER_INSTANCE_ID,
        sourceSocketId: socket.id,
        sourceUserId: socket.userId,
        documentId,
        version: result.version,
        operations: result.serverOperations,
        text: result.text,
        registers: result.registers,
        cells: result.cells,
        timestamp: new Date().toISOString()
      };

      socket.to(`collab_doc_${documentId}`).emit('collab:operations', eventPayload);
      if (redisPub) {
        redisPub.publish(COLLAB_CHANNEL, JSON.stringify(eventPayload));
      }
    } catch (error) {
      socket.emit('collab:error', { error: error.message });
    }
  });

  socket.on('collab:leave', async (payload = {}) => {
    try {
      const { documentId } = payload;
      if (!documentId) {
        return;
      }

      socket.leave(`collab_doc_${documentId}`);
      await realtimeCollaborationService.markPresence(documentId, socket.userId, false);
      io.to(`collab_doc_${documentId}`).emit('collab:presence', {
        documentId,
        userId: socket.userId,
        status: 'offline',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      socket.emit('collab:error', { error: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User ${socket.user.name} disconnected`);
  });
});

// Listen for Redis sync events and broadcast to local clients
if (redisSub) {
  redisSub.subscribe(SYNC_CHANNEL, (err) => {
    if (err) console.error('Redis subscribe error:', err);
  });

  redisSub.subscribe(COLLAB_CHANNEL, (err) => {
    if (err) console.error('Redis collab subscribe error:', err);
  });

  redisSub.on('message', (channel, message) => {
    try {
      const payload = JSON.parse(message);

      if (channel === COLLAB_CHANNEL) {
        if (payload.serverInstanceId === SERVER_INSTANCE_ID) {
          return;
        }
        if (payload.documentId) {
          io.to(`collab_doc_${payload.documentId}`).emit('collab:operations', payload);
        }
        return;
      }

      if (channel !== SYNC_CHANNEL) {
        return;
      }

      if (payload.type === 'expense_created') {
        io.emit('expense_created', payload.expense);
      } else if (payload.type === 'expense_updated') {
        io.emit('expense_updated', payload.expense);
      } else if (payload.type === 'expense_deleted') {
        io.emit('expense_deleted', payload.data);
      }
    } catch (e) {
      console.error('Redis sync event error:', e);
    }
  });
}

// Add issue specific jobs here
if (process.env.NODE_ENV !== 'production') {
  require('./jobs/entropyPruner').start(); // Issue #868: Metadata management
  require('./jobs/nightlyProver').start(); // Issue #867: ZK-Compliance Proving
  require('./jobs/dnaAttestation').start(); // Issue #866: Genetic Money Integrity
}

// Lineage & Eligibility Middleware
app.use(require('./middleware/lineageGuard')); // Issue #866: DNA-Based Eligibility check

app.use('/api/correlation', crossSessionCorrelationRoutes); // Issue #879: Cross-Session Threat Correlation
app.use('/api/session-recovery', sessionRecoveryRoutes); // Issue #881: Session Hijacking Prevention & Recovery
// Routes
app.use('/api', apiGateway.middleware());
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
app.use('/api/ml-anomaly', mlAnomalyRoutes); // Issue #878: Behavioral ML Anomaly Detection
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/2fa', require('./middleware/auth'), twoFactorAuthRoutes); // Issue #503: 2FA Management
app.use('/api/encryption', encryptionRoutes); // Issue #827: End-to-End Encryption
app.use('/api/forecasting-ai', automatedForecastingRoutes); // Issue #828: Automated Financial Forecasting & AI Insights
app.use('/api/audit-compliance', auditComplianceRoutes); // Issue #829: Audit Trail & Forensic Investigation Platform
app.use('/api/gateway', apiGatewayRoutes);
app.use('/api/realtime-collab', realtimeCollaborationRoutes);
app.use('/api/risk-engine', adaptiveRiskEngineRoutes);
app.use('/api/attack-graph', attackGraphRoutes); // Issue #848: Cross-Account Attack Graph Detection
app.use('/api/incident-playbooks', incidentPlaybookRoutes); // Issue #851: Autonomous Incident Response Playbooks
app.use('/api/incident-automation', incidentAutomationRoutes); // Issue #919: Incident Response Automation Engine
app.use('/api/session-trust', sessionTrustScoringRoutes); // Issue #852: Continuous Session Trust Re-Scoring
// Apply session hijacking detection middleware to protected routes
// Issue #881: Session Hijacking Prevention & Recovery
sessionHijackingMiddleware.applyToRoutes(app, [
  '/api/expenses',
  '/api/budgets',
  '/api/goals',
  '/api/analytics',
  '/api/reports',
  '/api/accounts',
  '/api/settings',
  '/api/tax',
  '/api/encryption',
  '/api/backups'
]);

// Serve recovery page
app.get('/auth/recovery', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'public', 'session-recovery.html'));
});

// 
// Express error handler middleware (must be after all routes)
app.use((err, req, res, next) => {
  console.error('Express route error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
});

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

  // Register server for graceful shutdown
  registerServer(server);

  // Setup shutdown listeners
  setupGracefulShutdown();
}

/* ================================
   EXPORT FOR VERCEL
================================ */

module.exports = app;
