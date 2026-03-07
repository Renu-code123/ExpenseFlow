// DLP Engine: Core detection and policy evaluation
// ...existing code...

class DLPEngine {
    constructor(config) {
        this.config = config;
        this.patterns = config.patterns || [];
        this.policies = config.policies || [];
    }

    scanData(data) {
        let findings = [];
        for (const pattern of this.patterns) {
            const regex = new RegExp(pattern.regex, 'gi');
            if (regex.test(data)) {
                findings.push({
                    type: pattern.type,
                    match: data.match(regex),
                    severity: pattern.severity || 'medium',
                });
            }
        }
        return findings;
    }

    evaluatePolicies(findings) {
        let actions = [];
        for (const policy of this.policies) {
            for (const finding of findings) {
                if (policy.types.includes(finding.type)) {
                    actions.push({
                        action: policy.action,
                        finding,
                        message: policy.message || 'Policy violation detected',
                    });
                }
            }
        }
        return actions;
    }
}

module.exports = DLPEngine;
