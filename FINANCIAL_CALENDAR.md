# Financial Calendar & Smart Bill Reminders

A comprehensive bill tracking and smart reminder system for ExpenseFlow. Track recurring bills, subscriptions, and payments with intelligent reminders and calendar integration.

## Features

- 📅 **Bill Tracking**: Track recurring bills with flexible frequencies (once, weekly, biweekly, monthly, quarterly, yearly)
- 🔔 **Smart Reminders**: Multi-channel notifications (email, push, SMS, in-app) with customizable timing
- 💳 **Auto-Pay Integration**: Configure automatic payments for bills
- 📊 **Calendar View**: Unified financial calendar with all bills, payments, and events
- ⏰ **Overdue Alerts**: Automatic detection and notification of overdue bills
- 📈 **Payment History**: Track payment records with confirmation numbers
- 🎯 **Bill Categories**: Organize bills by category (utilities, subscriptions, rent, insurance, etc.)

## Installation

### 1. Install Dependencies

```bash
npm install node-cron
```

### 2. Database Models

The system uses 4 Mongoose models:
- **Bill**: Bill tracking with frequency and reminders
- **BillPayment**: Payment records
- **CalendarEvent**: Financial calendar events
- **ReminderSchedule**: Notification scheduling

All models are auto-created when the server starts.

### 3. Environment Variables

No additional environment variables required. Uses existing email service configuration.

## API Documentation

### Bills API

#### Create Bill
```http
POST /api/bills
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Netflix Subscription",
  "amount": 799,
  "currency": "INR",
  "due_date": "2024-01-15",
  "frequency": "monthly",
  "category": "subscriptions",
  "payee": "Netflix Inc.",
  "account": "64a1b2c3d4e5f6789abcdef0",
  "auto_pay": {
    "enabled": true,
    "account": "64a1b2c3d4e5f6789abcdef0"
  },
  "reminder_days": [7, 3, 1],
  "notifications": {
    "email": true,
    "push": true,
    "sms": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef0",
    "name": "Netflix Subscription",
    "amount": 799,
    "currency": "INR",
    "due_date": "2024-01-15T00:00:00.000Z",
    "frequency": "monthly",
    "category": "subscriptions",
    "status": "active",
    "next_due_date": "2024-01-15T00:00:00.000Z",
    "is_recurring": true,
    "createdAt": "2024-01-01T12:00:00.000Z"
  },
  "message": "Bill created successfully"
}
```

#### Get All Bills
```http
GET /api/bills?status=active&category=utilities
Authorization: Bearer <token>
```

**Query Parameters:**
- `status`: active | paid | overdue | cancelled | paused
- `category`: utilities | subscriptions | rent | insurance | loan | credit_card | other
- `frequency`: once | weekly | biweekly | monthly | quarterly | yearly
- `auto_pay`: true | false

