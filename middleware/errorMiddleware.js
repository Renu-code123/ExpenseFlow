const ResponseFactory = require('../utils/ResponseFactory');
const { AppError } = require('../utils/AppError');

/**
 * Global Error Handler Middleware
 * Handles both operational and programming errors
 */
const errorHandler = (err, req, res, next) => {
    // Log error for debugging
    console.error('[Error Handler]:', {
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userId: req.user?._id
    });

    // Handle Mongoose Validation Errors
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(e => ({
            field: e.path,
            message: e.message
        }));
        return ResponseFactory.validationError(res, errors, 'Validation failed');
    }

    // Handle Mongoose Cast Errors (Invalid ObjectId)
    if (err.name === 'CastError') {
        return ResponseFactory.badRequest(res, `Invalid ${err.path}: ${err.value}`);
    }

    // Handle Mongoose Duplicate Key Errors
    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        return ResponseFactory.conflict(res, `${field} already exists`);
    }

    // Handle JWT Errors
    if (err.name === 'JsonWebTokenError') {
        return ResponseFactory.unauthorized(res, 'Invalid token');
    }

    if (err.name === 'TokenExpiredError') {
        return ResponseFactory.unauthorized(res, 'Token expired');
    }

    // Handle Joi Validation Errors
    if (err.isJoi) {
        const errors = err.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
        }));
        return ResponseFactory.validationError(res, errors);
    }

    // Handle Custom AppError
    if (err instanceof AppError) {
        if (err.errors) {
            return ResponseFactory.error(res, err.message, err.statusCode, err.errors);
        }
        return ResponseFactory.error(res, err.message, err.statusCode);
    }

    // Handle Multer Errors (File Upload)
    if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return ResponseFactory.badRequest(res, 'File size too large');
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return ResponseFactory.badRequest(res, 'Unexpected file field');
        }
        return ResponseFactory.badRequest(res, err.message);
    }

    // Programming/Unknown Errors (500)
    if (process.env.NODE_ENV === 'production') {
        return ResponseFactory.internalError(res, 'Something went wrong');
    } else {
        return ResponseFactory.internalError(res, err.message, err);
    }
};

/**
 * Handle 404 - Not Found
 */
const notFoundHandler = (req, res, next) => {
    ResponseFactory.notFound(res, `Cannot ${req.method} ${req.originalUrl}`);
};

/**
 * Async Error Wrapper
 * Eliminates need for try-catch in async route handlers
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncHandler
};
