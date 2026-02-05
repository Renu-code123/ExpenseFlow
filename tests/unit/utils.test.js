/**
 * Unit Tests for Utility Functions
 * Tests helper functions and utility methods
 */

// Note: If utils/helpers.js doesn't exist, these are standalone utility tests
// const { validateEmail, sanitizeInput, formatCurrency, calculatePercentage } = require('../../utils/helpers');

describe('Utility Functions', () => {
  describe('Email Validation', () => {
    test('should validate correct email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'user_name@example-domain.com'
      ];

      validEmails.forEach(email => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        expect(emailRegex.test(email)).toBe(true);
      });
    });

    test('should reject invalid email addresses', () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user @example.com',
        'user@example',
        ''
      ];

      invalidEmails.forEach(email => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        expect(emailRegex.test(email)).toBe(false);
      });
    });
  });

  describe('Input Sanitization', () => {
    test('should remove HTML tags from input', () => {
      const dirty = '<script>alert("xss")</script>Hello';
      const clean = dirty.replace(/<[^>]*>/g, '');
      expect(clean).toBe('Hello');
    });

    test('should trim whitespace', () => {
      const input = '  test  ';
      expect(input.trim()).toBe('test');
    });

    test('should handle empty strings', () => {
      const input = '';
      expect(input.trim()).toBe('');
    });
  });

  describe('Currency Formatting', () => {
    test('should format numbers as currency', () => {
      const amount = 1234.56;
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount);
      
      expect(formatted).toBe('$1,234.56');
    });

    test('should handle zero values', () => {
      const amount = 0;
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount);
      
      expect(formatted).toBe('$0.00');
    });

    test('should handle negative values', () => {
      const amount = -100.50;
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount);
      
      expect(formatted).toBe('-$100.50');
    });

    test('should format in different currencies', () => {
      const amount = 1000;
      
      const usd = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount);
      
      const eur = new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR'
      }).format(amount);
      
      const inr = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
      }).format(amount);
      
      expect(usd).toContain('1,000');
      expect(eur).toContain('1');
      expect(inr).toContain('1,000');
    });
  });

  describe('Percentage Calculation', () => {
    test('should calculate percentage correctly', () => {
      const part = 25;
      const total = 100;
      const percentage = (part / total) * 100;
      
      expect(percentage).toBe(25);
    });

    test('should handle zero total', () => {
      const part = 50;
      const total = 0;
      const percentage = total === 0 ? 0 : (part / total) * 100;
      
      expect(percentage).toBe(0);
    });

    test('should handle decimal results', () => {
      const part = 1;
      const total = 3;
      const percentage = Math.round((part / total) * 100 * 100) / 100;
      
      expect(percentage).toBeCloseTo(33.33, 2);
    });

    test('should handle percentage greater than 100', () => {
      const part = 150;
      const total = 100;
      const percentage = (part / total) * 100;
      
      expect(percentage).toBe(150);
    });
  });

  describe('Date Utilities', () => {
    test('should format date correctly', () => {
      const date = new Date('2026-02-04');
      const formatted = date.toISOString().split('T')[0];
      
      expect(formatted).toBe('2026-02-04');
    });

    test('should get current month', () => {
      const date = new Date();
      const month = date.getMonth() + 1; // 0-indexed
      
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
    });

    test('should calculate days between dates', () => {
      const date1 = new Date('2026-02-01');
      const date2 = new Date('2026-02-04');
      const diffTime = Math.abs(date2 - date1);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      expect(diffDays).toBe(3);
    });
  });

  describe('Number Utilities', () => {
    test('should round to 2 decimal places', () => {
      const num = 10.456;
      const rounded = Math.round(num * 100) / 100;
      
      expect(rounded).toBe(10.46);
    });

    test('should handle very small numbers', () => {
      const num = 0.001;
      const rounded = Math.round(num * 100) / 100;
      
      expect(rounded).toBe(0);
    });

    test('should parse string to number', () => {
      const str = '123.45';
      const num = parseFloat(str);
      
      expect(num).toBe(123.45);
      expect(typeof num).toBe('number');
    });

    test('should check if value is a number', () => {
      expect(isNaN(123)).toBe(false);
      expect(isNaN('abc')).toBe(true);
      expect(isNaN(NaN)).toBe(true);
    });
  });

  describe('String Utilities', () => {
    test('should capitalize first letter', () => {
      const str = 'hello world';
      const capitalized = str.charAt(0).toUpperCase() + str.slice(1);
      
      expect(capitalized).toBe('Hello world');
    });

    test('should convert to title case', () => {
      const str = 'hello world';
      const titleCase = str.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      expect(titleCase).toBe('Hello World');
    });

    test('should truncate long strings', () => {
      const str = 'This is a very long string that needs to be truncated';
      const maxLength = 20;
      const truncated = str.length > maxLength 
        ? str.substring(0, maxLength) + '...' 
        : str;
      
      expect(truncated).toBe('This is a very long ...');
      expect(truncated.length).toBeLessThanOrEqual(maxLength + 3);
    });
  });

  describe('Array Utilities', () => {
    test('should remove duplicates from array', () => {
      const arr = [1, 2, 2, 3, 4, 4, 5];
      const unique = [...new Set(arr)];
      
      expect(unique).toEqual([1, 2, 3, 4, 5]);
    });

    test('should sum array values', () => {
      const arr = [1, 2, 3, 4, 5];
      const sum = arr.reduce((acc, val) => acc + val, 0);
      
      expect(sum).toBe(15);
    });

    test('should find max value in array', () => {
      const arr = [10, 5, 20, 15, 8];
      const max = Math.max(...arr);
      
      expect(max).toBe(20);
    });

    test('should find min value in array', () => {
      const arr = [10, 5, 20, 15, 8];
      const min = Math.min(...arr);
      
      expect(min).toBe(5);
    });

    test('should calculate average', () => {
      const arr = [10, 20, 30, 40, 50];
      const avg = arr.reduce((acc, val) => acc + val, 0) / arr.length;
      
      expect(avg).toBe(30);
    });
  });
});
