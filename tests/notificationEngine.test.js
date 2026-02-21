const assert = require('assert');
const templateResolver = require('../utils/templateResolver');
const NotificationTemplate = require('../models/NotificationTemplate');


describe('Notification Lifecycle Engine', () => {

    describe('TemplateResolver', () => {
        const mockTemplate = {
            channels: {
                email: {
                    subject: 'Hello {{name}}',
                    body: 'Your balance is {{balance}} {{currency}}.',
                    enabled: true
                },
                push: {
                    title: 'Alert!',
                    body: '{{name}}, your {{category}} budget is low.',
                    enabled: true
                }
            },
            variableDefinitions: [
                { name: 'name', required: true },
                { name: 'balance', required: true },
                { name: 'currency', required: false }
            ]
        };

        it('should resolve variables accurately across channels', () => {
            const variables = { name: 'John', balance: '100', currency: 'USD', category: 'Food' };
            const result = templateResolver.resolve(mockTemplate, variables);

            assert.strictEqual(result.email.subject, 'Hello John');
            assert.strictEqual(result.email.body, 'Your balance is 100 USD.');
            assert.strictEqual(result.push.body, 'John, your Food budget is low.');
        });

        it('should identify missing required variables', () => {
            const variables = { name: 'John' }; // Missing balance
            const missing = templateResolver.validateVariables(mockTemplate, variables);

            assert.ok(missing.includes('balance'));
            assert.ok(!missing.includes('name'));
        });
    });

    describe('Mock Database Interaction', () => {
        it('should validate NotificationTemplate schema paths', () => {
            const template = new NotificationTemplate({
                slug: 'test-slug',
                name: 'Test Name',
                channels: { email: { subject: 'Test', body: 'Test' } }
            });

            assert.strictEqual(template.slug, 'test-slug');
            assert.strictEqual(template.channels.email.enabled, true); // default
            assert.strictEqual(template.isActive, true); // default
        });
    });
});
