# Real-Time Bank Sync & Transaction Reconciliation Engine

A comprehensive bank account synchronization system with automatic transaction import, intelligent reconciliation, duplicate detection, and real-time balance updates using Open Banking APIs.

## Overview

The Bank Sync & Reconciliation Engine enables automatic syncing of bank transactions with ExpenseFlow, intelligent matching of imported transactions to manual expenses, and automated expense creation from bank data. It supports multiple banking APIs (Plaid, Yodlee, TrueLayer) and provides enterprise-grade reconciliation capabilities.

## Key Features

- 🏦 **Multi-Bank Support**: Connect to 1000+ financial institutions via Plaid, Yodlee, TrueLayer, or custom APIs
- 🔄 **Real-Time Sync**: Automatic or scheduled synchronization of transactions and balances
- 🤖 **Intelligent Reconciliation**: ML-powered matching of bank transactions to manual expenses
- 💰 **Auto Expense Creation**: Automatically create expenses from confirmed transactions
- 🔐 **Secure Token Storage**: Encrypted storage of authentication tokens and API credentials
- 📊 **Smart Rules Engine**: Define custom reconciliation rules with flexible conditions and actions
- 🔍 **Duplicate Detection**: Identify and handle duplicate transactions automatically
- 📝 **Manual Corrections**: Override OCR or reconciliation with correction tracking
- 📈 **Real-Time Balances**: Track account balances and balance changes
- 🎯 **Confidence Scoring**: AI-powered confidence scores for reconciliation matches
- 📋 **Sync Logging**: Detailed logs of all sync operations with metrics and performance data
- 🔔 **Consent Management**: Track and renew bank API consent automatically

## Architecture

### Components

1. **BankInstitution** - Bank and API provider information
2. **BankLink** - User's connection to a specific bank
3. **ImportedTransaction** - Bank transaction data
4. **ReconciliationRule** - Rules for automatic matching
5. **SyncLog** - Detailed sync history and metrics

## Models

### BankInstitution Model

Represents a financial institution and its API provider configuration:

```javascript
{
  name: 'Chase Bank',
  code: 'CHASE_US',
  logo: 'https://...',
  country: 'US',
  currency: 'USD',
  apiProvider: 'plaid', // plaid, yodlee, truelayer, custom
  supportedFeatures: {
    accounts: true,
    transactions: true,
    balances: true,
    investment_accounts: false,
    recurring_transactions: false
  },
  supportedAccountTypes: ['checking', 'savings', 'credit'],
  status: 'active',
  lastHealthCheck: '2024-01-15T10:30:00Z',
  healthStatus: 'healthy',
  transactionHistoryDepth: 90 // days
}
```

### BankLink Model

User's authenticated connection to a bank:

```javascript
{
  user: ObjectId,
  institution: ObjectId,
  displayName: 'Chase Checking',
  accessToken: 'encrypted_token',
  refreshToken: 'encrypted_token',
  consentExpiry: '2025-01-15T00:00:00Z',
  accounts: [
    {
      accountId: 'account_123',
      name: 'Checking Account',
      type: 'checking',
      currency: 'USD',
      balance: {
        current: 5000,
        available: 4500,
        limit: null
      },
      mask: '1234',
      status: 'active'
    }
  ],
  status: 'active',
  lastSync: '2024-01-15T10:30:00Z',
  autoSync: true,
  syncFrequency: 3600 // seconds
}
```

### ImportedTransaction Model

Bank transaction data with reconciliation tracking:

```javascript
{
  user: ObjectId,
  bankLink: ObjectId,
  externalId: 'bank_txn_123',
  amount: 45.99,
  date: '2024-01-15T00:00:00Z',
  description: 'STARBUCKS COFFEE #1234',
  merchantName: 'Starbucks Coffee',
  category: 'food',
  direction: 'out',
  reconciliationStatus: 'pending', // pending, matched, created, ignored, conflict
  matchedExpenseId: ObjectId,
  matchConfidence: 0.92
}
```

