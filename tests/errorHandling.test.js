const assert = require('assert');
const AppError = require('../utils/AppError');
const ResponseFactory = require('../utils/ResponseFactory');

describe('Standardized Error & Response Engine', () => {

    describe('AppError Class', () => {
        it('should correctly format operational errors', () => {
            const err = new AppError('Test Error', 404);

            assert.strictEqual(err.message, 'Test Error');
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.status, 'fail');
            assert.strictEqual(err.isOperational, true);
        });

        it('should mark 5xx errors as "error" status', () => {
            const err = new AppError('Server Fail', 500);
            assert.strictEqual(err.status, 'error');
        });
    });

    describe('ResponseFactory', () => {
        const resMock = {
            status: function (code) {
                this.statusCode = code;
                return this;
            },
            json: function (data) {
                this.body = data;
                return this;
            }
        };

        it('should generate JSend-compliant success response', () => {
            ResponseFactory.success(resMock, { id: 1 }, 201, 'Created');

            assert.strictEqual(resMock.statusCode, 201);
            assert.strictEqual(resMock.body.status, 'success');
            assert.strictEqual(resMock.body.message, 'Created');
            assert.deepStrictEqual(resMock.body.data, { id: 1 });
        });

        it('should generate JSend-compliant fail response', () => {
            ResponseFactory.fail(resMock, { email: 'Invalid' }, 422);

            assert.strictEqual(resMock.statusCode, 422);
            assert.strictEqual(resMock.body.status, 'fail');
            assert.deepStrictEqual(resMock.body.data, { email: 'Invalid' });
        });
    });
});
