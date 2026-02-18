const { body, query, validationResult } = require('express-validator');

/**
 * Subscription Lifecycle Validator
 * Issue #647: Validates complex subscription structures and transitions
 */

const validateSubscription = [
    body('name').trim().notEmpty().withMessage('Subscription name is required'),
    body('merchant').trim().notEmpty().withMessage('Merchant name is required'),
    body('amount').isNumeric().withMessage('Valid periodic amount is required'),
    body('currency').isString().isLength({ min: 3, max: 3 }).withMessage('Valid ISO currency code required'),
    body('billingCycle').isIn(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semi_annual', 'yearly'])
        .withMessage('Valid billing cycle is required'),
    body('nextPaymentDate').isISO8601().toDate().withMessage('Valid next payment date is required'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        next();
    }
];

const validateForecast = [
    query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        next();
    }
];

module.exports = {
    validateSubscription,
    validateForecast
};