### ReconciliationRule Model

Automation rules for transaction matching:

```javascript
{
  user: ObjectId,
  name: 'Auto-match Starbucks',
  enabled: true,
  conditions: {
    merchantPattern: 'starbucks|coffee|cafe',
    amountRange: { min: 0, max: 100 },
    direction: 'out'
  },
  action: {
    type: 'auto_create', // auto_match, auto_create, ignore, flag
    createAsExpense: true
  },
  categoryOverride: 'food',
  priority: 10
}
```

### SyncLog Model

Detailed record of each sync operation:

```javascript
{
  bankLink: ObjectId,
  user: ObjectId,
  startedAt: '2024-01-15T10:30:00Z',
  completedAt: '2024-01-15T10:35:00Z',
  duration: 300000, // milliseconds
  status: 'success',
  syncType: 'incremental',
  transactionsImported: 50,
  transactionsMatched: 35,
  expensesCreated: 10,
  errors: [],
  metrics: {
    apiCallTime: 5000,
    processingTime: 3000,
    databaseTime: 2000
  }
}
```

## API Reference

### Bank Link Management

#### Connect Bank Account
```http
POST /api/bank-links/connect
Authorization: Bearer <token>
Content-Type: application/json

{
  "institutionId": "64a1b2c3d4e5f6789abcdef0",
  "displayName": "My Chase Account",
  "publicToken": "plaid_public_token_...",
  "autoSync": true,
  "syncFrequency": 3600
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef0",
    "institution": { "name": "Chase Bank", "code": "CHASE_US" },
    "displayName": "My Chase Account",
    "accounts": [
      {
        "accountId": "account_123",
        "name": "Checking Account",
        "balance": 5000
      }
    ],
    "status": "active",
    "consentExpiry": "2025-01-15"
  }
}
```

#### Get User's Bank Links
```http
GET /api/bank-links
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789abcdef0",
      "displayName": "Chase Checking",
      "institution": { "name": "Chase Bank" },
      "status": "active",
      "lastSync": "2024-01-15T10:35:00Z",
      "accounts": [...]
    }
  ]
}
```

#### Get Bank Link Details
```http
GET /api/bank-links/:id
Authorization: Bearer <token>
```

#### Update Bank Link Settings
```http
PUT /api/bank-links/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "displayName": "Updated Name",
  "autoSync": true,
  "syncFrequency": 7200,
  "autoCreateExpenses": false
}
```

#### Disconnect Bank Account
```http
DELETE /api/bank-links/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "revokeConsent": true,
  "reason": "No longer needed"
}
```

#### Renew Bank Consent
```http
POST /api/bank-links/:id/renew-consent
Authorization: Bearer <token>
Content-Type: application/json

{
  "publicToken": "plaid_public_token_...",
  "linkToken": "link_token_..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "consentExpiry": "2025-01-15T00:00:00Z",
    "consentExpiryWarned": false
  }
}
```

### Transaction Management

#### Get Imported Transactions
```http
GET /api/transactions/imported
Authorization: Bearer <token>
```

**Query Parameters:**
- `status`: pending | matched | created | ignored | conflict
- `bankLink`: Filter by bank link ID
- `start_date`: Start date (ISO 8601)
- `end_date`: End date (ISO 8601)
- `merchant`: Merchant name filter
- `min_amount`: Minimum amount
- `max_amount`: Maximum amount
- `category`: Transaction category
- `limit`: Results per page (default: 50)
- `offset`: Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "count": 25,
  "total": 100,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789abcdef0",
      "amount": 45.99,
      "date": "2024-01-15T00:00:00Z",
      "merchantName": "Starbucks Coffee",
      "category": "food",
      "direction": "out",
      "reconciliationStatus": "pending",
      "reconciliationConfidence": 0
    }
  ]
}
```

#### Get Transaction Details
```http
GET /api/transactions/imported/:id
Authorization: Bearer <token>
```

#### Manual Reconciliation

##### Match Transaction to Expense
```http
POST /api/transactions/imported/:id/match
Authorization: Bearer <token>
Content-Type: application/json

