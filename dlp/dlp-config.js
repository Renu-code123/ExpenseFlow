// DLP Configuration: Patterns and policies
// ...existing code...

module.exports = {
    patterns: [
        { type: 'email', regex: '[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', severity: 'high' },
        { type: 'ssn', regex: '\b\d{3}-\d{2}-\d{4}\b', severity: 'high' },
        { type: 'credit_card', regex: '\b(?:\d[ -]*?){13,16}\b', severity: 'high' },
        { type: 'phone', regex: '\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b', severity: 'medium' },
        // Add more patterns as needed
    ],
    policies: [
        { types: ['email', 'ssn', 'credit_card'], action: 'block', message: 'Sensitive data detected. Action blocked.' },
        { types: ['phone'], action: 'alert', message: 'Phone number detected. Alert logged.' },
        // Add more policies as needed
    ],
};
