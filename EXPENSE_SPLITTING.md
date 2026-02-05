# Collaborative Expense Splitting & Group Settlement System

A comprehensive expense splitting system for managing shared expenses with friends, family, or roommates, including automatic balance calculation and settlement tracking.

## Features

- 👥 **Group Management**: Create and manage expense groups with multiple members
- 💰 **Flexible Splitting**: Support for equal, exact, percentage, and share-based splits
- 📊 **Smart Balances**: Automatic calculation of who owes whom
- 🔄 **Debt Simplification**: Minimize the number of transactions needed to settle debts
- 💳 **Settlement Tracking**: Record and confirm payments between members
- 📱 **Group Invitations**: Invite members via email or shareable links
- 📈 **Activity Feed**: Track all expenses and settlements in real-time
- 📤 **Data Export**: Export group data for record-keeping

## Installation

### Dependencies

All required dependencies are already installed as part of the ExpenseFlow setup.

### Models

The system uses 4 main models:
- **SplitGroup**: Group information and members
- **SplitExpense**: Shared expenses with split details
- **Settlement**: Payment records between members
- **GroupInvite**: Pending member invitations

## API Documentation

### Groups API

#### Create Group
```http
POST /api/groups
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Trip to Goa",
  "description": "Beach vacation expenses",
  "currency": "INR",
  "category": "trip",
  "settings": {
    "simplify_debts": true,
    "require_receipt": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef0",
    "name": "Trip to Goa",
    "description": "Beach vacation expenses",
    "currency": "INR",
    "category": "trip",
    "members": [
      {
        "user": "64a1b2c3d4e5f6789abcdef1",
        "email": "user@example.com",
        "role": "admin",
        "status": "active"
      }
    ],
    "created_by": "64a1b2c3d4e5f6789abcdef1",
    "member_count": 1
  },
  "message": "Group created successfully"
}
```

#### Get User's Groups
```http
GET /api/groups
Authorization: Bearer <token>
```

**Query Parameters:**
- `include_archived`: Include archived groups (default: false)

**Response:**
```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789abcdef0",
      "name": "Trip to Goa",
      "currency": "INR",
      "member_count": 5,
      "pending_invites": 1,
      "is_active": true
    }
  ]
}
```

#### Get Group Details
```http
GET /api/groups/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef0",
    "name": "Trip to Goa",
    "description": "Beach vacation expenses",
    "members": [
      {
        "user": {...},
        "email": "user@example.com",
        "nickname": "John",
        "role": "admin",
        "status": "active",
        "joined_at": "2024-01-01T00:00:00.000Z"
      }
    ],
    "settings": {
      "simplify_debts": true,
      "require_receipt": false
    }
  }
}
```

#### Invite Member
```http
POST /api/groups/:id/invite
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "friend@example.com",
  "message": "Join our trip expense group!",
  "role": "member"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "invite_code": "INV-1234567890-abc123def456",
    "invite_link": "http://localhost:3000/groups/invite/INV-1234567890-abc123def456",
    "email": "friend@example.com",
    "expires_at": "2024-01-08T00:00:00.000Z"
  },
  "message": "Invitation sent successfully"
}
```

#### Accept Invite
```http
POST /api/groups/invite/:code/accept
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "group": {...},
    "member": {...}
  },
  "message": "Invitation accepted successfully"
}
```

#### Remove Member
```http
DELETE /api/groups/:id/members/:email
Authorization: Bearer <token>
```

#### Update Member Role
```http
PUT /api/groups/:id/members/:email/role
Authorization: Bearer <token>
Content-Type: application/json

{
  "role": "admin"
}
```

#### Archive Group
```http
POST /api/groups/:id/archive
Authorization: Bearer <token>
```

### Expenses API

#### Add Expense
```http
POST /api/groups/:id/expenses
Authorization: Bearer <token>
Content-Type: application/json

{
  "description": "Dinner at restaurant",
  "amount": 3000,
  "category": "food",
  "date": "2024-01-15",
  "split_type": "equal",
  "paid_by": "user@example.com",
  "split_with": [
    "friend1@example.com",
    "friend2@example.com"
  ]
}
```

**Split Types:**

1. **Equal Split**:
```json
{
  "split_type": "equal",
  "split_with": ["user1@example.com", "user2@example.com"]
}
```

2. **Exact Split**:
```json
{
  "split_type": "exact",
  "splits": [
    { "email": "user1@example.com", "amount": 1200 },
    { "email": "user2@example.com", "amount": 1800 }
  ]
}
```

3. **Percentage Split**:
```json
{
  "split_type": "percentage",
  "splits": [
    { "email": "user1@example.com", "percentage": 40 },
    { "email": "user2@example.com", "percentage": 60 }
  ]
}
```

4. **Share-based Split**:
```json
{
  "split_type": "shares",
  "splits": [
    { "email": "user1@example.com", "shares": 1 },
    { "email": "user2@example.com", "shares": 2 }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef0",
    "description": "Dinner at restaurant",
    "amount": 3000,
    "paid_by": {
      "user": "64a1b2c3d4e5f6789abcdef1",
      "email": "user@example.com"
    },
    "splits": [
      {
        "email": "user@example.com",
        "amount": 1000
      },
      {
        "email": "friend1@example.com",
        "amount": 1000
      },
      {
        "email": "friend2@example.com",
        "amount": 1000
      }
    ],
    "per_person": 1000
  },
  "message": "Expense added successfully"
}
```

