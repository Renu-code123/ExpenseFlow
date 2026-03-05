const Joi = require('joi');

const reimbursementValidationSchema = Joi.object({
  title: Joi.string().trim().max(100).required(),
  description: Joi.string().trim().max(1000).optional(),
  amount: Joi.number().min(0.01).required(),
  originalAmount: Joi.number().min(0.01).optional(),
  originalCurrency: Joi.string().uppercase().default('INR'),
  convertedAmount: Joi.number().min(0.01).optional(),
  exchangeRate: Joi.number().min(0).optional(),
  category: Joi.string().valid('travel', 'meals', 'office_supplies', 'equipment', 'training', 'entertainment', 'transportation', 'accommodation', 'medical', 'other').required(),
  expenseDate: Joi.date().required(),
  payee: Joi.object({
    name: Joi.string().trim().max(100).required(),
    email: Joi.string().trim().max(100).email().optional(),
    employeeId: Joi.string().trim().max(50).optional(),
    department: Joi.string().trim().max(50).optional()
  }).required(),
  status: Joi.string().valid('draft', 'pending', 'under_review', 'approved', 'rejected', 'paid', 'cancelled').default('draft'),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
  dueDate: Joi.date().optional(),
  tags: Joi.array().items(Joi.string().trim().max(30)).optional(),
  projectCode: Joi.string().trim().max(50).optional(),
  clientName: Joi.string().trim().max(100).optional(),
  billable: Joi.boolean().default(false),
  isRecurring: Joi.boolean().default(false),
  recurringFrequency: Joi.string().valid('weekly', 'biweekly', 'monthly', 'quarterly', 'annually').optional(),
  notes: Joi.string().trim().max(1000).optional(),
  internalNotes: Joi.string().trim().max(1000).optional()
});

const reimbursementUpdateSchema = Joi.object({
  title: Joi.string().trim().max(100).optional(),
  description: Joi.string().trim().max(1000).optional(),
  amount: Joi.number().min(0.01).optional(),
  originalAmount: Joi.number().min(0.01).optional(),
  originalCurrency: Joi.string().uppercase().optional(),
  convertedAmount: Joi.number().min(0.01).optional(),
  exchangeRate: Joi.number().min(0).optional(),
  category: Joi.string().valid('travel', 'meals', 'office_supplies', 'equipment', 'training', 'entertainment', 'transportation', 'accommodation', 'medical', 'other').optional(),
  expenseDate: Joi.date().optional(),
  payee: Joi.object({
    name: Joi.string().trim().max(100).optional(),
    email: Joi.string().trim().max(100).email().optional(),
    employeeId: Joi.string().trim().max(50).optional(),
    department: Joi.string().trim().max(50).optional()
  }).optional(),
  status: Joi.string().valid('draft', 'pending', 'under_review', 'approved', 'rejected', 'paid', 'cancelled').optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
  dueDate: Joi.date().optional(),
  tags: Joi.array().items(Joi.string().trim().max(30)).optional(),
  projectCode: Joi.string().trim().max(50).optional(),
  clientName: Joi.string().trim().max(100).optional(),
  billable: Joi.boolean().optional(),
  isRecurring: Joi.boolean().optional(),
  recurringFrequency: Joi.string().valid('weekly', 'biweekly', 'monthly', 'quarterly', 'annually').optional(),
  notes: Joi.string().trim().max(1000).optional(),
  internalNotes: Joi.string().trim().max(1000).optional()
});

const approvalValidationSchema = Joi.object({
  notes: Joi.string().trim().max(500).optional()
});

const rejectionValidationSchema = Joi.object({
  reason: Joi.string().trim().max(500).required()
});

const paymentValidationSchema = Joi.object({
  amount: Joi.number().min(0.01).required(),
  paymentDate: Joi.date().default(Date.now),
  paymentMethod: Joi.string().valid('cash', 'check', 'bank_transfer', 'credit_card', 'debit_card', 'digital_wallet', 'other').default('bank_transfer'),
  transactionId: Joi.string().trim().max(100).optional(),
  notes: Joi.string().trim().max(500).optional()
});

const bulkOperationSchema = Joi.object({
  claimIds: Joi.array().items(Joi.string()).min(1).required(),
  notes: Joi.string().trim().max(500).optional()
});

const reportFilterSchema = Joi.object({
  status: Joi.string().valid('draft', 'pending', 'under_review', 'approved', 'rejected', 'paid', 'cancelled').optional(),
  category: Joi.string().valid('travel', 'meals', 'office_supplies', 'equipment', 'training', 'entertainment', 'transportation', 'accommodation', 'medical', 'other').optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional()
});

const validateReimbursement = (req, res, next) => {
  const { error, value } = reimbursementValidationSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      success: false, 
      error: error.details[0].message 
    });
  }
  req.body = value;
  next();
};

const validateReimbursementUpdate = (req, res, next) => {
  const { error, value } = reimbursementUpdateSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      success: false, 
      error: error.details[0].message 
    });
  }
  req.body = value;
  next();
};

const validateApproval = (req, res, next) => {
  const { error, value } = approvalValidationSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      success: false, 
      error: error.details[0].message 
    });
  }
  req.body = value;
  next();
};

const validateRejection = (req, res, next) => {
  const { error, value } = rejectionValidationSchema.validate(req.body);
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

const validateBulkOperation = (req, res, next) => {
  const { error, value } = bulkOperationSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      success: false, 
      error: error.details[0].message 
    });
  }
  req.body = value;
  next();
};

const validateReportFilter = (req, res, next) => {
  const { error, value } = reportFilterSchema.validate(req.body);
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
  validateReimbursement,
  validateReimbursementUpdate,
  validateApproval,
  validateRejection,
  validatePayment,
  validateBulkOperation,
  validateReportFilter
};
