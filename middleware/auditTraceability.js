const crypto = require('crypto');

/**
 * Audit Traceability Middleware
 * Issue #782: Injecting forensic IDs into every response header.
 * Ensures every API interaction can be linked back to a ledger event.
 */
const auditTraceability = (req, res, next) => {
    // Generate/Extract Forensic Trace ID
    const traceId = req.headers['x-forensic-trace'] || crypto.randomUUID();

    // Attach to request for use in logging/ledger
    req.forensicTraceId = traceId;

    // Inject into response headers for the client
    res.setHeader('X-Forensic-Trace', traceId);
    res.setHeader('X-Audit-Anchor', Buffer.from(traceId).toString('base64').substring(0, 12));

    // Link session to trace for forensic reconstruction
    if (req.session) {
        req.session.lastTraceId = traceId;
    }

    next();
};

module.exports = auditTraceability;
