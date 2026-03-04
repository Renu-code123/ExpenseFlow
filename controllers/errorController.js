const logger = require('../utils/structuredLogger');

/**
 * Error Controller
 * Standardized API Error Response
 */

/**
 * Send detailed error information in Development
 */
const sendErrorDev = (err, res) => {
    res.status(err.statusCode).json({
        success: false,
        code: err.code || "INTERNAL_SERVER_ERROR",
        message: err.message,
        timestamp: new Date().toISOString(),
        requestId: err.requestId,
        stack: err.stack
    });
};

/**
 * Send sanitized error information in Production
 */
const sendErrorProd = (err, res) => {

    if (err.isOperational) {
        res.status(err.statusCode).json({
            success: false,
            code: err.code || "OPERATIONAL_ERROR",
            message: err.message,
            timestamp: new Date().toISOString(),
            requestId: err.requestId
        });

    } else {

        logger.critical('CRASH DETECTED', {
            error: err.message,
            stack: err.stack
        });

        res.status(500).json({
            success: false,
            code: "INTERNAL_SERVER_ERROR",
            message: "An unexpected internal error occurred. Please try again later.",
            timestamp: new Date().toISOString(),
            requestId: err.requestId
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