// remediation-dashboard.js
// Dashboard for remediation tracking and reporting

class RemediationDashboard {
    constructor(scanner, patchDeployment) {
        this.scanner = scanner;
        this.patchDeployment = patchDeployment;
    }

    generateDashboard() {
        const scanResults = this.scanner.getScanResults();
        const patchLog = this.patchDeployment.getPatchLog();
        const dashboard = scanResults.map(result => {
            return {
                endpoint: result.endpoint,
                vulnerabilities: result.vulnerabilities.map(vuln => ({
                    id: vuln.id,
                    severity: vuln.severity,
                    description: vuln.description,
                    patched: vuln.patched,
                    patchTimestamp: this.getPatchTimestamp(patchLog, result.endpoint, vuln.id)
                }))
            };
        });
        return dashboard;
    }

    getPatchTimestamp(patchLog, endpoint, vulnId) {
        const entry = patchLog.find(log => log.endpoint === endpoint && log.vulnerabilityId === vulnId);
        return entry ? entry.timestamp : null;
    }
}

module.exports = RemediationDashboard;
