/**
 * Environment-based configuration
 * Centralizes all environment variables and app settings
 */

require('dotenv').config();

module.exports = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
  },

  // Database Configuration
  database: {
    uri: process.env.MONGODB_URI,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },

  // CORS Configuration
  cors: {
    allowedOrigins: [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.FRONTEND_URL
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },

  // Socket.IO Configuration
  socket: {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  },

  // Security Configuration
  security: {
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:', 'https://res.cloudinary.com'],
          connectSrc: ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://api.exchangerate-api.com', 'https://api.frankfurter.app', 'https://res.cloudinary.com'],
          fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false
    }
  },

  // Rate Limiting Configuration
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  },

  // Body Parser Configuration
  bodyParser: {
    json: { limit: '10mb' },
    urlencoded: { extended: true, limit: '10mb' }
  },

  // Static Files Configuration
  static: {
    paths: ['public', '.']
  }
};
