const Joi = require('joi');

const debtValidationSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  lender: Joi.string().trim().max(100).required(),
  loanType: Joi.string().valid('personal', 'mortgage', 'auto', 'student', 'credit_card', 'home_equity', 'business', 'medical', 'other').required(),
  principalAmount: Joi.number().min(0.01).required(),
  currentBalance: Joi.number().min(0).required(),
  interestRate: Joi.number().min(0).max(100).required(),
  interestType: Joi.string().valid('simple', 'compound').default('compound'),
  compoundingFrequency: Joi.string().valid('daily', 'monthly', 'quarterly', 'annually').default('monthly'),
  monthlyPayment: Joi.number().min(0.01).required(),
  minimumPayment: Joi.number().min(0.01).optional(),
  startDate: Joi.date().required(),
  maturityDate: Joi.date().required(),
  status: Joi.string().valid('active', 'paid_off', 'defaulted', 'refinanced', 'in_grace_period').default('active'),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
  reminderDays: Joi.number().integer().min(0).max(30).default(3),
  isAutoPay: Joi.boolean().default(false),
  accountNumber: Joi.string().trim().max(50).optional(),
  notes: Joi.string().trim().max(1000).optional(),
  tags: Joi.array().items(Joi.string().trim().max(30)).optional(),
  color: Joi.string().default('#64ffda')
});

const debtUpdateSchema = Joi.object({
  name: Joi.string().trim().max(100).optional(),
  lender: Joi.string().trim().max(100).optional(),
  loanType: Joi.string().valid('personal', 'mortgage', 'auto', 'student', 'credit_card', 'home_equity', 'business', 'medical', 'other').optional(),
  principalAmount: Joi.number().min(0.01).optional(),
  currentBalance: Joi.number().min(0).optional(),
  interestRate: Joi.number().min(0).max(100).optional(),
  interestType: Joi.string().valid('simple', 'compound').optional(),
  compoundingFrequency: Joi.string().valid('daily', 'monthly', 'quarterly', 'annually').optional(),
  monthlyPayment: Joi.number().min(0.01).optional(),
  minimumPayment: Joi.number().min(0.01).optional(),
  startDate: Joi.date().optional(),
  maturityDate: Joi.date().optional(),
  status: Joi.string().valid('active', 'paid_off', 'defaulted', 'refinanced', 'in_grace_period').optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
  reminderDays: Joi.number().integer().min(0).max(30).optional(),
  isAutoPay: Joi.boolean().optional(),
  accountNumber: Joi.string().trim().max(50).optional(),
  notes: Joi.string().trim().max(1000).optional(),
  tags: Joi.array().items(Joi.string().trim().max(30)).optional(),
  color: Joi.string().optional()
});

const paymentValidationSchema = Joi.object({
  amount: Joi.number().min(0.01).required(),
  date: Joi.date().default(Date.now),
  principalPaid: Joi.number().min(0).default(0),
  interestPaid: Joi.number().min(0).default(0),
  paymentMethod: Joi.string().valid('cash', 'check', 'bank_transfer', 'credit_card', 'debit_card', 'auto_draft', 'other').default('bank_transfer'),
  notes: Joi.string().trim().max(500).optional(),
  isExtraPayment: Joi.boolean().default(false)
});

const validateDebt = (req, res, next) => {
  const { error, value } = debtValidationSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      success: false, 
      error: error.details[0].message 
    });
  }
  req.body = value;
  next();
};

const validateDebtUpdate = (req, res, next) => {
  const { error, value } = debtUpdateSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      success: false, 
      error: error.details[0].message 
    });
  }
  req.body = value;
  next();
};

const validatePayment = (req, res, next) => {
  const { error, value } = paymentValidationSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      success: false, 
      error: error.details[0].message 
    });
  }
  req.body = value;
  next();
};

module.exports = {
  validateDebt,
  validateDebtUpdate,
  validatePayment
};
