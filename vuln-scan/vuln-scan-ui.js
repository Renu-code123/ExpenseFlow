// vuln-scan-ui.js
// CLI demo for Continuous Vulnerability Scanning & Patch Management

const ApiIntegration = require('./api-integration');

function runVulnScanDemo() {
    const apiEndpoints = [
        'https://api.finance.com/v1/accounts',
        'https://api.finance.com/v1/transactions',
        'https://api.finance.com/v1/payments'
    ];
    const apiIntegration = new ApiIntegration(apiEndpoints);
    const dashboard = apiIntegration.runFullScanAndPatch();

    console.log('--- Remediation Dashboard ---');
    dashboard.forEach(entry => {
        console.log(`Endpoint: ${entry.endpoint}`);
        entry.vulnerabilities.forEach(vuln => {
            console.log(`  - ${vuln.id} | ${vuln.severity} | ${vuln.description} | Patched: ${vuln.patched} | Patch Time: ${vuln.patchTimestamp}`);
        });
    });
}

runVulnScanDemo();
