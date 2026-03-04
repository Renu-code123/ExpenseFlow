/**
 * Event-Sourced Expense Processing with CQRS Architecture
 * Complex backend foundation for ExpenseFlow
 * Author: Ayaanshaikh12243
 * Issue: #962
 */

// Event Store (append-only, optimistic concurrency)
class EventStore {
  constructor() {
    this.events = [];
    this.snapshots = new Map();
    this.outbox = [];
    this.versionMap = new Map();
  }

  // Append event with optimistic concurrency
  append(aggregateId, event, expectedVersion) {
    const currentVersion = this.versionMap.get(aggregateId) || 0;
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      throw new Error('Concurrency conflict');
    }
    this.events.push({ ...event, aggregateId, version: currentVersion + 1 });
    this.versionMap.set(aggregateId, currentVersion + 1);
    return currentVersion + 1;
  }

  // Get events for aggregate
  getEvents(aggregateId) {
    return this.events.filter(e => e.aggregateId === aggregateId);
  }

  // Save snapshot
  saveSnapshot(aggregateId, state, version) {
    this.snapshots.set(aggregateId, { state, version });
  }

  // Get snapshot
  getSnapshot(aggregateId) {
    return this.snapshots.get(aggregateId);
  }

  // Transactional outbox for event publishing
  addToOutbox(event) {
    this.outbox.push(event);
  }

  // Publish outbox events (stub for Kafka/RabbitMQ)
  publishOutbox(publisher) {
    while (this.outbox.length > 0) {
      const event = this.outbox.shift();
      publisher.publish(event);
    }
  }
}

// Command Model (write side)
class ExpenseCommandHandler {
  constructor(eventStore) {
    this.eventStore = eventStore;
  }

  // Submit expense command
  submitExpense(cmd) {
    // Validate, create event
    const event = {
      type: 'ExpenseSubmitted',
      data: cmd,
      timestamp: Date.now()
    };
    const version = this.eventStore.append(cmd.aggregateId, event, cmd.expectedVersion);
    this.eventStore.addToOutbox(event);
    return version;
  }

  // Compensating action for saga
  compensateExpense(cmd) {
    const event = {
      type: 'ExpenseCompensated',
      data: cmd,
      timestamp: Date.now()
    };
    this.eventStore.append(cmd.aggregateId, event, cmd.expectedVersion);
    this.eventStore.addToOutbox(event);
  }
}

// Query Model (read side, projections)
class ExpenseProjection {
  constructor() {
    this.expenseView = new Map();
    this.analyticsView = new Map();
    this.fraudView = new Map();
  }

  // Handle event for projections
  handleEvent(event) {
    switch (event.type) {
      case 'ExpenseSubmitted':
        this.updateExpenseView(event);
        this.updateAnalyticsView(event);
        break;
      case 'ExpenseCompensated':
        this.updateFraudView(event);
        break;
      // ...other event types...
    }
  }

  updateExpenseView(event) {
    const { aggregateId, data } = event;
    if (!this.expenseView.has(aggregateId)) {
      this.expenseView.set(aggregateId, []);
    }
    this.expenseView.get(aggregateId).push(data);
  }

  updateAnalyticsView(event) {
    // Example: Aggregate analytics
    const { aggregateId, data } = event;
    if (!this.analyticsView.has(aggregateId)) {
      this.analyticsView.set(aggregateId, { total: 0, count: 0 });
    }
    const view = this.analyticsView.get(aggregateId);
    view.total += data.amount;
    view.count += 1;
  }

  updateFraudView(event) {
    // Example: Mark compensated expenses
    const { aggregateId, data } = event;
    if (!this.fraudView.has(aggregateId)) {
      this.fraudView.set(aggregateId, []);
    }
    this.fraudView.get(aggregateId).push(data);
  }

  // Query handlers
  getExpenseView(aggregateId) {
    return this.expenseView.get(aggregateId) || [];
  }

  getAnalyticsView(aggregateId) {
    return this.analyticsView.get(aggregateId) || { total: 0, count: 0 };
  }

  getFraudView(aggregateId) {
    return this.fraudView.get(aggregateId) || [];
  }
}

// Event Bus Integration (Kafka/RabbitMQ stub)
class EventPublisher {
  publish(event) {
    // Stub: send event to Kafka/RabbitMQ
    console.log('Published event:', event.type, event.aggregateId);
  }
}