#### Get Group Expenses
```http
GET /api/groups/:id/expenses
Authorization: Bearer <token>
```

**Query Parameters:**
- `start_date`: Filter by start date
- `end_date`: Filter by end date
- `category`: Filter by category
- `paid_by`: Filter by payer user ID

#### Update Expense
```http
PUT /api/groups/:id/expenses/:expenseId
Authorization: Bearer <token>
```

#### Delete Expense
```http
DELETE /api/groups/:id/expenses/:expenseId
Authorization: Bearer <token>
```

### Balances API

#### Get Group Balances
```http
GET /api/groups/:id/balances
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "balances": [
      {
        "user": "64a1b2c3d4e5f6789abcdef1",
        "email": "user@example.com",
        "paid": 5000,
        "owed": 3000,
        "balance": 2000
      },
      {
        "user": "64a1b2c3d4e5f6789abcdef2",
        "email": "friend@example.com",
        "paid": 1000,
        "owed": 3000,
        "balance": -2000
      }
    ],
    "debts": [
      {
        "from": {
          "user": "64a1b2c3d4e5f6789abcdef2",
          "email": "friend@example.com"
        },
        "to": {
          "user": "64a1b2c3d4e5f6789abcdef1",
          "email": "user@example.com"
        },
        "amount": 2000
      }
    ]
  }
}
```

#### Get User Balance
```http
GET /api/groups/:id/balances/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "paid": 5000,
    "owed": 3000,
    "balance": 2000,
    "owes_to": [],
    "owed_by": [
      {
        "email": "friend@example.com",
        "amount": 2000
      }
    ]
  }
}
```

#### Simplify Debts
```http
POST /api/groups/:id/simplify
Authorization: Bearer <token>
```

Uses minimum cash flow algorithm to reduce the number of transactions needed.

**Response:**
```json
{
  "success": true,
  "data": {
    "original_transactions": 6,
    "simplified_transactions": 3,
    "debts": [
      {
        "from": { "email": "user1@example.com" },
        "to": { "email": "user2@example.com" },
        "amount": 1500
      }
    ]
  },
  "message": "Debts simplified successfully"
}
```

### Settlements API

#### Record Settlement
```http
POST /api/groups/:id/settle
Authorization: Bearer <token>
Content-Type: application/json

{
  "to_email": "friend@example.com",
  "amount": 2000,
  "payment_method": "upi",
  "notes": "Paid via Google Pay"
}
```

**Payment Methods:**
- cash
- bank_transfer
- upi
- venmo
- paypal
- zelle
- check
- other

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef0",
    "from_user": {
      "email": "user@example.com"
    },
    "to_user": {
      "email": "friend@example.com"
    },
    "amount": 2000,
    "payment_method": "upi",
    "status": "pending",
    "date": "2024-01-15T00:00:00.000Z"
  },
  "message": "Settlement recorded successfully"
}
```

#### Get Group Settlements
```http
GET /api/groups/:id/settlements
Authorization: Bearer <token>
```

**Query Parameters:**
- `status`: pending | confirmed | rejected | cancelled
- `start_date`: Filter by start date
- `end_date`: Filter by end date

#### Confirm Settlement
```http
POST /api/groups/:id/settlements/:settlementId/confirm
Authorization: Bearer <token>
```

Only the receiving user can confirm a settlement.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "confirmed",
    "confirmed_at": "2024-01-15T12:00:00.000Z",
    "confirmation_code": "SET-abc123-DEF456"
  },
  "message": "Settlement confirmed successfully"
}
```

#### Reject Settlement
```http
POST /api/groups/:id/settlements/:settlementId/reject
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Amount is incorrect"
}
```

#### Cancel Settlement
```http
POST /api/groups/:id/settlements/:settlementId/cancel
Authorization: Bearer <token>
```

### Activity API

#### Get Group Activity Feed
```http
GET /api/groups/:id/activity
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit`: Number of activities to return (default: 50)
- `offset`: Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "count": 25,
  "data": [
    {
      "type": "expense",
      "data": {
        "description": "Dinner",
        "amount": 3000,
        "paid_by": {...}
      },
      "timestamp": "2024-01-15T18:00:00.000Z"
    },
    {
      "type": "settlement",
      "data": {
        "from_user": {...},
        "to_user": {...},
        "amount": 2000,
        "status": "confirmed"
      },
      "timestamp": "2024-01-15T12:00:00.000Z"
    }
  ]
}
```

### Statistics API

#### Get Group Statistics
```http
GET /api/groups/:id/stats
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_expenses": 15000,
    "expense_count": 12,
    "total_settled": 8000,
    "settlement_count": 5,
    "outstanding_balance": 7000,
    "pending_settlements": 3,
    "member_count": 5,
    "spending_by_category": [
      { "category": "food", "total": 6000, "count": 5 },
      { "category": "transport", "total": 4000, "count": 3 }
    ]
  }
}
```

## Usage Examples

### 1. Create a Group and Invite Members

```javascript
// Create group
const groupResponse = await fetch('/api/groups', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Roommates',
    description: 'Apartment expenses',
    currency: 'INR',
    category: 'home'
  })
});

