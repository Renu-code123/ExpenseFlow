# AI-Powered Anomaly Detection & Fraud Prevention Engine

## Overview

The Anomaly Detection & Fraud Prevention Engine uses machine learning and behavioral analysis to identify suspicious transactions, unusual spending patterns, and potential security threats in real-time. The system provides comprehensive fraud detection, risk scoring, and automated prevention mechanisms.

## Features

- **Machine Learning-Based Detection**: Identifies anomalies using behavioral profiling and pattern recognition
- **Real-Time Monitoring**: Continuous transaction analysis with instant alerts
- **Risk Scoring**: Multi-factor risk assessment with trending analysis
- **Behavioral Profiling**: Learns user spending patterns and detects deviations
- **Blacklist Management**: Maintains blocked entities (merchants, IPs, devices)
- **Automated Prevention**: Blocks suspicious transactions before they complete
- **Investigation Tools**: Comprehensive event tracking and forensic analysis
- **Appeal System**: User-friendly dispute resolution process

## Models

### 1. AnomalyRule
Defines detection rules for identifying suspicious activities.

**Schema:**
```javascript
{
  name: String,
  description: String,
  type: 'threshold' | 'pattern' | 'velocity' | 'geo' | 'behavioral',
  conditions: Map,
  severity: 'low' | 'medium' | 'high' | 'critical',
  action: 'alert' | 'block' | 'review',
  isActive: Boolean,
  priority: Number,
  detections: {
    total: Number,
    truePositives: Number,
    falsePositives: Number,
    pending: Number
  },
  accuracy: Number,
  lastTriggered: Date,
  cooldownPeriod: Number,
  notificationChannels: [String],
  tags: [String],
  createdBy: ObjectId
}
```

**Rule Types:**

1. **Threshold Rules**: Simple value comparisons
   ```javascript
   conditions: {
     field: 'amount',
     operator: '>',
     value: 1000
   }
   ```

2. **Velocity Rules**: Transaction frequency checks
   ```javascript
   conditions: {
     transactions: 5,
     timeWindow: 3600, // seconds
     maxCount: 10
   }
   ```

3. **Pattern Rules**: Sequence detection
   ```javascript
   conditions: {
     sequence: ['high_value', 'foreign', 'new_merchant'],
     window: 86400,
     threshold: 3
   }
   ```

4. **Geo Rules**: Location-based detection
   ```javascript
   conditions: {
     blockedCountries: ['XX', 'YY'],
     allowedCountries: ['US', 'CA'],
     distanceThreshold: 1000 // km
   }
   ```

5. **Behavioral Rules**: User pattern deviation
   ```javascript
   conditions: {
     deviationThreshold: 2.5,
     profileFields: ['amount', 'category', 'time']
   }
   ```

### 2. AnomalyEvent
Records detected anomalies and investigation details.

**Schema:**
```javascript
{
  userId: ObjectId,
  transactionId: ObjectId,
  ruleId: ObjectId,
  type: 'unusual_amount' | 'suspicious_velocity' | 'abnormal_pattern' | 'geo_anomaly' | 'behavioral_deviation' | 'duplicate_transaction' | 'merchant_anomaly' | 'time_anomaly' | 'category_anomaly' | 'device_mismatch' | 'multiple_failures' | 'compromised_credentials',
  score: Number (0-100),
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: {
    description: String,
    triggeredConditions: [String],
    expectedValue: Mixed,
    actualValue: Mixed,
    deviationPercentage: Number,
    contributingFactors: [{
      factor: String,
      weight: Number,
      value: Mixed
    }],
    metadata: Map
  },
  status: 'pending' | 'confirmed_fraud' | 'false_positive' | 'resolved' | 'escalated',
  reviewedBy: ObjectId,
  reviewedAt: Date,
  reviewNotes: String,
  actionsTaken: [{
    action: 'alert_sent' | 'transaction_blocked' | 'account_locked' | 'review_requested' | 'user_notified' | 'escalated' | 'auto_resolved',
    timestamp: Date,
    performedBy: ObjectId,
    details: String
  }],
  context: {
    transactionAmount: Number,
    transactionCategory: String,
    merchant: String,
    location: Object,
    device: Object,
    timestamp: Date,
    userBehaviorScore: Number
  },
  investigation: {
    assignedTo: ObjectId,
    startedAt: Date,
    completedAt: Date,
    findings: String,
    priority: 'low' | 'medium' | 'high' | 'urgent'
  },
  financialImpact: {
    potentialLoss: Number,
    actualLoss: Number,
    recovered: Number,
    preventedLoss: Number
  }
}
```

