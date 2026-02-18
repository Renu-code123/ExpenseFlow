const { body, validationResult } = require('express-validator');

/**
 * Transaction Validation Middleware
 * Issue #628: Moves validation out of routes into a dedicated middleware
 */

exports.validateTransaction = [
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be at least 0.01'),
    body('description').notEmpty().trim().isLength({ max: 100 }).withMessage('Description is required (max 100 chars)'),
    body('category').notEmpty().withMessage('Category is required'),
    body('type').isIn(['income', 'expense', 'transfer']).withMessage('Invalid transaction type'),
    body('originalCurrency').optional().isLength({ min: 3, max: 3 }).uppercase().withMessage('Currency must be 3-letter ISO code'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
                code: 'VALIDATION_FAILED'
            });
        }
        next();
    }
];