**Response:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789abcdef0",
      "name": "Electricity Bill",
      "amount": 2500,
      "currency": "INR",
      "next_due_date": "2024-01-20T00:00:00.000Z",
      "status": "active",
      "days_until_due": 15
    }
  ]
}
```

#### Get Upcoming Bills
```http
GET /api/bills/upcoming?days=30
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "days": 30,
  "data": [
    {
      "name": "Netflix Subscription",
      "amount": 799,
      "next_due_date": "2024-01-15T00:00:00.000Z",
      "days_until_due": 10
    }
  ]
}
```

#### Get Overdue Bills
```http
GET /api/bills/overdue
Authorization: Bearer <token>
```

#### Get Bills Due Today
```http
GET /api/bills/today
Authorization: Bearer <token>
```

#### Get Bill Statistics
```http
GET /api/bills/stats
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_bills": 12,
    "active_bills": 10,
    "overdue_bills": 2,
    "paid_bills": 8,
    "monthly_total": 15000,
    "by_category": [
      { "category": "utilities", "count": 4, "total_amount": 8000 },
      { "category": "subscriptions", "count": 3, "total_amount": 2500 }
    ]
  }
}
```

#### Record Payment
```http
POST /api/bills/:id/pay
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 2500,
  "paid_date": "2024-01-15",
  "payment_method": "credit_card",
  "confirmation_number": "CONF123456",
  "transaction_id": "TXN789012",
  "notes": "Paid on time"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "bill": {
      "status": "paid",
      "last_paid": "2024-01-15T00:00:00.000Z",
      "next_due_date": "2024-02-15T00:00:00.000Z"
    },
    "payment": {
      "_id": "64a1b2c3d4e5f6789abcdef1",
      "amount": 2500,
      "payment_method": "credit_card",
      "confirmation_number": "CONF123456"
    }
  },
  "message": "Payment recorded successfully"
}
```

#### Update Bill
```http
PUT /api/bills/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 850,
  "reminder_days": [7, 3, 1, 0]
}
```

#### Delete Bill
```http
DELETE /api/bills/:id
Authorization: Bearer <token>
```

#### Skip Bill Payment
```http
POST /api/bills/:id/skip
Authorization: Bearer <token>
```

Skips the next payment and calculates the new due date.

#### Pause Bill
```http
POST /api/bills/:id/pause
Authorization: Bearer <token>
```

Pauses recurring bill and cancels pending reminders.

#### Resume Bill
```http
POST /api/bills/:id/resume
Authorization: Bearer <token>
```

Resumes paused bill and recreates reminders.

#### Get Payment History
```http
GET /api/bills/:id/payments
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "_id": "64a1b2c3d4e5f6789abcdef1",
        "amount": 799,
        "paid_date": "2024-01-15T00:00:00.000Z",
        "payment_method": "credit_card",
        "confirmation_number": "CONF123456"
      }
    ],
    "stats": {
      "total_paid": 5,
      "total_amount": 3995,
      "average_amount": 799,
      "on_time_percentage": 100
    }
  }
}
```

### Calendar API

#### Get Calendar Events
```http
GET /api/calendar?start_date=2024-01-01&end_date=2024-01-31&type=bill_due
Authorization: Bearer <token>
```

**Query Parameters:**
- `start_date`: Start date (required)
- `end_date`: End date (required)
- `type`: bill_due | bill_overdue | payment_scheduled | payment_completed | goal_deadline | custom
- `status`: scheduled | completed | cancelled

**Response:**
```json
{
  "success": true,
  "count": 15,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789abcdef0",
      "type": "bill_due",
      "title": "Netflix Subscription Due",
      "date": "2024-01-15T00:00:00.000Z",
      "color": "#e74c3c",
      "priority": "medium",
      "metadata": {
        "bill_name": "Netflix Subscription",
        "amount": 799
      }
    }
  ]
}
```

#### Get Month Events
```http
GET /api/calendar/month/2024/1
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "year": 2024,
    "month": 1,
    "total_events": 15,
    "events": [...],
    "events_by_date": {
      "2024-01-15": [
        { "type": "bill_due", "title": "Netflix Subscription Due" }
      ]
    }
  }
}
```

#### Get Today's Events
```http
GET /api/calendar/today
Authorization: Bearer <token>
```

#### Get Upcoming Events
```http
GET /api/calendar/upcoming?days=7
Authorization: Bearer <token>
```

#### Get Calendar Summary
```http
GET /api/calendar/summary
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "today_events": 2,
    "upcoming_events": 5,
    "overdue_count": 1,
    "scheduled_count": 8,
    "by_type": {
      "bill_due": 5,
      "payment_scheduled": 2,
      "goal_deadline": 1
    }
  }
}
```

#### Create Custom Event
```http
POST /api/calendar/events
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Quarterly Tax Payment",
  "description": "Q1 2024 estimated tax payment",
  "date": "2024-03-15",
  "color": "#3498db",
  "priority": "high",
  "reminders": [
    {
      "days_before": 7,
      "methods": ["email", "push"]
    }
  ]
}
```

#### Update Event
```http
PUT /api/calendar/events/:id
Authorization: Bearer <token>
```

#### Delete Event
```http
DELETE /api/calendar/events/:id
Authorization: Bearer <token>
```

#### Sync Calendar
```http
POST /api/calendar/sync
Authorization: Bearer <token>
```

Syncs all bill events with calendar.

### Reminders API

#### Get All Reminders
```http
GET /api/reminders?status=pending&type=bill_due
Authorization: Bearer <token>
```

#### Get Pending Reminders
```http
GET /api/reminders/pending
Authorization: Bearer <token>
```

#### Get Reminder Settings
```http
GET /api/reminders/settings
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "email": true,
    "push": true,
    "sms": false,
    "in_app": true,
    "default_reminder_days": [7, 3, 1]
  }
}
```

#### Update Reminder Settings
```http
PUT /api/reminders/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": true,
  "push": true,
  "sms": false,
  "default_reminder_days": [7, 3, 1, 0]
}
```

#### Cancel Reminder
```http
POST /api/reminders/:id/cancel
Authorization: Bearer <token>
```

#### Retry Failed Reminder
```http
POST /api/reminders/:id/retry
Authorization: Bearer <token>
```

## Usage Examples

### 1. Creating a Recurring Bill

```javascript
const response = await fetch('/api/bills', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Internet Bill',
    amount: 1299,
    currency: 'INR',
    due_date: '2024-01-20',
    frequency: 'monthly',
    category: 'utilities',
    payee: 'Airtel',
    reminder_days: [5, 2, 0],
    notifications: {
      email: true,
      push: true
    }
  })
});