{
  "expenseId": "64a1b2c3d4e5f6789abcdef0",
  "confidence": 0.95,
  "notes": "Manual match - confirmed by user"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef0",
    "reconciliationStatus": "matched",
    "matchedExpenseId": "64a1b2c3d4e5f6789abcdef0",
    "reconciliationConfidence": 0.95
  }
}
```

##### Create Expense from Transaction
```http
POST /api/transactions/imported/:id/create-expense
Authorization: Bearer <token>
Content-Type: application/json

{
  "notes": "Imported from bank sync"
}
```

##### Ignore Transaction
```http
POST /api/transactions/imported/:id/ignore
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Transfer between own accounts",
  "notes": "Internal transfer"
}
```

#### Bulk Operations
```http
POST /api/transactions/imported/bulk-action
Authorization: Bearer <token>
Content-Type: application/json

{
  "action": "create_expenses", // create_expenses, match, ignore, flag
  "transactionIds": ["id1", "id2", "id3"],
  "options": {
    "categoryOverride": "food",
    "autoMatch": true,
    "minConfidence": 0.85
  }
}
```

### Reconciliation Rules

#### Create Rule
```http
POST /api/reconciliation-rules
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Auto-match Gas Stations",
  "enabled": true,
  "conditions": {
    "merchantPattern": "shell|exxon|chevron|bp",
    "amountRange": { "min": 20, "max": 150 },
    "direction": "out"
  },
  "action": {
    "type": "auto_match",
    "matchCriteria": {
      "minConfidence": 0.85,
      "searchRadius": 1
    }
  },
  "categoryOverride": "transport",
  "priority": 20
}
```

#### Get User's Rules
```http
GET /api/reconciliation-rules
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789abcdef0",
      "name": "Auto-match Starbucks",
      "enabled": true,
      "priority": 10,
      "stats": {
        "totalMatches": 45,
        "successCount": 42,
        "failureCount": 3
      }
    }
  ]
}
```

#### Update Rule
```http
PUT /api/reconciliation-rules/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "enabled": false,
  "priority": 15,
  "conditions": { ... }
}
```

#### Delete Rule
```http
DELETE /api/reconciliation-rules/:id
Authorization: Bearer <token>
```

#### Test Rule
```http
POST /api/reconciliation-rules/:id/test
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "matchCount": 12,
    "transactionsMatched": [
      {
        "transactionId": "64a1b2c3d4e5f6789abcdef0",
        "merchantName": "Starbucks Coffee #1234",
        "amount": 5.45
      }
    ]
  }
}
```

### Sync Management

#### Trigger Sync
```http
POST /api/bank-links/:id/sync
Authorization: Bearer <token>
Content-Type: application/json