### 3. UserBehaviorProfile
Tracks user spending patterns and behavioral baselines.

**Schema:**
```javascript
{
  userId: ObjectId,
  avgDailySpend: Number,
  avgTransactionSize: Number,
  medianTransactionSize: Number,
  maxTransactionSize: Number,
  transactionSizeStdDev: Number,
  typicalCategories: [{
    category: String,
    frequency: Number,
    avgAmount: Number,
    percentage: Number
  }],
  typicalMerchants: [{
    merchant: String,
    frequency: Number,
    avgAmount: Number,
    isTrusted: Boolean
  }],
  activeHours: [{
    hour: Number (0-23),
    transactionCount: Number,
    avgAmount: Number
  }],
  activeDaysOfWeek: [{
    day: Number (0-6),
    transactionCount: Number,
    avgAmount: Number
  }],
  typicalLocations: [{
    country: String,
    city: String,
    coordinates: { lat: Number, lng: Number },
    frequency: Number,
    radius: Number
  }],
  deviceFingerprints: [{
    fingerprint: String,
    deviceType: 'mobile' | 'tablet' | 'desktop' | 'other',
    transactionCount: Number,
    isTrusted: Boolean,
    ipAddresses: [{ ip: String, lastSeen: Date }]
  }],
  velocityProfile: {
    avgTransactionsPerDay: Number,
    maxTransactionsPerDay: Number,
    avgTransactionsPerHour: Number
  },
  statistics: {
    totalTransactions: Number,
    totalSpend: Number,
    accountAgeInDays: Number,
    dataQuality: 'low' | 'medium' | 'high'
  }
}
```

### 4. RiskScore
Calculates and tracks overall user risk levels.

**Schema:**
```javascript
{
  userId: ObjectId,
  overallScore: Number (0-100),
  riskLevel: 'minimal' | 'low' | 'medium' | 'high' | 'critical',
  factors: [{
    name: 'transaction_velocity' | 'high_value_transactions' | 'unusual_patterns' | 'geographic_risk' | 'behavioral_deviation' | 'device_anomalies' | 'merchant_risk' | 'account_age' | 'verification_status' | 'historical_fraud' | 'failed_transactions' | 'suspicious_activities' | 'chargebacks',
    score: Number (0-100),
    weight: Number (0-1),
    description: String,
    severity: 'low' | 'medium' | 'high' | 'critical',
    evidence: Map
  }],
  scoreHistory: [{
    score: Number,
    timestamp: Date,
    triggerEvent: String,
    changedFactors: [String]
  }],
  trend: 'increasing' | 'stable' | 'decreasing',
  trendPercentage: Number,
  thresholds: {
    warning: Number,
    critical: Number
  },
  alerts: [{
    level: 'warning' | 'critical',
    triggeredAt: Date,
    acknowledged: Boolean
  }],
  mitigationActions: [{
    action: 'increase_monitoring' | 'require_verification' | 'limit_transactions' | 'manual_review' | 'account_restriction' | 'enhanced_authentication' | 'contact_user',
    status: 'pending' | 'in_progress' | 'completed' | 'failed',
    assignedTo: ObjectId
  }]
}
```

### 5. BlockedEntity
Manages blacklist of blocked merchants, IPs, devices, and cards.

