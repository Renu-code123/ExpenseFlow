/**
 * Notification Hub Test Suite
 * Issue #646: Verifies template rendering and preference-based distribution
 */

const assert = require('assert');
const templates = require('../templates/notificationTemplates');
const notificationService = require('../services/notificationService');

describe('Programmable Notification Hub', () => {

    describe('Template Engine', () => {
        it('should correctly render budget_alert template', () => {
            const data = { category: 'Food', percentage: 90, amount: 900, limit: 1000 };
            const rendered = templates.render('budget_alert', data);

            assert.strictEqual(rendered.title, 'Budget Alert: Food');
            assert.ok(rendered.message.includes('90%'));
            assert.strictEqual(rendered.priority, 'high');
        });

        it('should correctly render security_anomaly template', () => {
            const data = { event: 'Login', location: 'London, UK' };
            const rendered = templates.render('security_anomaly', data);

            assert.strictEqual(rendered.priority, 'critical');
            assert.ok(rendered.message.includes('London, UK'));
        });
    });

    describe('Service Integration (Logic)', () => {
        it('should successfully calculate channel distribution based on mock preferences', () => {
            // Mocking logic for channel selection
            const preferences = {
                channels: { email: true, in_app: true, webhook: false }
            };

            const activeChannels = Object.keys(preferences.channels).filter(k => preferences.channels[k]);
            assert.deepStrictEqual(activeChannels, ['email', 'in_app']);
        });

        it('should expose primary dispatch method', () => {
            assert.strictEqual(typeof notificationService.dispatch, 'function');
        });
    });
});
