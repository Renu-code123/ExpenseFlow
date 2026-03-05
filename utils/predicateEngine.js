/**
 * Predicate Engine
 * Issue #780: Boolean logic evaluator for complex policy conditions.
 * Parses JSON AST structures against runtime payloads.
 */
class PredicateEngine {

    /**
     * Evaluate a condition node against context data.
     */
    static evaluate(conditionTree, context) {
        if (!conditionTree || typeof conditionTree !== 'object') return false;

        const operator = conditionTree.op;

        switch (operator) {
            case 'AND':
                return conditionTree.args.every(arg => this.evaluate(arg, context));
            case 'OR':
                return conditionTree.args.some(arg => this.evaluate(arg, context));
            case 'NOT':
                return !this.evaluate(conditionTree.args[0], context);
            case 'EQUALS':
                return this._resolveValue(conditionTree.field, context) === this._resolveValue(conditionTree.value, context);
            case 'GREATER_THAN':
                return this._resolveValue(conditionTree.field, context) > this._resolveValue(conditionTree.value, context);
            case 'LESS_THAN':
                return this._resolveValue(conditionTree.field, context) < this._resolveValue(conditionTree.value, context);
            case 'IN_ARRAY':
                const arr = this._resolveValue(conditionTree.array, context);
                return Array.isArray(arr) && arr.includes(this._resolveValue(conditionTree.field, context));
            case 'ANOMALY_ZSCORE':
                const mathCompliance = require('./mathCompliance');
                const val = this._resolveValue(conditionTree.field, context);
                const hist = this._resolveValue(conditionTree.historyField, context) || [];
                const threshold = conditionTree.threshold || 2.0;
                return mathCompliance.isAnomalous(val, hist, threshold);
            default:
                throw new Error(`Unknown predicate operator: ${operator}`);
        }
    }

    /**
     * Resolves object dot notation strings safely.
     * E.g. 'user.role' -> context.user.role
     */
    static _resolveValue(key, context) {
        if (typeof key !== 'string') return key; // Literal values like numbers/arrays
        if (Array.isArray(key)) return key;

        const path = key.split('.');
        let current = context;

        for (const prop of path) {
            if (current == null) return undefined;
            current = current[prop];
        }

        return current;
    }
}

module.exports = PredicateEngine;
