const Expense = require('../models/Expense'); // Assuming Expense model exists
const ComplianceRule = require('../models/ComplianceRule');

class ForensicAuditService {
    /**
     * Scan transactions for suspicious tax patterns
     */
    async scanForSuspiciousActivity(userId, startDate, endDate) {
        // Find transactions in period
        // For now, let's assume we are searching the Expense model or Transaction model
        const Transaction = require('../models/Transaction');
        const transactions = await Transaction.find({
            user: userId,
            date: { $gte: startDate, $lte: endDate }
        });

        const findings = [];

        // Pattern 1: Round Amount Tax (Statistical Anomaly)
        const roundAmountTxns = transactions.filter(t => t.taxAmount > 0 && t.taxAmount % 10 === 0 && t.taxAmount % 100 === 0);
        if (roundAmountTxns.length > transactions.length * 0.3) {
            findings.push({
                type: 'TAX_ROUNDING_ANOMALY',
                severity: 'medium',
                message: 'High frequency of round-number tax amounts detected, suggesting manual estimation rather than precise calculation.',
                count: roundAmountTxns.length
            });
        }

        // Pattern 2: Duplicate Tax Claims
        const seenInvoices = new Set();
        const duplicates = [];
        transactions.forEach(t => {
            const key = `${t.merchant}-${t.taxAmount}-${t.date.toISOString().split('T')[0]}`;
            if (seenInvoices.has(key)) {
                duplicates.push(t._id);
            }
            seenInvoices.add(key);
        });

        if (duplicates.length > 0) {
            findings.push({
                type: 'DUPLICATE_TAX_CLAIMS',
                severity: 'high',
                message: 'Potential duplicate tax recovery detected on identical merchant/amount/date combinations.',
                affectedIds: duplicates
            });
        }

        // Pattern 3: Jurisdiction Mismatch
        // (Simplified logic: check if merchant country matches rule jurisdiction)
        for (const t of transactions) {
            if (t.metadata && t.metadata.country) {
                const rule = await ComplianceRule.findOne({ jurisdiction: t.metadata.country, isActive: true });
                if (rule && Math.abs((t.amount * rule.rate / 100) - t.taxAmount) > 5) {
                    findings.push({
                        type: 'RATE_MISMATCH',
                        severity: 'high',
                        transactionId: t._id,
                        message: `Tax rate applied (${((t.taxAmount / t.amount) * 100).toFixed(2)}%) deviates significantly from jurisdictional rate (${rule.rate}%).`
                    });
                }
            }
        }

        return findings;
    }

    /**
     * Generate Comprehensive Audit Pack
     */
    async generateAuditPack(userId, period) {
        const TaxAuditPack = require('../models/TaxAuditPack');
        const auditId = `AUD-${Date.now()}-${userId.toString().substring(0, 4)}`.toUpperCase();

        const findings = await this.scanForSuspiciousActivity(userId, period.start, period.end);

        const pack = new TaxAuditPack({
            userId,
            auditId,
            period,
            status: 'completed',
            statistics: {
                totalTransactions: 0, // Should count actual txns
                totalTaxAmount: 0,
                flaggedAmount: 0,
                forensicFindings: findings.length
            },
            snapshotData: { findings }
        });

        await pack.save();
        return pack;
    }
}

module.exports = new ForensicAuditService();