**Schema:**
```javascript
{
  type: 'merchant' | 'ip' | 'device' | 'card' | 'email' | 'phone' | 'country' | 'user',
  value: String,
  hashedValue: String,
  reason: 'confirmed_fraud' | 'repeated_chargebacks' | 'suspicious_activity' | 'identity_theft' | 'account_takeover' | 'multiple_violations' | 'high_risk_region' | 'known_fraudster',
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: {
    description: String,
    associatedTransactions: [ObjectId],
    associatedUsers: [ObjectId],
    associatedEvents: [ObjectId],
    evidence: Map
  },
  scope: 'global' | 'platform' | 'user_specific',
  userId: ObjectId,
  expiresAt: Date,
  isPermanent: Boolean,
  isActive: Boolean,
  addedBy: ObjectId,
  hits: {
    total: Number,
    last30Days: Number,
    lastHitAt: Date
  },
  preventedTransactions: Number,
  preventedLoss: Number,
  appeals: [{
    submittedBy: ObjectId,
    reason: String,
    status: 'pending' | 'approved' | 'rejected',
    reviewedBy: ObjectId
  }],
  attributes: {
    merchantCategory: String,
    ipRange: String,
    deviceType: String,
    cardType: String,
    countryCode: String
  }
}
```

## API Examples

### Create Anomaly Rule

```javascript
const AnomalyRule = require('./models/AnomalyRule');

// Create threshold rule
const rule = await AnomalyRule.create({
  name: 'High Value Transaction Alert',
  description: 'Alert on transactions over $1000',
  type: 'threshold',
  conditions: new Map([
    ['field', 'amount'],
    ['operator', '>'],
    ['value', 1000]
  ]),
  severity: 'high',
  action: 'review',
  priority: 80,
  cooldownPeriod: 60,
  notificationChannels: ['email', 'push'],
  createdBy: userId
});

// Create velocity rule
const velocityRule = await AnomalyRule.create({
  name: 'Rapid Transaction Detection',
  type: 'velocity',
  conditions: new Map([
    ['timeWindow', 3600],
    ['maxCount', 5],
    ['threshold', 80]
  ]),
  severity: 'critical',
  action: 'block',
  createdBy: userId
});
```

### Evaluate Transaction

```javascript
const UserBehaviorProfile = require('./models/UserBehaviorProfile');
const AnomalyRule = require('./models/AnomalyRule');
const AnomalyEvent = require('./models/AnomalyEvent');

// Get user profile
const profile = await UserBehaviorProfile.getOrCreateProfile(userId);

// Calculate anomaly score
const transaction = {
  amount: 1500,
  category: 'Electronics',
  merchant: 'NewStore',
  date: new Date(),
  location: { country: 'US', city: 'New York' },
  device: { fingerprint: 'abc123', type: 'mobile' }
};

const anomalyScore = profile.calculateAnomalyScore(transaction);

// Get active rules
const rules = await AnomalyRule.getActiveRules();

// Evaluate rules
for (const rule of rules) {
  const triggered = rule.evaluate(transaction, profile);
  
  if (triggered) {
    // Create anomaly event
    const event = await AnomalyEvent.create({
      userId,
      transactionId: transaction._id,
      ruleId: rule._id,
      type: 'unusual_amount',
      score: anomalyScore,
      severity: rule.severity,
      status: 'pending',
      details: {
        description: `Transaction triggered rule: ${rule.name}`,
        actualValue: transaction.amount,
        expectedValue: profile.avgTransactionSize
      },
      context: {
        transactionAmount: transaction.amount,
        transactionCategory: transaction.category,
        merchant: transaction.merchant
      }
    });
    
    // Record detection
    await rule.recordDetection(null); // null = pending review
    
    // Take action based on rule
    if (rule.action === 'block') {
      // Block transaction
      await event.recordAction('transaction_blocked', systemUserId);
    } else if (rule.action === 'alert') {
      // Send alert
      await event.sendNotification('email');
    }
  }
}
```

### Calculate Risk Score

```javascript
const RiskScore = require('./models/RiskScore');

// Create risk score
const riskScore = new RiskScore({
  userId,
  overallScore: 0
});

// Add risk factors
riskScore.updateFactor(
  'transaction_velocity',
  85,
  0.3,
  'Unusually high transaction frequency',
  { count: 10, period: '1 hour', typical: 2 }
);

riskScore.updateFactor(
  'high_value_transactions',
  70,
  0.25,
  'Multiple high-value transactions',
  { amount: 5000, avgAmount: 150 }
);

riskScore.updateFactor(
  'geographic_risk',
  60,
  0.15,
  'Transactions from unusual location',
  { location: 'Foreign Country', typical: 'US' }
);

// Calculate overall score
riskScore.calculateOverallScore();

// Check for alerts
riskScore.checkAlerts();

// Get recommended actions
const actions = riskScore.getRecommendedActions();

// Add mitigation actions
for (const action of actions) {
  riskScore.addMitigationAction(action, reviewerId);
}

await riskScore.save();
```

