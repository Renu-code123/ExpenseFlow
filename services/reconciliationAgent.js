const AuditCorrection = require('../models/AuditCorrection');
const FuzzyMatch = require('../utils/fuzzyMatch');
const ledgerService = require('./ledgerService');
const logger = require('../utils/structuredLogger');

/**
 * ReconciliationAgent Service
 * Issue #910: Core brain for resolving bank-to-ledger discrepancies.
 * Implements "Self-Healing" logic for the immutable ledger.
 */
class ReconciliationAgent {
    /**
     * Audit a workspace and attempt to self-heal discrepancies.
     */
    async reconcileWorkspace(workspaceId, treasuryNodeId) {
        logger.info(`[Reconciliation] Starting audit for workspace: ${workspaceId}`);

        const feedRepository = require('../repositories/feedRepository');
        const bankTransactions = await feedRepository.getExternalTransactions(workspaceId, new Date(Date.now() - 86400000), new Date()); // Last 24h

        const results = {
            analyzed: bankTransactions.length,
            healed: 0,
            flagged: 0
        };

        for (const bankTx of bankTransactions) {
            try {
                const fixNeeded = await this.analyzeDiscrepancy(bankTx, workspaceId);
                if (fixNeeded) {
                    await this.applySelfHealing(fixNeeded, workspaceId, treasuryNodeId);
                    results.healed++;
                }
            } catch (err) {
                logger.error(`[Reconciliation] Failed to analyze TX: ${bankTx._id}`, { error: err.message });
                results.flagged++;
            }
        }

        return results;
    }

    /**
     * Deep analysis of a bank transaction against existing ledger entries.
     */
    async analyzeDiscrepancy(bankTx, workspaceId) {
        const FinancialEvent = require('../models/FinancialEvent');

        // 1. Look for exact match (Amount + Currency + Approx Time)
        const exactMatch = await FinancialEvent.findOne({
            workspaceId,
            'payload.amount': bankTx.payload.amount,
            timestamp: {
                $gte: new Date(bankTx.timestamp.getTime() - 3600000),
                $lte: new Date(bankTx.timestamp.getTime() + 3600000)
            }
        });

        if (exactMatch) return null; // Already reconciled

        // 2. Look for fuzzy match (Amount Match, but merchant differs slightly)
        const candidates = await FinancialEvent.find({
            workspaceId,
            'payload.amount': bankTx.payload.amount
        });

        for (const candidate of candidates) {
            const similarity = FuzzyMatch.calculateSimilarity(
                FuzzyMatch.normalizeMerchant(candidate.payload.merchant),
                FuzzyMatch.normalizeMerchant(bankTx.payload.merchant)
            );

            if (similarity > 0.85) {
                return {
                    type: 'ORPHAN_MATCH',
                    bankTx,
                    ledgerTx: candidate,
                    confidence: similarity
                };
            }
        }

        // 3. If no match found, it's an orphan bank transaction
        return {
            type: 'COMPENSATING_ENTRY',
            bankTx,
            confidence: 0.95
        };
    }

    /**
     * Apply the autonomous fix to the ledger.
     */
    async applySelfHealing(fix, workspaceId, treasuryNodeId) {
        logger.info(`[Reconciliation] Applying self-healing: ${fix.type} for confidence ${fix.confidence}`);

        const correction = await AuditCorrection.create({
            workspaceId,
            treasuryNodeId,
            correctionType: fix.type,
            discrepancyAmount: fix.bankTx.payload.amount,
            affectedEntityId: fix.ledgerTx ? fix.ledgerTx.entityId : null,
            repairConfidence: fix.confidence,
            status: 'APPLIED',
            evidence: {
                bankTransactionId: fix.bankTx._id.toString(),
                matchScore: fix.confidence,
                description: `Auto-reconciled via ${fix.type}`
            }
        });

        // Record the compensating event in the immutable ledger
        await ledgerService.recordEvent(
            correction._id,
            'LEDGER_CORRECTION',
            {
                correctionId: correction._id,
                amount: fix.bankTx.payload.amount,
                type: fix.type
            },
            'SYSTEM',
            workspaceId,
            fix.ledgerTx ? fix.ledgerTx._id : null,
            'RECONCILIATION_NODE'
        );

        return correction;
    }
}

module.exports = new ReconciliationAgent();
