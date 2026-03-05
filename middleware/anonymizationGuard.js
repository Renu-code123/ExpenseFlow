/**
 * Anonymization Guard Middleware
 * Issue #844: Stripping PII and sensitive details before data contributes to the aggregation bridge.
 * This ensures that only numeric and non-identifiable data is passed to the ZKPrivacyOrchestrator.
 */
const anonymizationGuard = (req, res, next) => {
    // If the request is for collective benchmarking, intercept the data
    if (req.path.includes('/industry-benchmark/contribute') && req.body) {
        try {
            const sanitizedData = { ...req.body };

            // Explicitly remove PII fields
            const piiFields = ['notes', 'description', 'merchantName', 'merchantId', 'email', 'userId', 'userName'];
            piiFields.forEach(field => delete sanitizedData[field]);

            // Ensure only necessary numeric fields remain
            const allowedNumericFields = ['amount', 'quantity', 'taxAmount'];
            const keys = Object.keys(sanitizedData);

            keys.forEach(key => {
                if (!allowedNumericFields.includes(key)) {
                    delete sanitizedData[key];
                }
            });

            req.sanitizedBenchmarkingData = sanitizedData;
            next();
        } catch (error) {
            console.error('[AnonymizationGuard] Sanitization failure:', error);
            return res.status(400).json({ success: false, message: 'Data sanitization failed for privacy bridge' });
        }
    } else {
        next();
    }
};

module.exports = anonymizationGuard;
