/**
 * PII Masking Engine
 * Issue #679: Redacts sensitive data from logs, exports, and third-party syncs.
 */
class MaskingEngine {
    constructor() {
        this.SENSITIVE_PATTERNS = {
            EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
            PHONE: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
            CREDIT_CARD: /\b(?:\d[ -]*?){13,16}\b/g,
            TAX_ID: /\b\d{3}-\d{2}-\d{4}\b/g // SSN example
        };
    }

    /**
     * Mask a single string based on patterns
     */
    mask(text) {
        if (!text || typeof text !== 'string') return text;

        let masked = text;
        masked = masked.replace(this.SENSITIVE_PATTERNS.EMAIL, '[EMAIL_REDACTED]');
        masked = masked.replace(this.SENSITIVE_PATTERNS.PHONE, '[PHONE_REDACTED]');
        masked = masked.replace(this.SENSITIVE_PATTERNS.CREDIT_CARD, (match) => {
            const last4 = match.slice(-4);
            return `****-****-****-${last4}`;
        });

        return masked;
    }

    /**
     * Deep mask an object for logging or export
     */
    maskObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;

        const masked = Array.isArray(obj) ? [] : {};

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                masked[key] = this.mask(value);
            } else if (typeof value === 'object') {
                masked[key] = this.maskObject(value);
            } else {
                masked[key] = value;
            }
        }

        return masked;
    }

    /**
     * Deterministic Hashing for PII (e.g., to track same customer without knowing identity)
     */
    deterministicHash(data, salt) {
        const crypto = require('crypto');
        return crypto.createHmac('sha256', salt).update(data.toLowerCase().trim()).digest('hex');
    }
}

module.exports = new MaskingEngine();