const data = await response.json();
console.log(data.data); // Created bill
```

### 2. Recording a Payment

```javascript
const response = await fetch(`/api/bills/${billId}/pay`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: 1299,
    payment_method: 'upi',
    confirmation_number: 'UPI123456789'
  })
});

const data = await response.json();
console.log(data.data.payment); // Payment record
```

### 3. Getting Month Calendar View

```javascript
const response = await fetch('/api/calendar/month/2024/1', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
console.log(data.data.events_by_date); // Events grouped by date
```

### 4. Checking Overdue Bills

```javascript
const response = await fetch('/api/bills/overdue', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
console.log(data.data); // List of overdue bills
```

## Automated Tasks (Cron Jobs)

The system automatically performs these tasks:

### Daily Tasks

- **9:00 AM**: Process bill reminders
  - Sends reminders for upcoming bills based on reminder_days configuration
  
- **6:00 AM**: Process auto-pay bills
  - Automatically pays bills with auto_pay enabled
  
- **12:00 AM**: Check overdue bills
  - Updates bill status to 'overdue'
  - Creates overdue reminders
  
- **6:00 AM**: Sync calendar events
  - Updates calendar with latest bill information

### Hourly Tasks

- **Every hour**: Process pending reminders
  - Sends pending reminders via configured channels

## Bill Frequencies

- **once**: One-time bill
- **weekly**: Every 7 days
- **biweekly**: Every 14 days
- **monthly**: Same day each month
- **quarterly**: Every 3 months
- **yearly**: Same date each year

## Payment Methods

- bank_transfer
- credit_card
- debit_card
- cash
- check
- auto_pay
- upi
- paypal
- other

## Bill Categories

- utilities (electricity, water, gas)
- subscriptions (streaming, software, memberships)
- rent
- insurance (health, car, life)
- loan (personal, home, auto)
- credit_card
- other

## Event Types

- **bill_due**: Bill payment is due
- **bill_overdue**: Bill payment is overdue
- **payment_scheduled**: Payment is scheduled
- **payment_completed**: Payment was completed
- **goal_deadline**: Financial goal deadline
- **custom**: User-created event

## Reminder Channels

- **email**: Email notifications via nodemailer
- **push**: Push notifications via Socket.IO
- **sms**: SMS notifications (requires third-party service)
- **in_app**: In-app notifications via Socket.IO

## Error Handling

All API endpoints return consistent error responses:

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
- `404`: Not found
- `500`: Server error

## Best Practices

1. **Set Multiple Reminders**: Use reminder_days like [7, 3, 1, 0] for critical bills
2. **Enable Auto-Pay**: For fixed-amount bills to avoid late payments
3. **Regular Sync**: Call /api/calendar/sync monthly to ensure calendar is up-to-date
4. **Payment Confirmation**: Always include confirmation_number when recording payments
5. **Categorize Bills**: Use proper categories for better analytics
6. **Review Overdue**: Check /api/bills/overdue daily
7. **Update Bill Amounts**: Update variable bills (like utilities) when amount changes

## Security

- All endpoints require JWT authentication
- Bills can only be accessed by their owner
- Payment data is encrypted at rest
- Rate limiting applied to all endpoints
- Input validation on all fields

## Testing

Test the API endpoints using cURL:

```bash
# Create a bill
curl -X POST http://localhost:3000/api/bills \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Bill",
    "amount": 1000,
    "due_date": "2024-02-01",
    "frequency": "monthly",
    "category": "utilities"
  }'

# Get upcoming bills
curl http://localhost:3000/api/bills/upcoming?days=30 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Record payment
curl -X POST http://localhost:3000/api/bills/BILL_ID/pay \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "payment_method": "credit_card"
  }'
```

## Troubleshooting

### Reminders Not Sending

1. Check email service configuration in `.env`
2. Verify cron jobs are running: check server logs
3. Check reminder status: `GET /api/reminders/pending`
4. Retry failed reminders: `POST /api/reminders/:id/retry`

### Calendar Not Syncing

1. Manually sync: `POST /api/calendar/sync`
2. Check bill due dates are valid
3. Verify user has active bills

### Auto-Pay Not Working

1. Ensure auto_pay.enabled is true
2. Check account is valid
3. Verify next_due_date is today
4. Check server logs for auto-pay processing errors

## Support

For issues or feature requests, please create an issue on GitHub.

## License

MIT License - see LICENSE file for details
