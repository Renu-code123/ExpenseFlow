/**
 * Response Factory
 * Issue #712: Standardizes all API responses using the JSend specification.
 * Eliminates ad-hoc JSON structures across the codebase.
 */
class ResponseFactory {
    /**
     * Send a success response
     */
    static success(res, data, statusCode = 200, message = null) {
        return res.status(statusCode).json({
            status: 'success',
            message,
            data
        });
    }

    /**
     * Send a failure response (mostly for client errors like 4xx)
     */
    static fail(res, data, statusCode = 400) {
        return res.status(statusCode).json({
            status: 'fail',
            data
        });
    }

    /**
     * Send an error response (mostly for server errors like 5xx)
     */
    static error(res, message, statusCode = 500, code = null) {
        return res.status(statusCode).json({
            status: 'error',
            message,
            code
        });
    }
}

module.exports = ResponseFactory;
