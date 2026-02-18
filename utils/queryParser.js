/**
 * Smart Query Parser
 * Issue #634: Interprets natural language and operators in search strings
 */

class QueryParser {
    /**
     * Parse a search string into a structured query object for MongoDB
     * @param {string} searchString - e.g., "category:food >500 apple"
     * @returns {Object} MongoDB query object
     */
    parse(searchString) {
        if (!searchString) return {};

        const query = {};
        const filters = [];

        // Regular expressions for different patterns
        const categoryRegex = /category:([a-zA-Z0-9_]+)/i;
        const amountRegex = /([<>]=?)([0-9]+(?:\.[0-9]+)?)/;
        const dateRegex = /date:(today|yesterday|this-week|last-week|this-month|last-month)/i;
        const merchantRegex = /merchant:([a-zA-Z0-9_\s]+)(?=\s|$)/i;

        let remainingString = searchString;

        // 1. Extract category filter
        const categoryMatch = remainingString.match(categoryRegex);
        if (categoryMatch) {
            query.category = categoryMatch[1].toLowerCase();
            remainingString = remainingString.replace(categoryMatch[0], '');
        }

        // 2. Extract amount filters
        const amountMatch = remainingString.match(amountRegex);
        if (amountMatch) {
            const operator = amountMatch[1];
            const value = parseFloat(amountMatch[2]);

            const mongoOp = this._getMongoOperator(operator);
            query.amount = query.amount || {};
            query.amount[mongoOp] = value;

            remainingString = remainingString.replace(amountMatch[0], '');
        }

        // 3. Extract date presets
        const dateMatch = remainingString.match(dateRegex);
        if (dateMatch) {
            const dateRange = this._getDateRange(dateMatch[1].toLowerCase());
            if (dateRange) {
                query.date = { $gte: dateRange.start, $lte: dateRange.end };
            }
            remainingString = remainingString.replace(dateMatch[0], '');
        }

        // 4. Extract merchant specific filter
        const merchantMatch = remainingString.match(merchantRegex);
        if (merchantMatch) {
            query.merchant = new RegExp(merchantMatch[1].trim(), 'i');
            remainingString = remainingString.replace(merchantMatch[0], '');
        }

        // 5. Remaining text is used for text search
        const textSearch = remainingString.trim();
        if (textSearch) {
            query.$text = { $search: textSearch };
        }

        return query;
    }

    _getMongoOperator(op) {
        const map = {
            '>': '$gt',
            '>=': '$gte',
            '<': '$lt',
            '<=': '$lte',
            '=': '$eq'
        };
        return map[op] || '$eq';
    }

    _getDateRange(preset) {
        const now = new Date();
        const start = new Date();
        const end = new Date();

        switch (preset) {
            case 'today':
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'yesterday':
                start.setDate(now.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                end.setDate(now.getDate() - 1);
                end.setHours(23, 59, 59, 999);
                break;
            case 'this-week':
                const dayOfWeek = now.getDay();
                start.setDate(now.getDate() - dayOfWeek);
                start.setHours(0, 0, 0, 0);
                break;
            case 'last-week':
                const lastWeekStart = new Date();
                lastWeekStart.setDate(now.getDate() - now.getDay() - 7);
                lastWeekStart.setHours(0, 0, 0, 0);
                const lastWeekEnd = new Date();
                lastWeekEnd.setDate(now.getDate() - now.getDay() - 1);
                lastWeekEnd.setHours(23, 59, 59, 999);
                return { start: lastWeekStart, end: lastWeekEnd };
            case 'this-month':
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                break;
            case 'last-month':
                start.setMonth(now.getMonth() - 1);
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
                lastDay.setHours(23, 59, 59, 999);
                return { start, end: lastDay };
            default:
                return null;
        }
        return { start, end };
    }
}

module.exports = new QueryParser();
