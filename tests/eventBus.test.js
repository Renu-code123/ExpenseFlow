const assert = require('assert');
const AppEventBus = require('../utils/AppEventBus');
const EVENTS = require('../config/eventRegistry');

describe('Asynchronous Event Bus & Decoupling', () => {

    describe('Event Bus Mechanics', () => {
        it('should handle multiple listeners for a single event', (done) => {
            let count = 0;
            const handler = () => { count++; if (count === 2) done(); };

            AppEventBus.subscribe('test.event', handler);
            AppEventBus.on('test.event', handler); // Direct on also works

            AppEventBus.publish('test.event', {});
        });

        it('should isolate listener failures from the publisher', async () => {
            AppEventBus.subscribe('error.event', () => {
                throw new Error('Boom');
            });

            // This should NOT throw
            try {
                AppEventBus.publish('error.event', {});
                assert.ok(true, 'Publisher survived listener crash');
            } catch (err) {
                assert.fail('Publisher was affected by listener crash');
            }
        });

        it('should respect the event registry naming', () => {
            assert.strictEqual(EVENTS.USER.REGISTERED, 'user.registered');
            assert.strictEqual(EVENTS.TRANSACTION.CREATED, 'transaction.created');
        });
    });

    describe('Service Decoupling (Simulation)', () => {
        it('should track metrics correctly', () => {
            AppEventBus.publish('metric.test', { foo: 'bar' });
            const metrics = AppEventBus.getMetrics();

            assert.ok(metrics.totalEvents > 0);
            assert.ok(metrics.activeListeners > 0);
        });
    });
});
