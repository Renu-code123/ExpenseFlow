const AppError = require('../utils/AppError');
const errorController = require('../controllers/errorController');

/**
 * Global Error Handler Middleware
 * Issue #712: Centralized hub for processing all application errors.
 */

const handleCastErrorDB = err => {
    const message = `Invalid ${err.path}: ${err.value}.`;
    return new AppError(message, 400);
};

const handleDuplicateFieldsDB = err => {
    const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
    const message = `Duplicate field value: ${value}. Please use another value!`;
    return new AppError(message, 400);
};

const handleValidationErrorDB = err => {
    const errors = Object.values(err.errors).map(el => el.message);
    const message = `Invalid input data. ${errors.join('. ')}`;
    return new AppError(message, 400);
};

const handleJWTError = () => new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = () => new AppError('Your token has expired! Please log in again.', 401);

module.exports = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;
    error.stack = err.stack;
    error.statusCode = err.statusCode || 500;
    error.status = err.status || 'error';
    error.requestId = req.requestId;

    // Normalize specific DB/JWT errors into AppErrors
    if (err.name === 'CastError') error = handleCastErrorDB(error);
    if (err.code === 11000) error = handleDuplicateFieldsDB(error);
    if (err.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

    errorController(error, req, res, next);
};
