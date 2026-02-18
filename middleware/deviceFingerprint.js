const crypto = require('crypto');
const DeviceFingerprint = require('../models/DeviceFingerprint');

/**
 * Device Fingerprint Middleware
 * Generates and stores device fingerprint based on request headers
 */

const generateFingerprint = (req) => {
    const components = [
        req.headers['user-agent'] || '',
        req.headers['accept-language'] || '',
        req.headers['sec-ch-ua'] || '',
        req.headers['sec-ch-ua-platform'] || '',
        req.ip || req.connection.remoteAddress || ''
    ];

    return crypto.createHash('sha256').update(components.join('|')).digest('hex');
};

const captureDeviceFingerprint = async (req, res, next) => {
    try {
        const fingerprintHash = generateFingerprint(req);

        // Attach to request for use in routes
        req.deviceFingerprint = {
            hash: fingerprintHash,
            userAgent: req.headers['user-agent'],
            ip: req.ip || req.connection.remoteAddress
        };

        next();
    } catch (error) {
        console.error('Device fingerprint error:', error);
        next();
    }
};

module.exports = { captureDeviceFingerprint, generateFingerprint };
