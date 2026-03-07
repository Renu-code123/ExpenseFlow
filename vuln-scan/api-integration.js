// api-integration.js
// Integrates API scanning and reporting for financial APIs

const VulnerabilityScanner = require('./vulnerability-scanner');
const PatchDeployment = require('./patch-deployment');
const RemediationDashboard = require('./remediation-dashboard');

class ApiIntegration {
    constructor(apiEndpoints) {
        this.scanner = new VulnerabilityScanner(apiEndpoints);
        this.patchDeployment = new PatchDeployment(this.scanner);
        this.dashboard = new RemediationDashboard(this.scanner, this.patchDeployment);
    }

    runFullScanAndPatch() {
        this.scanner.scanAll();
        this.patchDeployment.deployPatches();
        return this.dashboard.generateDashboard();
    }
}

module.exports = ApiIntegration;