// Aggregate Pattern (DDD-style domain model)
class ExpenseAggregate {
  constructor(aggregateId) {
    this.aggregateId = aggregateId;
    this.state = { expenses: [], compensated: [] };
    this.version = 0;
  }

  // Replay events to reconstruct state
  replay(events) {
    events.forEach(event => {
      switch (event.type) {
        case 'ExpenseSubmitted':
          this.state.expenses.push(event.data);
          this.version = event.version;
          break;
        case 'ExpenseCompensated':
          this.state.compensated.push(event.data);
          this.version = event.version;
          break;
        // ...other event types...
      }
    });
  }

  // Get current state
  getState() {
    return this.state;
  }
}

// Saga Pattern (distributed transaction management)
class ExpenseSaga {
  constructor(eventStore, publisher) {
    this.eventStore = eventStore;
    this.publisher = publisher;
    this.sagaLog = [];
  }

  // Orchestrate multi-step workflow
  async processExpenseSaga(cmd) {
    try {
      // Step 1: Submit expense
      const version = this.eventStore.append(cmd.aggregateId, {
        type: 'ExpenseSubmitted',
        data: cmd,
        timestamp: Date.now()
      }, cmd.expectedVersion);
      this.sagaLog.push({ step: 'submit', version });
      // Step 2: Publish event
      this.publisher.publish({ type: 'ExpenseSubmitted', aggregateId: cmd.aggregateId, data: cmd });
      // Step 3: Compensate if needed
      if (cmd.compensate) {
        this.eventStore.append(cmd.aggregateId, {
          type: 'ExpenseCompensated',
          data: cmd,
          timestamp: Date.now()
        }, version);
        this.publisher.publish({ type: 'ExpenseCompensated', aggregateId: cmd.aggregateId, data: cmd });
        this.sagaLog.push({ step: 'compensate', version });
      }
      // ...other steps...
    } catch (err) {
      // Compensating action
      this.eventStore.append(cmd.aggregateId, {
        type: 'ExpenseSagaFailed',
        data: { error: err.message },
        timestamp: Date.now()
      });
      this.sagaLog.push({ step: 'failed', error: err.message });
    }
  }
}

// Monitoring & Observability (stub)
class Monitoring {
  constructor(eventStore) {
    this.eventStore = eventStore;
    this.metrics = { eventsProcessed: 0, commandsProcessed: 0, sagasRun: 0 };
  }

  recordEvent() {
    this.metrics.eventsProcessed++;
  }

  recordCommand() {
    this.metrics.commandsProcessed++;
  }

  recordSaga() {
    this.metrics.sagasRun++;
  }

  getMetrics() {
    return this.metrics;
  }
}

// --- Advanced CQRS/Event-Sourcing Extensions ---

// Distributed Lock Manager for concurrency control
class DistributedLockManager {
  constructor() {
    this.locks = new Map();
  }
  acquireLock(resourceId, ownerId) {
    if (this.locks.has(resourceId)) return false;
    this.locks.set(resourceId, ownerId);
    return true;
  }
  releaseLock(resourceId, ownerId) {
    if (this.locks.get(resourceId) === ownerId) {
      this.locks.delete(resourceId);
      return true;
    }
    return false;
  }
  isLocked(resourceId) {
    return this.locks.has(resourceId);
  }
}

// Event Replay & Recovery
class EventReplayManager {
  constructor(eventStore) {
    this.eventStore = eventStore;
  }
  replayAll(aggregateId, aggregate) {
    const events = this.eventStore.getEvents(aggregateId);
    aggregate.replay(events);
    return aggregate.getState();
  }
  recoverFromSnapshot(aggregateId, aggregate) {
    const snapshot = this.eventStore.getSnapshot(aggregateId);
    if (snapshot) {
      aggregate.state = snapshot.state;
      aggregate.version = snapshot.version;
    }
    return aggregate.getState();
  }
}

// Projection Handler Registry
class ProjectionRegistry {
  constructor() {
    this.handlers = [];
  }
  register(handler) {
    this.handlers.push(handler);
  }
  handle(event) {
    this.handlers.forEach(h => h.handleEvent(event));
  }
}

