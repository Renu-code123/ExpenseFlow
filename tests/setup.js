// Global test setup
require('dotenv').config({ path: '.env.test' });

// Suppress console output during tests (optional)
global.console = {
  ...console,
  // Uncomment to suppress console.log during tests
  // log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock Date for consistent testing
const MockDate = require('mockdate');

beforeEach(() => {
  // Reset date mocks before each test
  MockDate.reset();
});

afterAll(() => {
  // Cleanup
  MockDate.reset();
});
