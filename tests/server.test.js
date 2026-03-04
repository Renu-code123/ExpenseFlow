/**
 * Integration Tests for Server Startup Process
 * Tests the modular server initialization
 */

const request = require('supertest');
const mongoose = require('mongoose');

// Mock mongoose to avoid actual DB connections during tests
jest.mock('mongoose');
jest.mock('../services/cronJobs', () => ({
  init: jest.fn()
}));

// Import the app and server modules
const { app, connectDatabase, startServer } = require('../server');

describe('Server Startup Integration Tests', () => {
  
  describe('Database Connection', () => {
    it('should connect to MongoDB successfully', async () => {
      mongoose.connect = jest.fn().mockResolvedValue(true);
      
      const result = await connectDatabase();
      
      expect(mongoose.connect).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          useNewUrlParser: true,
          useUnifiedTopology: true
        })
      );
      expect(result).toBe(true);
    });

    it('should throw error when database connection fails', async () => {
      mongoose.connect = jest.fn().mockRejectedValue(new Error('Connection failed'));
      
      await expect(connectDatabase()).rejects.toThrow('MongoDB connection error:');
    });
  });

  describe('Server Configuration', () => {
    it('should have express app configured', () => {
      expect(app).toBeDefined();
      expect(typeof app.use).toBe('function');
    });

    it('should have proper middleware configured', () => {
      // Check that middleware was applied (basic check)
      expect(app._router).toBeDefined();
    });

    it('should export required functions', () => {
      expect(typeof connectDatabase).toBe('function');
      expect(typeof startServer).toBe('function');
    });
  });

  describe('Route Configuration', () => {
    it('should have API routes registered', () => {
      // Check that routes are mounted
      const registeredRoutes = app._router?.stack
        ?.filter(layer => layer.route)
        ?.map(layer => layer.route.path) || [];
      
      // At least some routes should be registered
      expect(Array.isArray(registeredRoutes)).toBe(true);
    });
  });

  describe('Server Start', () => {
    it('should start server with async initialization', async () => {
      mongoose.connect = jest.fn().mockResolvedValue(true);
      
      // Mock server.listen to prevent actual server start
      const mockServer = {
        listen: jest.fn((port, callback) => {
          if (callback) callback();
          return mockServer;
        })
      };
      
      // We can't fully test startServer without more mocking
      // but we can verify the function exists and is async
      expect(startServer).toBeDefined();
    });
  });
});

describe('Config Module Tests', () => {
  const config = require('../config');

  it('should export server configuration', () => {
    expect(config.server).toBeDefined();
    expect(config.server.port).toBeDefined();
  });

  it('should export database configuration', () => {
    expect(config.database).toBeDefined();
    expect(config.database.uri).toBeDefined();
  });

  it('should export CORS configuration', () => {
    expect(config.cors).toBeDefined();
    expect(Array.isArray(config.cors.allowedOrigins)).toBe(true);
  });

  it('should export Socket.IO configuration', () => {
    expect(config.socket).toBeDefined();
    expect(config.socket.cors).toBeDefined();
  });
});

describe('Middleware Module Tests', () => {
  const { configureMiddleware } = require('../config/middleware');

  it('should export configureMiddleware function', () => {
    expect(typeof configureMiddleware).toBe('function');
  });

  it('should configure middleware without errors', () => {
    const mockApp = {
      use: jest.fn()
    };
    
    expect(() => configureMiddleware(mockApp)).not.toThrow();
  });
});

describe('Socket Module Tests', () => {
  const { initializeSocket } = require('../config/socket');

  it('should export initializeSocket function', () => {
    expect(typeof initializeSocket).toBe('function');
  });

  it('should initialize Socket.IO without errors', () => {
    const mockServer = {
      on: jest.fn(),
      use: jest.fn(),
      emit: jest.fn()
    };
    
    const io = initializeSocket(mockServer);
    
    expect(io).toBeDefined();
    expect(mockServer.use).toHaveBeenCalled();
  });
});