// Outbox Processor with retry logic
class OutboxProcessor {
  constructor(eventStore, publisher) {
    this.eventStore = eventStore;
    this.publisher = publisher;
    this.retryQueue = [];
  }
  processOutbox() {
    while (this.eventStore.outbox.length > 0) {
      const event = this.eventStore.outbox.shift();
      try {
        this.publisher.publish(event);
      } catch (err) {
        this.retryQueue.push({ event, retries: 1 });
      }
    }
    this.processRetries();
  }
  processRetries() {
    this.retryQueue = this.retryQueue.filter(item => {
      try {
        this.publisher.publish(item.event);
        return false;
      } catch (err) {
        item.retries++;
        return item.retries < 5;
      }
    });
  }
}

// Saga Monitor for distributed workflow tracking
class SagaMonitor {
  constructor() {
    this.sagaHistory = [];
  }
  recordSaga(sagaId, step, status, details) {
    this.sagaHistory.push({ sagaId, step, status, details, timestamp: Date.now() });
  }
  getSagaHistory(sagaId) {
    return this.sagaHistory.filter(s => s.sagaId === sagaId);
  }
}

// --- End Advanced CQRS/Event-Sourcing Extensions ---

// Example: Registering multiple projections
const projectionRegistry = new ProjectionRegistry();
projectionRegistry.register(new ExpenseProjection());
// projectionRegistry.register(new AnalyticsProjection()); // Extend as needed
// projectionRegistry.register(new FraudProjection()); // Extend as needed

// Example: Distributed lock usage
const lockManager = new DistributedLockManager();
const resourceId = 'expense_5';
const ownerId = 'worker_1';
if (lockManager.acquireLock(resourceId, ownerId)) {
  // Safe to process
  lockManager.releaseLock(resourceId, ownerId);
}

// Example: Outbox processor usage
const outboxProcessor = new OutboxProcessor(eventStore, publisher);
outboxProcessor.processOutbox();

// Example: Saga monitor usage
const sagaMonitor = new SagaMonitor();
sagaMonitor.recordSaga('saga_1', 'submit', 'success', { expenseId: 'expense_5' });
console.log('Saga history:', sagaMonitor.getSagaHistory('saga_1'));

// Example: Event replay and recovery
const replayManager = new EventReplayManager(eventStore);
const recoveredState = replayManager.replayAll('expense_5', agg);
console.log('Recovered state:', recoveredState);
const snapshotState = replayManager.recoverFromSnapshot('expense_5', agg);
console.log('Snapshot recovered state:', snapshotState);

// Example usage and wiring
const eventStore = new EventStore();
const publisher = new EventPublisher();
const commandHandler = new ExpenseCommandHandler(eventStore);
const projection = new ExpenseProjection();
const saga = new ExpenseSaga(eventStore, publisher);
const monitoring = new Monitoring(eventStore);

// Simulate expense submission
for (let i = 1; i <= 10; i++) {
  const cmd = {
    aggregateId: 'expense_' + i,
    amount: Math.floor(Math.random() * 1000),
    expectedVersion: eventStore.versionMap.get('expense_' + i) || 0,
    compensate: i % 3 === 0
  };
  commandHandler.submitExpense(cmd);
  monitoring.recordCommand();
  saga.processExpenseSaga(cmd);
  monitoring.recordSaga();
}

// Replay events for aggregate
const agg = new ExpenseAggregate('expense_5');
agg.replay(eventStore.getEvents('expense_5'));
console.log('Aggregate state:', agg.getState());

// Handle events for projections
eventStore.events.forEach(event => projection.handleEvent(event));
console.log('Expense view:', projection.getExpenseView('expense_5'));
console.log('Analytics view:', projection.getAnalyticsView('expense_5'));
console.log('Fraud view:', projection.getFraudView('expense_5'));

// Publish outbox events
eventStore.publishOutbox(publisher);

// Monitoring metrics
console.log('Monitoring metrics:', monitoring.getMetrics());

// Snapshotting example
const snapshot = agg.getState();
eventStore.saveSnapshot('expense_5', snapshot, agg.version);
console.log('Snapshot:', eventStore.getSnapshot('expense_5'));

// Scale targets and concurrency test (stub)
// ...existing code for scale simulation, concurrency, and performance...
