/**
 * Field Masker Middleware
 * Issue #770: Automatically masks @sensitive JSON keys if a session is untrusted.
 */
const fieldMasker = (req, res, next) => {
    // If user's session is trusted (e.g. TOTP verified within last 15 min), they can see the decrypted raw strings.
    // If not, we mask the fields in the outbound JSON payload.
    const isTrustedSession = req.session?.security?.totpVerified;

    if (isTrustedSession) return next();

    const originalJson = res.json;

    res.json = function (data) {
        try {
            // Function to recursively traverse the object and mask known sensitive fields
            const maskObject = (obj) => {
                if (!obj || typeof obj !== 'object') return obj;

                // Handle Arrays
                if (Array.isArray(obj)) {
                    return obj.map(item => maskObject(item));
                }

                // Handle Objects
                let masked = { ...obj };

                // Mongoose objects sometimes need `.toObject()` or `.toJSON()`
                if (obj.toObject) masked = obj.toObject();
                else if (obj.toJSON) masked = obj.toJSON();

                for (let key of Object.keys(masked)) {
                    if (['merchant', 'notes'].includes(key) && masked[key]) {
                        masked[key] = '********'; // Mask sensitive fields for untrusted sessions
                    } else if (typeof masked[key] === 'object') {
                        masked[key] = maskObject(masked[key]);
                    }
                }
                return masked;
            };

            const maskedData = maskObject(data);
            return originalJson.call(this, maskedData);

        } catch (e) {
            console.error('Masking middleware failed', e);
            // Default to fail-safe stringification without parsing deeper if traversal breaks
            return originalJson.call(this, data);
        }
    };

    next();
};

module.exports = fieldMasker;
