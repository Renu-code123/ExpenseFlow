// DLP Middleware: Intercepts outgoing responses
// ...existing code...

const DLPEngine = require('./dlp-engine');
const dlpConfig = require('./dlp-config');
const logDLPEvent = require('./dlp-logger');

const dlpEngine = new DLPEngine(dlpConfig);

function dlpMiddleware(req, res, next) {
    const originalSend = res.send;
    res.send = function (body) {
        const findings = dlpEngine.scanData(typeof body === 'string' ? body : JSON.stringify(body));
        const actions = dlpEngine.evaluatePolicies(findings);
        actions.forEach(action => logDLPEvent(action));
        if (actions.some(a => a.action === 'block')) {
            res.status(403);
            return originalSend.call(this, { error: 'DLP policy violation', details: actions });
        }
        if (actions.some(a => a.action === 'alert')) {
            // Log or alert (implementation below)
            console.log('DLP Alert:', actions);
        }
        return originalSend.call(this, body);
    };
    next();
}

module.exports = dlpMiddleware;
