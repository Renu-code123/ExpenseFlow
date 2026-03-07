// DLP Utilities: Helper functions for sensitive data detection
// ...existing code...

function maskSensitiveData(data, patterns) {
    let masked = data;
    for (const pattern of patterns) {
        const regex = new RegExp(pattern.regex, 'gi');
        masked = masked.replace(regex, '[MASKED]');
    }
    return masked;
}

module.exports = {
    maskSensitiveData,
};
