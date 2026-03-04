/**
 * Forecast Validator Middleware
 * Issue #678: Validates complex stochastic parameters for simulations.
 */

const { body, validationResult } = require('express-validator');

const validateScenario = [
    body('name').trim().notEmpty().withMessage('Scenario name is required'),
    body('adjustments.incomeChangePct')
        .optional()
        .isFloat({ min: -100, max: 1000 })
        .withMessage('Income change must be between -100% and 1000%'),
    body('adjustments.expenseChangePct')
        .optional()
        .isFloat({ min: -100, max: 1000 })
        .withMessage('Expense change must be between -100% and 1000%'),
    body('config.iterationCount')
        .optional()
        .isInt({ min: 100, max: 5000 })
        .withMessage('Iterations must be between 100 and 5000'),
    body('config.timeHorizonDays')
        .optional()
        .isInt({ min: 7, max: 365 })
        .withMessage('Horizon must be between 7 days and 1 year'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        next();
    }
];

module.exports = { validateScenario };
