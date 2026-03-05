const { v4: uuidv4 } = require('uuid');

/**
 * Request Correlation ID Middleware
 * Generates a unique requestId for every incoming HTTP request
 */
function requestContext(req, res, next) {
  const requestId = uuidv4();

  // Attach to request object
  req.requestId = requestId;

  // Attach to response header
  res.setHeader('X-Request-ID', requestId);

  next();
}

module.exports = requestContext;