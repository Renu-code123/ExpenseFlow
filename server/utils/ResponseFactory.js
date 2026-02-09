/**
 * ResponseFactory - Standardized API Response Utility
 * Ensures consistent response format across all endpoints
 */
class ResponseFactory {
    /**
     * Success Response
     * @param {Object} res - Express response object
     * @param {*} data - Response data
     * @param {String} message - Optional success message
     * @param {Object} meta - Optional metadata (pagination, etc.)
     * @param {Number} statusCode - HTTP status code (default: 200)
     */
    static success(res, data = null, message = null, meta = null, statusCode = 200) {
        const response = {
            success: true,
            ...(message && { message }),
            ...(data !== null && { data }),
            ...(meta && { meta })
        };

        return res.status(statusCode).json(response);
    }

    /**
     * Created Response (201)
     * @param {Object} res - Express response object
     * @param {*} data - Created resource data
     * @param {String} message - Optional success message
     */
    static created(res, data, message = 'Resource created successfully') {
        return this.success(res, data, message, null, 201);
    }

    /**
     * No Content Response (204)
     * @param {Object} res - Express response object
     */
    static noContent(res) {
        return res.status(204).send();
    }

    /**
     * Paginated Response
     * @param {Object} res - Express response object
     * @param {Array} data - Array of items
     * @param {Number} page - Current page
     * @param {Number} limit - Items per page
     * @param {Number} total - Total count
     * @param {String} message - Optional message
     */
    static paginated(res, data, page, limit, total, message = null) {
        const meta = {
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        };

        return this.success(res, data, message, meta);
    }

    /**
     * Error Response
     * @param {Object} res - Express response object
     * @param {String} message - Error message
     * @param {Number} statusCode - HTTP status code
     * @param {Array} errors - Optional validation errors
     * @param {String} stack - Optional stack trace (dev only)
     */
    static error(res, message, statusCode = 500, errors = null, stack = null) {
        const response = {
            success: false,
            message,
            ...(errors && { errors }),
            ...(stack && process.env.NODE_ENV !== 'production' && { stack })
        };

        return res.status(statusCode).json(response);
    }

    /**
     * Validation Error Response (422)
     * @param {Object} res - Express response object
     * @param {Array} errors - Validation errors array
     * @param {String} message - Optional message
     */
    static validationError(res, errors, message = 'Validation failed') {
        return this.error(res, message, 422, errors);
    }

    /**
     * Not Found Response (404)
     * @param {Object} res - Express response object
     * @param {String} message - Not found message
     */
    static notFound(res, message = 'Resource not found') {
        return this.error(res, message, 404);
    }

    /**
     * Unauthorized Response (401)
     * @param {Object} res - Express response object
     * @param {String} message - Unauthorized message
     */
    static unauthorized(res, message = 'Unauthorized') {
        return this.error(res, message, 401);
    }

    /**
     * Forbidden Response (403)
     * @param {Object} res - Express response object
     * @param {String} message - Forbidden message
     */
    static forbidden(res, message = 'Forbidden') {
        return this.error(res, message, 403);
    }

    /**
     * Bad Request Response (400)
     * @param {Object} res - Express response object
     * @param {String} message - Bad request message
     */
    static badRequest(res, message = 'Bad request') {
        return this.error(res, message, 400);
    }

    /**
     * Conflict Response (409)
     * @param {Object} res - Express response object
     * @param {String} message - Conflict message
     */
    static conflict(res, message = 'Conflict') {
        return this.error(res, message, 409);
    }

    /**
     * Internal Server Error Response (500)
     * @param {Object} res - Express response object
     * @param {String} message - Error message
     * @param {Error} error - Optional error object
     */
    static internalError(res, message = 'Internal server error', error = null) {
        const stack = error?.stack;
        return this.error(res, message, 500, null, stack);
    }
}

module.exports = ResponseFactory;
