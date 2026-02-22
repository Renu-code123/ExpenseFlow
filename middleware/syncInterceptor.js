/**
 * Sync Interceptor Middleware
 * Issue #730: Extracts device identity and vector clocks from headers.
 * Essential for distributed consensus tracking.
 */

const syncInterceptor = (req, res, next) => {
    // 1. Extract Device ID
    const deviceId = req.headers['x-device-id'] || 'web-browser';

    // 2. Extract Vector Clock (expected as JSON string in header)
    let clientClock = {};
    try {
        const clockHeader = req.headers['x-vector-clock'];
        if (clockHeader) {
            clientClock = JSON.parse(clockHeader);
        }
    } catch (err) {
        console.warn('[SyncInterceptor] Invalid vector clock header format');
    }

    // Attach to request object for use in controllers/services
    req.syncContext = {
        deviceId,
        clientClock
    };

    next();
};

module.exports = syncInterceptor;
