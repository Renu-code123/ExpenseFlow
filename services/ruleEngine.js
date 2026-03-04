const Rule = require('../models/Rule');

class RuleEngine {
    /**
     * Evaluate a transaction against all active rules for a user
     * @param {Object} expenseData The expense data being created
     * @param {string} userId The user ID
     * @returns {Object} Modified expense data after applying rules
     */
    async processTransaction(expenseData, userId) {
        try {
            const workspaceId = expenseData.workspace;

            // Fetch hierarchical rules: Global rules + Workspace rules
            // Prioritize Workspace rules over Global rules if they target the same logic
            let query = { user: userId, isActive: true };
            if (workspaceId) {
                query.$or = [
                    { workspace: workspaceId },
                    { workspace: null, isGlobal: true }
                ];
            } else {
                query.workspace = null;
            }

            const activeRules = await Rule.find(query).sort({ workspace: -1, createdAt: -1 });

            // Filter out global rules that are overridden by workspace-specific rules
            const overriddenRuleIds = activeRules
                .filter(r => r.overridesRule)
                .map(r => r.overridesRule.toString());

            const effectiveRules = activeRules.filter(r =>
                !overriddenRuleIds.includes(r._id.toString())
            );

            let modifiedData = { ...expenseData };
            let appliedRules = [];

            for (const rule of effectiveRules) {
                if (this.evaluateTrigger(rule.trigger, modifiedData)) {
                    modifiedData = this.applyActions(rule.actions, modifiedData);
                    appliedRules.push(rule._id);

                    // Update rule statistics
                    await Rule.findByIdAndUpdate(rule._id, {
                        $inc: { executionCount: 1 },
                        $set: { lastExecuted: new Date() }
                    });
                }
            }

            return { modifiedData, appliedRules };
        } catch (error) {
            console.error('[RuleEngine] Error processing transaction:', error);
            return { modifiedData: expenseData, appliedRules: [] };
        }
    }

    /**
     * Evaluate if a trigger condition is met
     */
    evaluateTrigger(trigger, data) {
        const { field, operator, value } = trigger;
        const fieldValue = data[field];

        if (fieldValue === undefined || fieldValue === null) return false;

        switch (operator) {
            case 'contains':
                return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
            case 'equals':
                return String(fieldValue).toLowerCase() === String(value).toLowerCase();
            case 'greater_than':
                return Number(fieldValue) > Number(value);
            case 'less_than':
                return Number(fieldValue) < Number(value);
            case 'starts_with':
                return String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());
            case 'ends_with':
                return String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase());
            default:
                return false;
        }
    }

    /**
     * Apply rule actions to the expense data
     */
    applyActions(actions, data) {
        const result = { ...data };

        for (const action of actions) {
            switch (action.type) {
                case 'auto_categorize':
                    result.category = action.value;
                    break;
                case 'add_tag':
                    if (!result.tags) result.tags = [];
                    if (!result.tags.includes(action.value)) {
                        result.tags.push(action.value);
                    }
                    break;
                case 'flag_for_review':
                    result.status = 'flagged';
                    result.reviewNote = action.value || 'Flagged by automation rule';
                    break;
                case 'move_to_workspace':
                    result.workspace = action.value;
                    break;
            }
        }

        return result;
    }
}

module.exports = new RuleEngine();