{
  "syncType": "incremental", // full, incremental
  "accounts": ["all"], // or specific account IDs
  "reconcile": true,
  "createExpenses": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "syncLogId": "64a1b2c3d4e5f6789abcdef0",
    "status": "in_progress",
    "startedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### Get Sync Status
```http
GET /api/bank-links/:id/sync-status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "currentSync": {
      "status": "in_progress",
      "startedAt": "2024-01-15T10:30:00Z",
      "progress": 65,
      "message": "Processing transactions..."
    },
    "lastSync": {
      "status": "success",
      "completedAt": "2024-01-15T09:30:00Z",
      "transactionsImported": 45,
      "transactionsMatched": 30
    },
    "nextScheduledSync": "2024-01-15T11:30:00Z"
  }
}
```

#### Get Sync History
```http
GET /api/bank-links/:id/sync-history
Authorization: Bearer <token>

?limit=20&offset=0
```

**Response:**
```json
{
  "success": true,
  "count": 100,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789abcdef0",
      "status": "success",
      "completedAt": "2024-01-15T10:35:00Z",
      "duration": 300000,
      "transactionsImported": 50,
      "transactionsMatched": 35,
      "expensesCreated": 10
    }
  ]
}
```

#### Get Sync Statistics
```http
GET /api/bank-links/:id/sync-stats
Authorization: Bearer <token>

?days=30
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "30 days",
    "totalSyncs": 30,
    "successfulSyncs": 28,
    "failedSyncs": 2,
    "totalTransactionsImported": 1250,
    "totalTransactionsMatched": 950,
    "averageSyncDuration": "5 minutes",
    "successRate": "93.3%",
    "matchRate": "76%"
  }
}
```

#### Get Detailed Sync Log
```http
GET /api/sync-logs/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef0",
    "bankLink": "...",
    "status": "success",
    "startedAt": "2024-01-15T10:30:00Z",
    "completedAt": "2024-01-15T10:35:00Z",
    "duration": 300000,
    "transactionsImported": 50,
    "transactionsProcessed": 50,
    "transactionsFailed": 0,
    "transactionsMatched": 35,
    "expensesCreated": 10,
    "accountsSynced": [
      {
        "accountId": "account_123",
        "status": "synced",
        "transactionsImported": 50
      }
    ],
    "errors": [],
    "metrics": {
      "apiCallTime": 5000,
      "processingTime": 3000,
      "databaseTime": 2000,
      "totalTime": 10000
    }
  }
}
```

### Institutional Data

#### Get Available Banks
```http
GET /api/banks
Authorization: Bearer <token>
```

**Query Parameters:**
- `country`: Filter by country code
- `provider`: Filter by API provider (plaid, yodlee, etc.)
- `feature`: Filter by feature (transactions, balances, etc.)

**Response:**
```json
{
  "success": true,
  "count": 1000,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789abcdef0",
      "name": "Chase Bank",
      "code": "CHASE_US",
      "logo": "https://...",
      "country": "US",
      "apiProvider": "plaid",
      "supportedFeatures": ["accounts", "transactions", "balances"],
      "status": "active"
    }
  ]
}
```

#### Get Bank Details
```http
GET /api/banks/:code
Authorization: Bearer <token>
```

## Usage Examples

### 1. Connect a Bank Account

```javascript
// Step 1: Get available banks for user's country
const banksResponse = await fetch('/api/banks?country=US', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: banks } = await banksResponse.json();
console.log('Available banks:', banks);

// Step 2: User selects a bank and completes Plaid link flow
// Plaid returns a publicToken

const connectResponse = await fetch('/api/bank-links/connect', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    institutionId: banks[0]._id,
    displayName: 'My Chase Checking',
    publicToken: 'public-prod-...',
    autoSync: true,
    syncFrequency: 3600
  })
});

const { data: bankLink } = await connectResponse.json();
console.log('Connected to:', bankLink.displayName);
console.log('Accounts:', bankLink.accounts);
```

### 2. Set Up Automatic Reconciliation Rules

```javascript
// Create a rule for automatic Starbucks matching
const ruleResponse = await fetch('/api/reconciliation-rules', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Auto-match Coffee Shops',
    enabled: true,
    conditions: {
      merchantPattern: 'starbucks|coffee|cafe|dunkin',
      amountRange: { min: 2, max: 20 },
      direction: 'out',
      dayOfWeek: [1, 2, 3, 4, 5] // Weekdays only
    },
    action: {
      type: 'auto_create',
      createAsExpense: true
    },
    categoryOverride: 'food',
    priority: 10
  })
});

console.log('Rule created:', ruleResponse.data.name);
```

### 3. Monitor and View Transactions

```javascript
// Get pending transactions that need reconciliation
const pendingResponse = await fetch('/api/transactions/imported?status=pending', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: pending } = await pendingResponse.json();
console.log(`Found ${pending.length} pending transactions`);

pending.forEach(txn => {
  console.log(`${txn.date} | ${txn.merchantName} | ${txn.amount}`);
});

// Manually match a specific transaction
const matchResponse = await fetch(
  `/api/transactions/imported/${pending[0]._id}/match`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      expenseId: 'existing_expense_id',
      confidence: 0.95,
      notes: 'Confirmed by user'
    })
  }
);

console.log('Transaction matched successfully');
```

### 4. Schedule and Monitor Syncs

```javascript
// Trigger a manual sync
const syncResponse = await fetch('/api/bank-links/link_id/sync', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    syncType: 'incremental',
    reconcile: true,
    createExpenses: true
  })
});

const { data } = await syncResponse.json();
const syncLogId = data.syncLogId;

// Poll for completion
const checkSync = async () => {
  const statusResponse = await fetch(`/api/bank-links/link_id/sync-status`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const status = await statusResponse.json();
  
  if (status.data.currentSync.status === 'in_progress') {
    console.log(`Progress: ${status.data.currentSync.progress}%`);
    setTimeout(checkSync, 2000);
  } else {
    console.log('Sync completed');
    console.log(`Transactions imported: ${status.data.lastSync.transactionsImported}`);
    console.log(`Transactions matched: ${status.data.lastSync.transactionsMatched}`);
  }
};

checkSync();
```

### 5. Analyze Sync Performance

```javascript
// Get 30-day sync statistics
const statsResponse = await fetch('/api/bank-links/link_id/sync-stats?days=30', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const stats = await statsResponse.json();
console.log('Sync Statistics (Last 30 days):');
console.log(`Total syncs: ${stats.data.totalSyncs}`);
console.log(`Success rate: ${stats.data.successRate}`);
console.log(`Avg sync duration: ${stats.data.averageSyncDuration}`);
console.log(`Transactions imported: ${stats.data.totalTransactionsImported}`);
console.log(`Match rate: ${stats.data.matchRate}`);
```

## Security Features

### Token Encryption
- Access tokens and refresh tokens are encrypted with AES-256-GCM
- Encryption key stored in environment variables
- Tokens never logged or exposed in APIs

### API Key Management
- Bank API credentials stored securely
- Support for OAuth2 and API key authentication
- Automatic token refresh handling

### Consent Management
- Tracks when bank consent expires
- Automatic reminders for consent renewal
- Easy consent revocation

### Data Privacy
- Imported transactions associated with user only
- No cross-user data visibility
- Encrypted storage of sensitive fields

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

**Common Error Codes:**
- `BANK_SYNC_FAILED`: Bank API returned error
- `INVALID_TOKEN`: Bank connection token expired or invalid
- `CONSENT_EXPIRED`: Bank consent needs renewal
- `DUPLICATE_LINK`: Bank account already linked
- `SYNC_IN_PROGRESS`: Another sync already running
- `RECONCILIATION_CONFLICT`: Transaction matches multiple expenses
- `RULE_INVALID`: Rule conditions are invalid

## Performance

- **Sync Duration**: Typically 30-60 seconds for incremental syncs
- **Transaction Processing**: ~10ms per transaction
- **Reconciliation**: ~50ms per match attempt
- **Database Queries**: All indexed for <100ms response time

## Limitations

- Maximum 25 bank links per user
- Maximum 10,000 transactions per sync
- Consent valid for 1 year, then requires renewal
- Transaction history available for 90 days
- API rate limits vary by provider (documented in SyncLog)

## Future Enhancements

- Credit score integration
- Investment account support
- Bill payment automation
- Cash flow forecasting
- Anomaly detection
- Mobile push notifications
- Webhooks for real-time updates
- Multi-currency support
- P2P payment integration

## License

MIT License - see LICENSE file for details
