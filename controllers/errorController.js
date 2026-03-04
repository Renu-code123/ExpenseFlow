const logger = require('../utils/structuredLogger');

/**
 * Error Controller
 * Issue #712: Logic to format error responses based on environment.
 */

/**
 * Send detailed error information in Development
 */
const sendErrorDev = (err, res) => {
    res.status(err.statusCode).json({
        status: err.status,
        error: err,
        message: err.message,
        stack: err.stack,
        requestId: err.requestId  // 👈 ADD THIS
    });
};if (err.isOperational) {
    res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
        requestId: err.requestId  
    });
}

/**
 * Send sanitized error information in Production
 */
const sendErrorProd = (err, res) => {
    // 1. Operational, trusted error: send message to client
    if (err.isOperational) {
        res.status(err.statusCode).json({
            status: err.status,
            message: err.message
        });
    }
    // 2. Programming or unknown error: don't leak details
    else {
        // Log the actual crash details for developers
        logger.critical('CRASH DETECTED', {
            error: err.message,
            stack: err.stack
        });

        res.status(500).json({
    status: 'error',
    message: 'An unexpected internal error occurred. Please try again later.',
    requestId: err.requestId  // 👈 ADD THIS
});
    }
};

module.exports = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    if (process.env.NODE_ENV === 'development') {
        sendErrorDev(err, res);
    } else {
        sendErrorProd(err, res);
    }
};