const { data: group } = await groupResponse.json();

// Invite member
const inviteResponse = await fetch(`/api/groups/${group._id}/invite`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'roommate@example.com',
    message: 'Join our apartment expense group'
  })
});

const { data: invite } = await inviteResponse.json();
console.log('Share this link:', invite.invite_link);
```

### 2. Add an Expense with Equal Split

```javascript
const response = await fetch(`/api/groups/${groupId}/expenses`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    description: 'Groceries',
    amount: 2400,
    category: 'food',
    split_type: 'equal',
    paid_by: 'user@example.com',
    split_with: [
      'user@example.com',
      'roommate1@example.com',
      'roommate2@example.com'
    ]
  })
});

const { data: expense } = await response.json();
console.log('Per person:', expense.per_person); // 800
```

### 3. Check Balances and Settle

```javascript
// Get balances
const balanceResponse = await fetch(`/api/groups/${groupId}/balances`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: balanceData } = await balanceResponse.json();
console.log('Debts:', balanceData.debts);

// Record settlement
const settleResponse = await fetch(`/api/groups/${groupId}/settle`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    to_email: 'roommate@example.com',
    amount: 800,
    payment_method: 'upi',
    notes: 'My share of groceries'
  })
});

const { data: settlement } = await settleResponse.json();
```

### 4. Simplify Group Debts

```javascript
const response = await fetch(`/api/groups/${groupId}/simplify`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data } = await response.json();
console.log(`Reduced from ${data.original_transactions} to ${data.simplified_transactions} transactions`);
console.log('Simplified debts:', data.debts);
```

## Split Type Guide

### Equal Split
Best for: Restaurant bills, shared groceries
- Divides expense equally among all participants
- Automatically handles rounding

### Exact Split
Best for: When people ordered different amounts
- Specify exact amount for each person
- Total must equal expense amount

### Percentage Split
Best for: Proportional sharing (e.g., based on income)
- Each person pays a percentage
- Percentages must add up to 100%

### Share-based Split
Best for: When people consumed different quantities
- Distribute based on shares/units
- Example: 2 people ate 1 pizza each, 1 person ate 2 pizzas

## Debt Simplification Algorithm

The system uses a minimum cash flow algorithm to reduce transactions:

**Before Simplification:**
- A owes B: ₹500
- B owes C: ₹500
- A owes C: ₹300

**After Simplification:**
- A owes C: ₹800
- (2 transactions reduced to 1)

This is automatically applied when `simplify_debts` setting is enabled.

## Group Categories

- **trip**: Travel and vacation expenses
- **home**: Household and roommate expenses
- **couple**: Shared expenses between partners
- **friends**: Social expenses
- **project**: Project or event expenses
- **event**: Event planning expenses
- **other**: General shared expenses

## Settlement Status Flow

```
pending → confirmed (by receiver)
        → rejected (by receiver)
        → cancelled (by creator)
```

## Best Practices

1. **Always Add Receipts**: Attach receipts to expenses for transparency
2. **Settle Regularly**: Don't let balances accumulate too much
3. **Use Categories**: Categorize expenses for better insights
4. **Enable Debt Simplification**: Reduce the number of transactions
5. **Confirm Settlements**: Always confirm received payments
6. **Regular Reviews**: Check activity feed weekly
7. **Export Data**: Export group data periodically for records

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad request / validation error
- `401`: Unauthorized
- `403`: Forbidden / access denied
- `404`: Not found
- `500`: Server error

## Permissions

- **Admin**: Can add/remove members, modify settings, delete expenses
- **Member**: Can add expenses, record settlements, view balances

Group creators are automatically admins. Groups must have at least one admin.

## Security

- JWT authentication required for all endpoints
- Users can only access groups they're members of
- Settlements require confirmation from receiving user
- Email-based member identification
- Invite links expire after 7 days

## Testing

Test the API using cURL:

```bash
# Create a group
curl -X POST http://localhost:3000/api/groups \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Group",
    "currency": "INR"
  }'

# Add expense
curl -X POST http://localhost:3000/api/groups/GROUP_ID/expenses \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Lunch",
    "amount": 600,
    "split_type": "equal",
    "paid_by": "user@example.com",
    "split_with": ["user@example.com", "friend@example.com"]
  }'

# Get balances
curl http://localhost:3000/api/groups/GROUP_ID/balances \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Troubleshooting

### Splits Don't Add Up
Ensure split amounts/percentages/shares total correctly:
- Exact: amounts must equal total
- Percentage: percentages must equal 100%
- Shares: system calculates automatically

### Can't Remove Member
- Check if member is the last admin
- Check if member has outstanding debts

### Settlement Not Confirmed
- Only the receiving user can confirm
- Check settlement status is 'pending'

## License

MIT License - see LICENSE file for details
