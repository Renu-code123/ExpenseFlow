const remediationRules = require('../utils/remediationRules');
const ValidationLog = require('../models/ValidationLog');
const crypto = require('crypto');


/**
 * Multi-Stage Validation Engine
 * Issue #704: Executes a pipeline of validation and remediation stages.
 */
class ValidationEngine {
    constructor() {
        this.STAGES = {
            SCHEMA: 'schema_verification',
            SEMANTIC: 'semantic_integrity',
            REMEDIATION: 'autonomous_remediation',
            FINAL: 'purity_scoring'
        };
    }

    /**
     * Run the full validation pipeline on a data object.
     */
    async validateAndRemediate(data, userId) {
        const requestId = crypto.randomUUID();
        const log = new ValidationLog({
            userId,
            requestId,
            initialData: { ...data },
            stages: []
        });

        let currentData = { ...data };
        let purityScore = 100;

        try {
            // Stage 1: Basic Schema check (simplified for demo)
            const schemaErrors = this._checkSchema(currentData);
            log.stages.push({
                name: this.STAGES.SCHEMA,
                status: schemaErrors.length === 0 ? 'passed' : 'failed',
                errors: schemaErrors
            });
            if (schemaErrors.length > 0) purityScore -= 20;

            // Stage 2: Semantic Integrity (Logic checks)
            const semanticErrors = this._checkSemantics(currentData);
            log.stages.push({
                name: this.STAGES.SEMANTIC,
                status: semanticErrors.length === 0 ? 'passed' : 'failed',
                errors: semanticErrors
            });
            if (semanticErrors.length > 0) purityScore -= 30;

            // Stage 3: Autonomous Remediation
            const remediationResult = this._applyRemediation(currentData);
            currentData = remediationResult.data;
            log.remediationsApplied = remediationResult.actions;
            log.stages.push({
                name: this.STAGES.REMEDIATION,
                status: remediationResult.actions.length > 0 ? 'remediated' : 'passed'
            });

            purityScore -= (remediationResult.actions.length * 5);

            // Stage 4: Final Scoring
            log.finalData = currentData;
            log.purityScore = Math.max(0, purityScore);
            log.stages.push({
                name: this.STAGES.FINAL,
                status: 'passed'
            });

            await log.save();

            return {
                valid: log.purityScore > 40, // Threshold for rejection
                data: currentData,
                purityScore: log.purityScore,
                requestId
            };

        } catch (error) {
            console.error('[ValidationEngine] Pipeline failure:', error);
            throw error;
        }
    }

    _checkSchema(data) {
        const errors = [];
        if (!data.amount) errors.push('Missing required field: amount');
        if (!data.description) errors.push('Missing required field: description');
        return errors;
    }

    _checkSemantics(data) {
        const errors = [];
        if (data.type === 'expense' && data.amount > 1000000) {
            errors.push('Suspiciously high expense amount (>1M)');
        }
        return errors;
    }

    _applyRemediation(data) {
        const actions = [];
        const remediatedData = { ...data };

        // Amount remediation
        const amountRem = remediationRules.sanitizeAmount(data.amount);
        if (amountRem.remediated) {
            remediatedData.amount = amountRem.value;
            actions.push({ field: 'amount', action: amountRem.action, originalValue: data.amount, newValue: amountRem.value });
        }

        // Currency remediation
        const currRem = remediationRules.sanitizeCurrency(data.originalCurrency);
        if (currRem.remediated) {
            remediatedData.originalCurrency = currRem.value;
            actions.push({ field: 'originalCurrency', action: currRem.action, originalValue: data.originalCurrency, newValue: currRem.value });
        }

        // Date remediation
        const dateRem = remediationRules.boundDate(data.date);
        if (dateRem.remediated) {
            remediatedData.date = dateRem.value;
            actions.push({ field: 'date', action: dateRem.action, originalValue: data.date, newValue: dateRem.value });
        }

        // Merchant remediation
        const merchRem = remediationRules.normalizeMerchant(data.merchant);
        if (merchRem.remediated) {
            remediatedData.merchant = merchRem.value;
            actions.push({ field: 'merchant', action: merchRem.action, originalValue: data.merchant, newValue: merchRem.value });
        }

        return { data: remediatedData, actions };
    }
}

module.exports = new ValidationEngine();
