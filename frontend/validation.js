// Client-side validation helpers
const ValidationHelper = {
  // Validation rules
  rules: {
    required: (value, fieldName) => {
      if (!value || value.toString().trim() === '') {
        return `${fieldName} is required`;
      }
      return null;
    },

    minLength: (value, min, fieldName) => {
      if (value && value.length < min) {
        return `${fieldName} must be at least ${min} characters`;
      }
      return null;
    },

    maxLength: (value, max, fieldName) => {
      if (value && value.length > max) {
        return `${fieldName} must not exceed ${max} characters`;
      }
      return null;
    },

    email: (value, fieldName) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (value && !emailRegex.test(value)) {
        return `${fieldName} must be a valid email address`;
      }
      return null;
    },

    amount: (value, fieldName) => {
      const num = parseFloat(value);
      if (isNaN(num)) {
        return `${fieldName} must be a valid number`;
      }
      if (num < -999999.99 || num > 999999.99) {
        return `${fieldName} must be between -999,999.99 and 999,999.99`;
      }
      if (!/^-?\d+(\.\d{1,2})?$/.test(value.toString())) {
        return `${fieldName} can have at most 2 decimal places`;
      }
      return null;
    },

    positiveAmount: (value, fieldName) => {
      const amountError = ValidationHelper.rules.amount(value, fieldName);
      if (amountError) return amountError;
      
      const num = parseFloat(value);
      if (num <= 0) {
        return `${fieldName} must be greater than 0`;
      }
      return null;
    },

    date: (value, fieldName) => {
      if (!value) return null;
      
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(value)) {
        return `${fieldName} must be in YYYY-MM-DD format`;
      }
      
      const date = new Date(value);
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today
      
      if (isNaN(date.getTime())) {
        return `${fieldName} is not a valid date`;
      }
      
      if (date.getFullYear() < 1900) {
        return `${fieldName} must be after 1900`;
      }
      
      if (date > today) {
        return `${fieldName} cannot be in the future`;
      }
      
      return null;
    },

    futureDate: (value, fieldName) => {
      if (!value) return null;
      
      const dateError = ValidationHelper.rules.date(value, fieldName);
      if (dateError && !dateError.includes('cannot be in the future')) {
        return dateError;
      }
      
      const date = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      
      if (date <= today) {
        return `${fieldName} must be in the future`;
      }
      
      return null;
    },

    category: (value, fieldName) => {
      const validCategories = [
        'Food & Dining', 'Transportation', 'Entertainment', 'Bills & Utilities',
        'Shopping', 'Healthcare', 'Education', 'Travel', 'Income', 'Transfer'
      ];
      
      if (value && !validCategories.includes(value)) {
        return `${fieldName} must be a valid category`;
      }
      return null;
    },

    accountType: (value, fieldName) => {
      const validTypes = ['checking', 'savings', 'credit', 'investment', 'loan'];
      if (value && !validTypes.includes(value)) {
        return `${fieldName} must be a valid account type`;
      }
      return null;
    },

    password: (value, fieldName) => {
      if (!value) return null;
      
      if (value.length < 8) {
        return `${fieldName} must be at least 8 characters`;
      }
      
      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(value)) {
        return `${fieldName} must contain uppercase, lowercase, number, and special character`;
      }
      
      return null;
    },

    confirmPassword: (value, originalPassword, fieldName) => {
      if (value !== originalPassword) {
        return `${fieldName} does not match`;
      }
      return null;
    },

    stockSymbol: (value, fieldName) => {
      if (!value) return null;
      
      if (!/^[A-Z0-9.-]{1,10}$/i.test(value)) {
        return `${fieldName} can only contain letters, numbers, dots, and hyphens (1-10 characters)`;
      }
      return null;
    }
  },

  // Form validation
  validateForm: (formData, validationSchema) => {
    const errors = {};
    let hasErrors = false;

    for (const [fieldName, rules] of Object.entries(validationSchema)) {
      const value = formData[fieldName];
      
      for (const rule of rules) {
        let error = null;
        
        if (typeof rule === 'function') {
          error = rule(value, fieldName);
        } else if (typeof rule === 'object') {
          const { type, ...params } = rule;
          if (ValidationHelper.rules[type]) {
            error = ValidationHelper.rules[type](value, ...Object.values(params), fieldName);
          }
        }
        
        if (error) {
          errors[fieldName] = error;
          hasErrors = true;
          break; // Stop at first error for this field
        }
      }
    }

    return { isValid: !hasErrors, errors };
  },

  // Real-time field validation
  validateField: (fieldElement, rules) => {
    const value = fieldElement.value;
    const fieldName = fieldElement.getAttribute('data-field-name') || 
                     fieldElement.name || 
                     fieldElement.id || 
                     'Field';

    for (const rule of rules) {
      let error = null;
      
      if (typeof rule === 'function') {
        error = rule(value, fieldName);
      } else if (typeof rule === 'object') {
        const { type, ...params } = rule;
        if (ValidationHelper.rules[type]) {
          error = ValidationHelper.rules[type](value, ...Object.values(params), fieldName);
        }
      }
      
      if (error) {
        ValidationHelper.showFieldError(fieldElement, error);
        return false;
      }
    }
    
    ValidationHelper.clearFieldError(fieldElement);
    return true;
  },

  // UI helpers
  showFieldError: (fieldElement, message) => {
    ValidationHelper.clearFieldError(fieldElement);
    
    fieldElement.classList.add('error');
    
    const errorElement = document.createElement('div');
    errorElement.className = 'field-error';
    errorElement.textContent = message;
    errorElement.style.color = 'var(--color-error)';
    errorElement.style.fontSize = 'var(--font-size-xs)';
    errorElement.style.marginTop = '4px';
    
    fieldElement.parentNode.appendChild(errorElement);
  },

  clearFieldError: (fieldElement) => {
    fieldElement.classList.remove('error');
    
    const existingError = fieldElement.parentNode.querySelector('.field-error');
    if (existingError) {
      existingError.remove();
    }
  },

  clearAllErrors: (formElement) => {
    const errorElements = formElement.querySelectorAll('.field-error');
    errorElements.forEach(el => el.remove());
    
    const errorFields = formElement.querySelectorAll('.error');
    errorFields.forEach(field => field.classList.remove('error'));
  },

  // Setup real-time validation for a form
  setupFormValidation: (formElement, validationSchema) => {
    Object.keys(validationSchema).forEach(fieldName => {
      const fieldElement = formElement.querySelector(`[name="${fieldName}"], #${fieldName}`);
      if (fieldElement) {
        fieldElement.addEventListener('blur', () => {
          ValidationHelper.validateField(fieldElement, validationSchema[fieldName]);
        });
        
        fieldElement.addEventListener('input', () => {
          // Clear error on input, re-validate on blur
          ValidationHelper.clearFieldError(fieldElement);
        });
      }
    });
  },

  // Sanitize input values
  sanitize: {
    text: (value) => {
      return value ? value.trim().substring(0, 500) : '';
    },
    
    amount: (value) => {
      if (!value) return '';
      const num = parseFloat(value);
      return isNaN(num) ? '' : Math.round(num * 100) / 100;
    },
    
    date: (value) => {
      if (!value) return '';
      const date = new Date(value);
      return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
    }
  }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ValidationHelper;
} else {
  window.ValidationHelper = ValidationHelper;
}