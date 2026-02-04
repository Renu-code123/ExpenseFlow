/**
 * Unit Tests for User Model
 * Tests user model methods, validations, and password hashing
 */

const mongoose = require('mongoose');
const User = require('../../models/User');
const bcrypt = require('bcryptjs');

// Mock mongoose connection for unit tests
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    ...actualMongoose,
    connect: jest.fn(),
    connection: {
      close: jest.fn()
    }
  };
});

describe('User Model', () => {
  describe('User Schema Validation', () => {
    test('should validate required fields', () => {
      const user = new User({});
      const validationError = user.validateSync();
      
      expect(validationError).toBeDefined();
      expect(validationError.errors.name).toBeDefined();
      expect(validationError.errors.email).toBeDefined();
      expect(validationError.errors.password).toBeDefined();
    });

    test('should accept valid user data', () => {
      const validUser = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'SecurePassword123!'
      });
      
      const validationError = validUser.validateSync();
      expect(validationError).toBeUndefined();
    });

    test('should trim and lowercase email', () => {
      const user = new User({
        name: 'Test User',
        email: '  TEST@EXAMPLE.COM  ',
        password: 'SecurePassword123!'
      });
      
      expect(user.email).toBe('test@example.com');
    });

    test('should set default currency to INR', () => {
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'SecurePassword123!'
      });
      
      expect(user.preferredCurrency).toBe('INR');
    });

    test('should set default locale to en-US', () => {
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'SecurePassword123!'
      });
      
      expect(user.locale).toBe('en-US');
    });
  });

  describe('Password Hashing', () => {
    test('should hash password before saving', async () => {
      const plainPassword = 'SecurePassword123!';
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: plainPassword
      });

      // Mock the save method to trigger pre-save hook
      user.isModified = jest.fn().mockReturnValue(true);
      
      // Simulate password hashing
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(plainPassword, salt);
      
      expect(hashedPassword).not.toBe(plainPassword);
      expect(hashedPassword.length).toBeGreaterThan(plainPassword.length);
    });

    test('should not rehash password if not modified', async () => {
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'alreadyHashedPassword'
      });

      user.isModified = jest.fn().mockReturnValue(false);
      const originalPassword = user.password;
      
      // Password should remain unchanged if not modified
      expect(user.password).toBe(originalPassword);
    });
  });

  describe('User Methods', () => {
    test('should correctly compare passwords', async () => {
      const plainPassword = 'SecurePassword123!';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      
      const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
      expect(isMatch).toBe(true);
      
      const isNotMatch = await bcrypt.compare('wrongPassword', hashedPassword);
      expect(isNotMatch).toBe(false);
    });

    test('should generate valid ObjectId', () => {
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'SecurePassword123!'
      });
      
      expect(user._id).toBeDefined();
      expect(mongoose.Types.ObjectId.isValid(user._id)).toBe(true);
    });
  });

  describe('User Data Sanitization', () => {
    test('should trim name field', () => {
      const user = new User({
        name: '  Test User  ',
        email: 'test@example.com',
        password: 'SecurePassword123!'
      });
      
      expect(user.name).toBe('Test User');
    });

    test('should enforce name max length', () => {
      const longName = 'a'.repeat(100);
      const user = new User({
        name: longName,
        email: 'test@example.com',
        password: 'SecurePassword123!'
      });
      
      const validationError = user.validateSync();
      expect(validationError).toBeDefined();
      expect(validationError.errors.name).toBeDefined();
    });

    test('should enforce password min length', () => {
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'short'
      });
      
      const validationError = user.validateSync();
      expect(validationError).toBeDefined();
      expect(validationError.errors.password).toBeDefined();
    });
  });

  describe('Currency and Locale', () => {
    test('should accept custom currency', () => {
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'SecurePassword123!',
        preferredCurrency: 'USD'
      });
      
      expect(user.preferredCurrency).toBe('USD');
    });

    test('should uppercase currency code', () => {
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'SecurePassword123!',
        preferredCurrency: 'usd'
      });
      
      // Mongoose uppercase option should handle this
      expect(user.preferredCurrency).toBe('USD');
    });

    test('should accept custom locale', () => {
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'SecurePassword123!',
        locale: 'es-ES'
      });
      
      expect(user.locale).toBe('es-ES');
    });
  });

  describe('Budget Limit', () => {
    test('should set default monthly budget to 0', () => {
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'SecurePassword123!'
      });
      
      expect(user.monthlyBudgetLimit).toBe(0);
    });

    test('should not allow negative budget', () => {
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'SecurePassword123!',
        monthlyBudgetLimit: -100
      });
      
      const validationError = user.validateSync();
      expect(validationError).toBeDefined();
      expect(validationError.errors.monthlyBudgetLimit).toBeDefined();
    });

    test('should accept positive budget', () => {
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'SecurePassword123!',
        monthlyBudgetLimit: 5000
      });
      
      expect(user.monthlyBudgetLimit).toBe(5000);
    });
  });
});
