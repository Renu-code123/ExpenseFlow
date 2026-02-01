# Input Validation & Data Sanitization Implementation

## Issue #461: Missing Input Validation on User Data

This document describes the comprehensive input validation and sanitization system implemented across the ExpenseFlow application to prevent security vulnerabilities and ensure data integrity.

## Overview

A complete validation and sanitization layer has been added to protect against:
- **XSS (Cross-Site Scripting)** attacks
- **NoSQL Injection** attacks
- **SQL Injection** attempts
- **Type coercion** attacks
- **Malicious data payloads**
- **File upload exploits**
- **Parameter pollution**

## Architecture

### 1. Middleware Layer (`middleware/inputValidator.js`)

Centralized validation schemas using Joi for all data types and routes.

#### Implemented Schemas:

**Common Schemas:**
- `pagination` - Page, limit, sort validation
- `mongoId` - MongoDB ObjectId validation
- `email` - Email validation
- `password` - Strong password requirements (12+ chars, uppercase, lowercase, number, special char)
- `currency` - Valid currency codes (USD, EUR, etc.)
- `url` - URL validation
- `phone` - Phone number validation
- `amount` - Monetary amount validation (2 decimal precision)
- `percentage` - 0-100 percentage validation
- `date` - ISO date validation
- `name` - Name field validation

**Domain-Specific Schemas:**

```javascript
// Authentication
AuthSchemas.register
AuthSchemas.login
AuthSchemas.emailVerification
AuthSchemas.passwordReset
AuthSchemas.twoFactorSetup

// Expenses
ExpenseSchemas.create      // POST /expenses
ExpenseSchemas.update      // PUT /expenses/:id
ExpenseSchemas.filter      // GET /expenses with filters

// Budgets
BudgetSchemas.create       // POST /budgets
BudgetSchemas.monthly      // POST /budgets/monthly
BudgetSchemas.limit        // POST /budgets/monthly-limit

// Goals
GoalSchemas.create         // POST /goals

// Groups
GroupSchemas.create        // POST /groups
GroupSchemas.addMember     // POST /groups/:id/members
GroupSchemas.updateSettings // PUT /groups/:id/settings

// Invoices
InvoiceSchemas.create      // POST /invoices
InvoiceSchemas.payment     // POST /invoices/:id/payment

// Payments
PaymentSchemas.create      // POST /payments
PaymentSchemas.filter      // GET /payments with filters

// Users
UserSchemas.update         // PUT /users/profile
UserSchemas.changePassword // POST /users/change-password

// Shared Spaces
SharedSpaceSchemas.create  // POST /shared-spaces
SharedSpaceSchemas.invite  // POST /shared-spaces/:id/invite

// Reports
ReportSchemas.generate     // POST /reports
ReportSchemas.filter       // GET /reports with filters
```

### 2. Sanitization Layer (`middleware/sanitizer.js`)

Automatic input sanitization and XSS prevention.

#### Features:

**XSS Prevention:**
- Removes JavaScript payloads from strings
- Strips HTML tags and event handlers
- Filters dangerous attributes
- Prevents common XSS vectors

**NoSQL Injection Prevention:**
- Sanitizes object keys
- Blocks `__proto__` and `constructor` keys
- Validates data types recursively

**File Upload Security:**
- Validates file extensions
- Enforces file size limits (10MB max)
- Sanitizes filenames
- Prevents directory traversal attacks

**Type Coercion Safety:**
- Validates all data types recursively
- Prevents prototype pollution
- Blocks suspicious key patterns

### 3. Validation Middleware Functions

```javascript
// Validate request body
validateRequest(schema, source = 'body')

// Validate query parameters
validateQuery(schema)

// Validate path parameters
validateParams(schema)

// Main sanitization middleware
sanitizationMiddleware

// File upload sanitization
sanitizeFileUpload

// Data type validation
validateDataTypes
```

## Updated Routes

All critical routes have been updated to use the new validation system:

### Authentication Routes (`routes/auth.js`)
```javascript
POST /auth/register
  - Validates: name, email, password
  - Sanitizes all inputs
  
POST /auth/login
  - Validates: email, password, 2FA token
  - Enforces type checking
  
POST /auth/verify-email
  - Validates verification code format
```

