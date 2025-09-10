const { body, query, param, validationResult } = require('express-validator');

// Common validation rules
const commonValidation = {
  // Financial amounts
  amount: () => body('amount')
    .isFloat({ min: -999999.99, max: 999999.99 })
    .withMessage('Amount must be a number between -999,999.99 and 999,999.99')
    .customSanitizer(value => Math.round(parseFloat(value) * 100) / 100), // Round to 2 decimal places

  // Dates
  date: (field = 'date') => body(field)
    .isISO8601()
    .withMessage('Date must be in YYYY-MM-DD format')
    .isAfter('1900-01-01')
    .withMessage('Date must be after 1900-01-01')
    .isBefore(new Date(Date.now() + 86400000).toISOString().split('T')[0])
    .withMessage('Date cannot be in the future'),

  // Text fields
  description: (maxLength = 500) => body('description')
    .trim()
    .isLength({ min: 1, max: maxLength })
    .withMessage(`Description must be between 1 and ${maxLength} characters`)
    .escape(), // Prevent XSS

  name: (field = 'name', maxLength = 100) => body(field)
    .trim()
    .isLength({ min: 1, max: maxLength })
    .withMessage(`${field} must be between 1 and ${maxLength} characters`)
    .escape(),

  // Categories - now allows any non-empty string up to 100 characters
  category: () => body('category')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Category must be between 1 and 100 characters')
    .escape(), // Prevent XSS

  // Account types
  accountType: () => body('type')
    .isIn(['checking', 'savings', 'credit', 'investment', 'loan'])
    .withMessage('Invalid account type'),

  // Institution name
  institution: () => body('institution')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Institution name must be between 1 and 100 characters')
    .escape(),

  // IDs
  id: (field = 'id') => param(field)
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer'),

  // Query parameters
  queryDate: (field) => query(field)
    .optional()
    .isISO8601()
    .withMessage(`${field} must be in YYYY-MM-DD format`),

  queryString: (field, maxLength = 100) => query(field)
    .optional()
    .trim()
    .isLength({ max: maxLength })
    .withMessage(`${field} must not exceed ${maxLength} characters`)
    .escape()
};

// Validation rules for different endpoints
const validationRules = {
  // Transaction validation
  createTransaction: [
    commonValidation.date(),
    commonValidation.description(500),
    commonValidation.amount(),
    commonValidation.category(),
    commonValidation.name('account_name', 100)
  ],

  updateTransaction: [
    commonValidation.id(),
    commonValidation.date(),
    commonValidation.description(500),
    commonValidation.amount(),
    commonValidation.category(),
    commonValidation.name('account_name', 100)
  ],

  getTransactions: [
    commonValidation.queryString('category'),
    commonValidation.queryString('account'),
    commonValidation.queryDate('dateFrom'),
    commonValidation.queryDate('dateTo'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
  ],

  // Account validation
  createAccount: [
    commonValidation.name('name', 100),
    commonValidation.accountType(),
    commonValidation.amount().withMessage('Initial balance must be a valid amount'),
    commonValidation.institution()
  ],

  updateAccount: [
    commonValidation.id(),
    commonValidation.name('name', 100),
    commonValidation.accountType(),
    commonValidation.amount().withMessage('Balance must be a valid amount'),
    commonValidation.institution()
  ],

  // Budget validation
  createBudget: [
    commonValidation.category(),
    body('budgeted')
      .isFloat({ min: 0, max: 999999.99 })
      .withMessage('Budget amount must be between 0 and 999,999.99')
      .customSanitizer(value => Math.round(parseFloat(value) * 100) / 100)
  ],

  // Goal validation
  createGoal: [
    commonValidation.name('name', 200),
    body('target')
      .isFloat({ min: 0.01, max: 999999.99 })
      .withMessage('Target amount must be between 0.01 and 999,999.99')
      .customSanitizer(value => Math.round(parseFloat(value) * 100) / 100),
    body('current')
      .optional()
      .isFloat({ min: 0, max: 999999.99 })
      .withMessage('Current amount must be between 0 and 999,999.99')
      .customSanitizer(value => Math.round(parseFloat(value) * 100) / 100),
    body('deadline')
      .optional()
      .isISO8601()
      .withMessage('Deadline must be in YYYY-MM-DD format')
      .isAfter(new Date().toISOString().split('T')[0])
      .withMessage('Deadline must be in the future')
  ],

  updateGoal: [
    commonValidation.id(),
    body('current')
      .isFloat({ min: 0, max: 999999.99 })
      .withMessage('Current amount must be between 0 and 999,999.99')
      .customSanitizer(value => Math.round(parseFloat(value) * 100) / 100)
  ],

  // Investment validation
  createInvestment: [
    body('symbol')
      .trim()
      .isLength({ min: 1, max: 10 })
      .withMessage('Symbol must be between 1 and 10 characters')
      .matches(/^[A-Z0-9.-]+$/i)
      .withMessage('Symbol can only contain letters, numbers, dots, and hyphens'),
    commonValidation.name('name', 200),
    body('shares')
      .isFloat({ min: 0.00001, max: 999999.99 })
      .withMessage('Shares must be between 0.00001 and 999,999.99'),
    body('value')
      .isFloat({ min: 0.01, max: 999999.99 })
      .withMessage('Value must be between 0.01 and 999,999.99'),
    body('gain_loss')
      .optional()
      .matches(/^[+-]?\d+(\.\d{1,2})?%?$/)
      .withMessage('Gain/loss must be in format like "+5.2%" or "-10.5%"')
  ],

  // File upload validation
  uploadValidation: [
    body('accountName')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Account name must be between 1 and 100 characters')
      .escape()
  ],

  // Import transactions validation
  importTransactions: [
    body('accountName')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Account name is required and must not exceed 100 characters'),
    body('transactions')
      .isArray({ min: 1, max: 1000 })
      .withMessage('Transactions must be an array with 1-1000 items'),
    body('transactions.*.date')
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage('Transaction date must be in YYYY-MM-DD format'),
    body('transactions.*.description')
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Transaction description must be between 1 and 500 characters'),
    body('transactions.*.amount')
      .isFloat({ min: -999999.99, max: 999999.99 })
      .withMessage('Transaction amount must be between -999,999.99 and 999,999.99'),
    body('transactions.*.category')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Transaction category must be between 1 and 100 characters')
  ]
};

// Enhanced error handler that provides detailed feedback
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value,
      location: error.location
    }));

    // Log validation errors for debugging
    console.warn('Validation errors:', {
      endpoint: req.originalUrl,
      method: req.method,
      errors: errorDetails,
      body: req.body,
      query: req.query,
      params: req.params
    });

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errorDetails,
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};

// Sanitization middleware for additional security
const sanitizeInput = (req, res, next) => {
  // Remove any potentially dangerous characters from string inputs
  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Remove null bytes and other control characters
        obj[key] = obj[key].replace(/\x00/g, '').trim();
        
        // Limit string length as a safety measure
        if (obj[key].length > 10000) {
          obj[key] = obj[key].substring(0, 10000);
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };

  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  
  if (req.query && typeof req.query === 'object') {
    sanitizeObject(req.query);
  }

  next();
};

module.exports = {
  validationRules,
  handleValidationErrors,
  sanitizeInput,
  commonValidation
};