### Block Entity

```javascript
const BlockedEntity = require('./models/BlockedEntity');

// Block a merchant
const blockedMerchant = await BlockedEntity.create({
  type: 'merchant',
  value: 'SuspiciousMerchant Inc',
  reason: 'confirmed_fraud',
  severity: 'high',
  details: {
    description: 'Multiple fraud reports from users',
    associatedTransactions: [txId1, txId2],
    associatedEvents: [eventId1, eventId2]
  },
  scope: 'platform',
  expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
  addedBy: adminId,
  attributes: {
    merchantCategory: 'Electronics',
    merchantCountry: 'XX'
  }
});

// Block an IP address
const blockedIP = await BlockedEntity.create({
  type: 'ip',
  value: '192.168.1.100',
  reason: 'suspicious_activity',
  severity: 'medium',
  scope: 'global',
  isPermanent: true,
  addedBy: adminId,
  attributes: {
    ipRange: '192.168.1.0/24',
    isp: 'Suspicious ISP'
  }
});

// Check if entity is blocked
const { blocked, block } = await BlockedEntity.isBlocked('merchant', 'SuspiciousMerchant Inc');

if (blocked) {
  console.log('Transaction blocked:', block.reason);
  // Prevent transaction
}
```

### Handle Anomaly Events

```javascript
// Get pending events
const pendingEvents = await AnomalyEvent.getPendingEvents(50);

// Review event
const event = await AnomalyEvent.findById(eventId);

// Confirm as fraud
await event.confirmFraud(reviewerId, 'Verified fraudulent transaction through investigation');

// Or mark as false positive
await event.markFalsePositive(reviewerId, 'Legitimate transaction, user confirmed');

// Escalate event
await event.escalate(seniorReviewerId, 'Requires senior review due to high value');

// Update financial impact
await event.updateFinancialImpact({
  potentialLoss: 5000,
  actualLoss: 0,
  preventedLoss: 5000
});

// Get high-risk events
const highRiskEvents = await AnomalyEvent.getHighRiskEvents(80);
```

### Profile Management

```javascript
const UserBehaviorProfile = require('./models/UserBehaviorProfile');

// Update profile with new transaction
const profile = await UserBehaviorProfile.getOrCreateProfile(userId);
await profile.updateWithTransaction({
  amount: 150,
  category: 'Groceries',
  merchant: 'SuperMart',
  date: new Date(),
  location: { country: 'US', city: 'New York' },
  device: { fingerprint: 'abc123', type: 'mobile', ipAddress: '192.168.1.1' }
});

// Full recalculation from history
const transactions = await Expense.find({ userId });
await profile.recalculateFromHistory(transactions);

// Check profile maturity
if (profile.isMature) {
  console.log('Profile is ready for anomaly detection');
  console.log('Completeness:', profile.completeness, '%');
}

// Get profiles needing update
const staleProfiles = await UserBehaviorProfile.getProfilesNeedingUpdate();
```

## Detection Algorithms

### 1. Threshold-Based Detection
Simple rule-based detection for known patterns:
- Transaction amount exceeds limit
- Velocity exceeds normal rate
- Geographic distance from home

### 2. Statistical Detection
Uses statistical methods:
- Standard deviation analysis
- Z-score calculation
- Moving averages

### 3. Behavioral Analysis
Learns user patterns:
- Category preferences
- Merchant habits
- Time patterns
- Location patterns
- Device patterns

### 4. Machine Learning (Future Enhancement)
- Neural networks for complex pattern recognition
- Ensemble models combining multiple algorithms
- Continuous learning from feedback

## Risk Scoring System