### Expense Routes (`routes/expenses.js`)
```javascript
GET /expenses
  - Validates pagination (page, limit)
  - Validates filters (category, type, dates, amounts)
  
POST /expenses
  - Validates: description, amount, currency, category, type
  - Enforces min/max constraints
  - Validates date format
  
PUT /expenses/:id
  - Re-validates all updated fields
  - Ensures immutable fields cannot be changed
  
DELETE /expenses/:id
  - Validates ObjectId format
```

### Budget Routes (`routes/budgets.js`)
```javascript
POST /budgets
  - Validates: name, category, amount, period, dates
  - Enforces date range validation
  
GET /budgets
  - Validates query filters
  
PUT /budgets/:id
  - Full validation of updated data
  
POST /budgets/monthly-limit
  - Validates amount is a positive number
  
DELETE /budgets/:id
```

### Goal Routes (`routes/goals.js`)
```javascript
POST /goals
  - Validates: title, description, amounts, dates
  - Validates goal type and priority
  - Enforces milestone percentage constraints
  
GET /goals
  
GET /goals/:id
  
PUT /goals/:id
  
DELETE /goals/:id
```

### Group Routes (`routes/groups.js`)
```javascript
POST /groups
  - Validates: name, description, currency, settings
  
GET /groups
  
GET /groups/:id
  
POST /groups/:id/members
  - Validates: email, role
  - Ensures valid role values
  
DELETE /groups/:id/members/:memberId
  - Validates member IDs
```

### Invoice Routes (`routes/invoices.js`)
```javascript
POST /invoices
  - Validates client ID, items array
  - Validates each item (description, quantity, price)
  - Validates due date format
  
GET /invoices
  - Validates pagination and filters
  
GET /invoices/:id
  - Validates invoice ID format
```

### Payment Routes (`routes/payments.js`)
```javascript
POST /payments
  - Validates invoice ID, amount, payment method
  - Enforces valid payment methods
  - Validates amount > 0
  
GET /payments
  - Validates filters and pagination
  
GET /payments/:id
```

## Integration with Server

Update `server.js` to apply sanitization middleware globally:

```javascript
const { setupSanitization, sanitizationMiddleware, validateDataTypes } = require('./middleware/sanitizer');

// Apply sanitization to all requests
setupSanitization(app);

// Add additional validation middleware
app.use(sanitizationMiddleware);
app.use(validateDataTypes);

// Apply routes with validation
app.use('/api/auth', require('./routes/auth'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/budgets', require('./routes/budgets'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/payments', require('./routes/payments'));
```

## Usage Examples

### Creating a validated route

```javascript
const { ExpenseSchemas, validateRequest } = require('../middleware/inputValidator');

// Simple POST with validation
router.post('/', auth, validateRequest(ExpenseSchemas.create), async (req, res) => {
  // req.body is now validated and sanitized
  const expense = new Expense(req.body);
  await expense.save();
  res.status(201).json(expense);
});

// Query validation
router.get('/', auth, validateQuery(ExpenseSchemas.filter), async (req, res) => {
  // req.query is now validated and sanitized
  const expenses = await Expense.find(req.query);
  res.json(expenses);
});
```

### Validation Error Response

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "email",
      "message": "Must be a valid email address"
    },
    {
      "field": "password",
      "message": "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
    }
  ]
}
```

## Data Type Constraints

### String Fields
- XSS filtering applied
- Null byte removal
- Whitespace trimming
- Length constraints enforced

### Numeric Fields
- Positive/negative validation
- Decimal precision checking
- Range validation
- NaN rejection

### Date Fields
- ISO format validation
- Range validation
- No past/future constraints by default
- Timezone handling

### Array Fields
- Element type validation
- Min/max length constraints
- Nested object validation
- Duplicate prevention (where applicable)

## Security Features Implemented

### 1. XSS Prevention
- All string inputs filtered through XSS library
- HTML tags stripped
- Event handlers removed
- JavaScript code blocks blocked

### 2. Injection Prevention
- NoSQL injection prevention via key sanitization
- SQL injection prevented by Mongoose
- Command injection blocked
- Template injection prevented

### 3. File Security
- File type whitelist validation
- File size limits (10MB)
- Filename sanitization
- Directory traversal prevention

### 4. Authentication Security
- Strong password requirements
- TOTP token validation
- Email verification
- Session tracking

### 5. Rate Limiting Compatibility
- Designed to work with express-rate-limit
- Sanitization before rate limit checks
- No bypass vectors

## Custom Validation Examples

### Adding a new validation schema

```javascript
// In middleware/inputValidator.js
const ContactSchemas = {
  create: Joi.object({
    name: CommonSchemas.name,
    email: CommonSchemas.email,
    phone: CommonSchemas.phone,
    message: Joi.string().trim().max(1000).required(),
    priority: Joi.string().valid('low', 'medium', 'high').default('medium')
  }).unknown(false)
};

