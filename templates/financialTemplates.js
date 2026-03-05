/**
 * Financial Report Templates
 * Issue #659: Layout definitions for PDF, Excel, and Email reports
 */

const templates = {
    monthlySummary: {
        title: (data) => `Monthly Financial Statement - ${data.month}`,
        sections: [
            'Balance Sheet Summary',
            'Spending by Category',
            'Top Merchant Distribution',
            'Daily Cash Flow Chart'
        ],
        getStyles: () => ({
            primaryColor: '#2563eb',
            fontSize: '12pt',
            fontFamily: 'Helvetica'
        })
    },
    taxReport: {
        title: (data) => `Tax Liability Estimate - Q${data.quarter} ${data.year}`,
        sections: [
            'Audit Trail Integrity',
            'Deductible Expenses',
            'Project-Based VAT Summary'
        ],
        getStyles: () => ({
            primaryColor: '#dc2626',
            fontSize: '10pt',
            fontFamily: 'Courier'
        })
    }
};

/**
 * Basic HTML Generator for email/PDF conversion fallback
 */
function generateHtml(templateKey, data, stats) {
    const template = templates[templateKey];
    if (!template) throw new Error('Template not found');

    return `
    <html>
      <head>
        <style>
          body { font-family: sans-serif; padding: 40px; }
          .header { border-bottom: 2px solid #333; margin-bottom: 40px; }
          .stat-box { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .stat-item { background: #f4f4f4; padding: 20px; border-radius: 8px; width: 30%; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${template.title(data)}</h1>
        </div>
        <div class="stat-box">
          <div class="stat-item">
            <h3>Total Spent</h3>
            <p>$${stats.totalVolume.toLocaleString()}</p>
          </div>
          <div class="stat-item">
            <h3>Net Cash Flow</h3>
            <p>${stats.netCashFlow >= 0 ? '+' : ''}$${stats.netCashFlow.toLocaleString()}</p>
          </div>
          <div class="stat-item">
             <h3>Tx Count</h3>
             <p>${stats.count}</p>
          </div>
        </div>
        <h2>Category Breakdown</h2>
        <ul>
          ${Object.entries(stats.byCategory).map(([cat, val]) => `<li>${cat}: $${val.toLocaleString()}</li>`).join('')}
        </ul>
      </body>
    </html>
  `;
}

module.exports = { generateHtml, templates };