**Score Calculation:**
```
Overall Score = Σ (Factor Score × Factor Weight)
```

**Risk Levels:**
- 0-19: Minimal risk
- 20-39: Low risk
- 40-64: Medium risk
- 65-79: High risk
- 80-100: Critical risk

**Factor Weights:**
- Transaction Velocity: 0.30
- High Value Transactions: 0.25
- Geographic Risk: 0.20
- Behavioral Deviation: 0.15
- Device Anomalies: 0.10

## Best Practices

### Rule Creation
1. Start with conservative thresholds
2. Monitor false positive rates
3. Adjust based on effectiveness
4. Use cooldown periods to prevent alert fatigue
5. Tag rules for easy organization

### Profile Building
1. Require minimum 20 transactions for reliability
2. Update profiles regularly (daily recommended)
3. Handle seasonal patterns
4. Account for life changes (moving, new job)
5. Respect privacy and data retention policies

### Investigation Workflow
1. Review high-severity events first
2. Check user history and context
3. Look for related events
4. Contact user when necessary
5. Document findings thoroughly
6. Update rules based on learnings

### Block Management
1. Use temporary blocks initially
2. Require review before permanent blocks
3. Document evidence clearly
4. Allow appeals process
5. Review block effectiveness regularly
6. Clean up expired blocks

## Performance Considerations

- **Indexing**: All models have optimized indexes for common queries
- **Caching**: Consider caching user profiles and active rules
- **Async Processing**: Run detection algorithms asynchronously
- **Batch Updates**: Update profiles in batches during off-peak hours
- **Data Retention**: Archive old events and score history

## Security & Privacy

- Hash sensitive data (card numbers, emails)
- Implement role-based access control
- Audit all manual reviews and actions
- Comply with data protection regulations (GDPR, CCPA)
- Provide user transparency and appeal rights
- Secure API endpoints with authentication

## Monitoring & Metrics

Track these key metrics:
- Rule accuracy rates
- False positive/negative rates
- Average resolution time
- Prevented loss amount
- User appeal success rate
- System performance metrics

## Integration Points

```javascript
// Express middleware example
const anomalyDetectionMiddleware = async (req, res, next) => {
  const { userId, transaction } = req.body;
  
  // Check blocked entities
  const merchantCheck = await BlockedEntity.isBlocked('merchant', transaction.merchant, userId);
  if (merchantCheck.blocked) {
    return res.status(403).json({ error: 'Merchant is blocked', reason: merchantCheck.block.reason });
  }
  
  // Get user profile and risk score
  const profile = await UserBehaviorProfile.getOrCreateProfile(userId);
  const riskScore = await RiskScore.getLatestForUser(userId);
  
  // High-risk users require additional verification
  if (riskScore && riskScore.isHighRisk) {
    req.requireAdditionalVerification = true;
  }
  
  // Evaluate anomaly rules
  const rules = await AnomalyRule.getActiveRules();
  for (const rule of rules) {
    if (rule.evaluate(transaction, profile)) {
      // Create event and take action
      const event = await AnomalyEvent.create({
        userId,
        transactionId: transaction._id,
        ruleId: rule._id,
        type: determineAnomalyType(rule),
        score: profile.calculateAnomalyScore(transaction),
        severity: rule.severity,
        status: 'pending'
      });
      
      if (rule.action === 'block') {
        return res.status(403).json({ error: 'Transaction blocked due to suspicious activity' });
      }
    }
  }
  
  next();
};
```

## Future Enhancements

1. **Advanced ML Models**: Implement neural networks and deep learning
2. **Graph Analysis**: Detect fraud rings and network patterns
3. **External Data Integration**: Credit bureaus, fraud databases
4. **Biometric Verification**: Face recognition, fingerprint
5. **Real-Time Collaboration**: Team investigation tools
6. **Predictive Analytics**: Forecast fraud trends
7. **A/B Testing**: Test rule effectiveness
8. **Automated Remediation**: Self-healing systems

## Support

For issues or questions:
- Review rule effectiveness regularly
- Monitor false positive rates
- Adjust thresholds based on user feedback
- Keep rules documentation updated
- Train team on investigation procedures