module.exports = {
  // ... existing exports
  ContactSchemas
};
```

### Using in routes

```javascript
const { ContactSchemas, validateRequest } = require('../middleware/inputValidator');

router.post('/contact', validateRequest(ContactSchemas.create), async (req, res) => {
  // Fully validated and sanitized
});
```

## Testing Validation

### Example: XSS Payload Testing

```javascript
// This would normally fail without sanitization
const maliciousInput = "<img src=x onerror='alert(\"XSS\")'>";
// After sanitization: "" (empty string)

const injection = "'; DROP TABLE users; --";
// After sanitization: "''; DROP TABLE users; --"
```

### Example: Invalid Data Testing

```javascript
// Missing required fields
POST /api/expenses
{
  "amount": 100
  // Missing description, category, type
}
// Response: 400 Validation Error - description is required

// Invalid currency
{
  "description": "Lunch",
  "amount": 50,
  "currency": "INVALID",
  "category": "food",
  "type": "expense"
}
// Response: 400 Validation Error - Invalid currency code

// Invalid amount
{
  "description": "Refund",
  "amount": -50,  // Negative not allowed
  "category": "other",
  "type": "income"
}
// Response: 400 Validation Error - Amount must be greater than 0
```

## Performance Considerations

1. **Validation Overhead**: Minimal (~2-5ms per request)
2. **Caching**: Joi schemas are compiled once at startup
3. **Async Validation**: No I/O operations in validation
4. **Early Rejection**: Invalid data rejected before database operations

## Troubleshooting

### Issue: "Validation failed" but no details

**Solution**: Check that `validateRequest`, `validateQuery`, or `validateParams` middleware is applied before your route handler.

### Issue: Legitimate data being rejected

**Solution**: Review schema constraints, especially:
- String length limits
- Array min/max items
- Numeric ranges
- Allowed enum values

### Issue: Performance degradation

**Solution**: 
- Ensure Joi schemas are defined at module level
- Don't create schemas inside route handlers
- Profile with `console.time()`

## Related Issues

- #338: Enterprise-Grade Audit Trail & TOTP Security Suite
- #324: Security hardening and compliance
- #298: Data integrity and consistency

## Next Steps

1. **Model-Level Validation**: Add pre-save hooks to Mongoose models
2. **Custom Validators**: Add business logic validators
3. **Audit Logging**: Log validation failures for security monitoring
4. **Rate Limiting**: Implement per-endpoint rate limits
5. **Webhook Validation**: Add HMAC validation for incoming webhooks
6. **API Key Validation**: Add API key format validation

## Deployment Checklist

- [ ] All routes updated to use validation middleware
- [ ] Sanitization middleware applied globally in server.js
- [ ] Dependencies installed: joi, xss, express-mongo-sanitize, helmet
- [ ] Environment variables set for security
- [ ] Rate limiting configured
- [ ] CORS policy updated
- [ ] Error messages don't leak sensitive information
- [ ] Logging configured for validation failures
- [ ] Tests pass for validation scenarios
- [ ] Documentation updated for API consumers

## References

- Joi Documentation: https://joi.dev/
- OWASP Input Validation: https://owasp.org/www-community/attacks/xss/
- Express Security Best Practices: https://expressjs.com/en/advanced/best-practice-security.html
- MongoDB Injection Prevention: https://docs.mongodb.com/manual/tutorial/prevent-unauthorized-access/
