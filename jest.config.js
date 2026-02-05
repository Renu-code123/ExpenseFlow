module.exports = {
  // Test environment
  testEnvironment: "node",

  // Test match patterns
  testMatch: ["**/tests/**/*.test.js", "**/__tests__/**/*.js"],

  // Coverage configuration
  collectCoverageFrom: [
    "models/**/*.js",
    "services/**/*.js",
    "middleware/**/*.js",
    "utils/**/*.js",
    "routes/**/*.js",
    "!**/node_modules/**",
    "!**/tests/**",
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },

  // Setup files
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],

  // Test timeout
  testTimeout: 10000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Coverage directory
  coverageDirectory: "coverage",

  // Coverage reporters
  coverageReporters: ["text", "lcov", "html"],

  // Module paths
  moduleDirectories: ["node_modules", "src"],

  // Transform ignore patterns
  transformIgnorePatterns: ["node_modules/(?!(node-fetch)/)"],
};
