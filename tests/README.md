# ExpenseFlow Test Suite

This directory contains unit and integration tests for the ExpenseFlow application.

## 📂 Structure

```
tests/
├── unit/              # Unit tests for individual components
│   ├── user.test.js   # User model tests
│   └── utils.test.js  # Utility function tests
├── integration/       # Integration tests for API endpoints
│   └── auth.test.js   # Authentication API tests
└── setup.js          # Global test setup and configuration
```

## 🚀 Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run only unit tests
```bash
npm run test:unit
```

### Run only integration tests
```bash
npm run test:integration
```

### Run tests with coverage report
```bash
npm test -- --coverage
```

## 📊 Test Coverage

The project aims for the following coverage thresholds:
- **Branches**: 50%
- **Functions**: 50%
- **Lines**: 50%
- **Statements**: 50%

Coverage reports are generated in the `coverage/` directory.

## 🔧 Configuration

Tests are configured using `jest.config.js` in the root directory.

### Key Features:
- **Test Environment**: Node.js
- **Coverage**: Collected from models, services, middleware, utils, and routes
- **Setup**: Global setup in `tests/setup.js`
- **Timeout**: 10 seconds per test
- **Mocking**: Automatic mock clearing between tests

## ✍️ Writing Tests

### Unit Test Example

```javascript
const User = require('../../models/User');

describe('User Model', () => {
  test('should validate required fields', () => {
    const user = new User({});
    const validationError = user.validateSync();
    
    expect(validationError).toBeDefined();
    expect(validationError.errors.name).toBeDefined();
  });
});
```

### Integration Test Example

```javascript
const request = require('supertest');
const app = require('../../server');

describe('POST /api/auth/register', () => {
  test('should register new user', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'SecurePassword123!'
      })
      .expect(201);

    expect(response.body.success).toBe(true);
  });
});
```

## 🎯 Test Naming Conventions

- Use descriptive test names that explain what is being tested
- Start with action verbs: "should", "must", "can"
- Group related tests using `describe` blocks
- Use `test` or `it` for individual test cases

### Good Examples:
- ✅ "should validate required fields"
- ✅ "should hash password before saving"
- ✅ "should reject invalid email addresses"

### Bad Examples:
- ❌ "test 1"
- ❌ "user"
- ❌ "check email"

## 🔄 Test Data

### Use unique data for each test
```javascript
const testEmail = `test${Date.now()}@example.com`;
```

### Clean up after tests
```javascript
afterEach(async () => {
  // Clean up test data
  await User.deleteMany({ email: /test.*@example\.com/ });
});
```

## 🐛 Debugging Tests

### Run specific test file
```bash
npm test -- user.test.js
```

### Run specific test case
```bash
npm test -- -t "should validate required fields"
```

### Enable verbose output
```bash
npm test -- --verbose
```

## 📝 Integration Test Setup

Integration tests require a test database. Set up your `.env.test` file:

```env
NODE_ENV=test
MONGODB_URI=mongodb://localhost:27017/expenseflow_test
JWT_SECRET=test_secret_key
```

**Important**: Never use production database for tests!

## 🔐 Security Testing

Tests should verify:
- ✅ Password hashing
- ✅ Input validation
- ✅ Input sanitization
- ✅ Authentication requirements
- ✅ Authorization checks
- ✅ Rate limiting

## 📚 Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Mongoose Testing Guide](https://mongoosejs.com/docs/jest.html)

## 🤝 Contributing

When adding new features, please include:
1. Unit tests for models and utilities
2. Integration tests for API endpoints
3. Maintain or improve code coverage
4. Follow existing test patterns

## 📊 Current Test Status

- ✅ User Model Tests
- ✅ Utility Function Tests
- ✅ Authentication API Tests (template)
- 🔄 More tests coming soon!

## 🎯 Testing Checklist

Before submitting a PR, ensure:
- [ ] All tests pass
- [ ] New code has test coverage
- [ ] Tests are descriptive and clear
- [ ] No console errors or warnings
- [ ] Coverage thresholds are met
- [ ] Integration tests use test database

---

Happy Testing! 🧪
