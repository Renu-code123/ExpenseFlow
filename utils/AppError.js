/**
 * Custom Application Error Class
 * Issue #712: Distinguishes between operational errors (expected) 
 * and programmer errors (bugs/crashes).
 */
class AppError extends Error {
    /**
     * @param {string} message - The error message
     * @param {number} statusCode - HTTP status code
     */
    constructor(message, statusCode) {
        super(message);

        this.statusCode = statusCode;
        // status is 'fail' for 4xx errors and 'error' for 5xx errors
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

        // isOperational means this is a known/expected error (e.g., validation failed, not a crash)
        this.isOperational = true;

        // Capture stack trace, excluding this constructor from it
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
