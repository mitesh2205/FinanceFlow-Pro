const DatabaseService = require('./databaseService');

class CategorizationService {
  constructor() {
    this.merchantCategoryCache = new Map();
  }

  async categorizeTransaction(description, amount = null) {
    // 1. First, try to find a user-mapped category (with caching)
    const cacheKey = description.toLowerCase();
    if (this.merchantCategoryCache.has(cacheKey)) {
      return this.merchantCategoryCache.get(cacheKey);
    }

    try {
      const matching = await databaseService.get(
        "SELECT category FROM merchant_category_map WHERE ? LIKE '%' || description_substring || '%'",
        [description]
      );

      if (matching) {
        this.merchantCategoryCache.set(cacheKey, matching.category);
        return matching.category;
      }
    } catch (error) {
      console.error('Error checking merchant category map:', error);
    }

    // 2. Apply rule-based categorization
    return this.applyCategorizationRules(description, amount);
  }

  applyCategorizationRules(description, amount) {
    const desc = description.toLowerCase();
    
    // Custom user-specific rules (highest priority)
    if (desc.includes('public partnerships llc') || desc.includes('public partnership')) {
      return 'Salary Income';
    }

    // --- IMPROVED TRANSFER AND PAYMENT DETECTION ---
    
    // Credit Card Payments (MUST come before general Transfer detection)
    if ((desc.includes('payment') && (desc.includes('credit card') || desc.includes('autopay') || 
        desc.includes('minimum payment') || desc.includes('cc payment'))) ||
        (desc.includes('payment') && desc.includes('chase') && desc.includes('card')) ||
        (desc.includes('payment') && desc.includes('discover')) ||
        (desc.includes('payment') && desc.includes('citi')) ||
        (desc.includes('payment') && desc.includes('amex')) ||
        desc.includes('credit card payment') || desc.includes('cc autopay')) {
      return 'Credit Card Payment';
    }

    // Bank-to-Bank Transfers (exclude from income)
    if (desc.includes('transfer') || desc.includes('tfrfrom') || desc.includes('tfrto') ||
        desc.includes('internal transfer') || desc.includes('account transfer') ||
        desc.includes('online transfer') || desc.includes('external transfer') ||
        desc.includes('wire transfer') || desc.includes('ach transfer') ||
        (desc.includes('from') && desc.includes('checking')) ||
        (desc.includes('to') && desc.includes('savings'))) {
      return 'Transfer';
    }

    // P2P Payments and Digital Wallets
    if (desc.includes('zelle')) {
      // Self account transfer (Mitesh Chhatbar)
      if (desc.includes('mitesh chhatbar') || desc.includes('mitesh') || desc.includes('chhatbar')) {
        return 'Self Transfer';
      }
      // Other Zelle received amounts -> Splitwise settlement
      else if (amount && amount > 0) {
        return 'Splitwise Settlement';
      }
      // Zelle sent amounts -> general transfer
      else {
        return 'Transfer';
      }
    }

    // Other P2P services
    if (desc.includes('venmo') || desc.includes('cashapp') || desc.includes('paypal transfer') ||
        desc.includes('apple cash') || desc.includes('google pay send')) {
      return 'Transfer';
    }

    // Investment account transfers
    if (desc.includes('robinhood') || desc.includes('apple saving') || 
        desc.includes('vanguard') || desc.includes('fidelity') || desc.includes('schwab')) {
      if (amount && amount > 0) {
        return 'Investment Withdrawal'; // Money coming from investment accounts
      } else {
        return 'Investment'; // Money going to investment accounts
      }
    }

    // --- EXPENSE CATEGORIES ---

    // Food & Dining
    if (desc.includes('restaurant') || desc.includes('cafe') || desc.includes('coffee') ||
        desc.includes('mcdonald') || desc.includes('burger') || desc.includes('pizza') ||
        desc.includes('starbucks') || desc.includes('food') || desc.includes('dining') ||
        desc.includes('bar ') || desc.includes('pub ') || desc.includes('grocery') ||
        desc.includes('supermarket') || desc.includes('safeway') || desc.includes('kroger')) {
      return 'Food & Dining';
    }

    // Transportation
    if (desc.includes('gas ') || desc.includes('fuel') || desc.includes('uber') ||
        desc.includes('lyft') || desc.includes('taxi') || desc.includes('parking') ||
        desc.includes('metro') || desc.includes('transit') || desc.includes('airline') ||
        desc.includes('car wash') || desc.includes('auto ')) {
      return 'Transportation';
    }

    // Shopping
    if (desc.includes('amazon') || desc.includes('walmart') || desc.includes('target') ||
        desc.includes('mall ') || desc.includes('store') || desc.includes('shop') ||
        desc.includes('retail') || desc.includes('clothing') || desc.includes('fashion')) {
      return 'Shopping';
    }

    // Bills & Utilities
    if (desc.includes('electric') || desc.includes('utility') || desc.includes('water') ||
        desc.includes('internet') || desc.includes('phone') || desc.includes('cable') ||
        desc.includes('insurance') || desc.includes('mortgage') || desc.includes('rent')) {
      return 'Bills & Utilities';
    }

    // Entertainment
    if (desc.includes('netflix') || desc.includes('spotify') || desc.includes('movie') ||
        desc.includes('theater') || desc.includes('gaming') || desc.includes('subscription') ||
        desc.includes('entertainment') || desc.includes('music')) {
      return 'Entertainment';
    }

    // Healthcare
    if (desc.includes('pharmacy') || desc.includes('doctor') || desc.includes('medical') ||
        desc.includes('hospital') || desc.includes('health') || desc.includes('dental')) {
      return 'Healthcare';
    }

    // --- IMPROVED INCOME DETECTION (more specific) ---
    // Only categorize as income if it's clearly salary, wages, or business income
    if (desc.includes('salary') || desc.includes('payroll') || desc.includes('wages') ||
        desc.includes('direct deposit') || desc.includes('employer') ||
        desc.includes('freelance') || desc.includes('consulting') ||
        desc.includes('dividend') || desc.includes('interest earned') ||
        desc.includes('bonus') || desc.includes('commission') ||
        (desc.includes('deposit') && (desc.includes('salary') || desc.includes('pay'))) ||
        desc.includes('tax refund') || desc.includes('irs refund') ||
        desc.includes('stimulus') || desc.includes('unemployment')) {
      return 'Income';
    }

    // Generic refunds (not income, but return of spent money)
    if (desc.includes('refund') && !desc.includes('tax refund')) {
      return 'Refund';
    }

    // If amount is positive but doesn't match any income patterns, it's likely a transfer or return
    if (amount && amount > 0) {
      // Check for common non-income positive transactions
      if (desc.includes('return') || desc.includes('credit adjustment') ||
          desc.includes('reversal') || desc.includes('correction')) {
        return 'Refund';
      }
      // If it's a positive amount that doesn't match any clear income pattern, 
      // it's probably a transfer or needs manual categorization
      return 'Uncategorized Income';
    }

    // Default category for expenses
    return 'Shopping';
  }

  async learnCategoryMapping(descriptionSubstring, category) {
    try {
      await databaseService.run(
        `INSERT INTO merchant_category_map (description_substring, category)
         VALUES (?, ?)
         ON CONFLICT(description_substring) DO UPDATE SET category = excluded.category`,
        [descriptionSubstring, category]
      );
      
      // Clear cache to ensure new mapping is used
      this.merchantCategoryCache.clear();
      
      return { success: true, message: 'Category mapping learned successfully' };
    } catch (error) {
      console.error('Error learning category mapping:', error);
      return { success: false, message: 'Failed to learn category mapping' };
    }
  }

  async recategorizeAllTransactions(userId) {
    try {
      // Get all transactions for the user
      const transactions = await databaseService.all(`
        SELECT t.* FROM transactions t 
        LEFT JOIN accounts a ON t.account_name = a.name 
        WHERE (a.user_id = ? OR a.user_id IS NULL)
      `, [userId]);

      console.log(`Found ${transactions.length} transactions to recategorize`);
      
      let updatedCount = 0;
      const errors = [];

      // Process each transaction
      for (const transaction of transactions) {
        try {
          const newCategory = await this.categorizeTransaction(transaction.description, transaction.amount);
          
          // Only update if category changed
          if (newCategory !== transaction.category) {
            await databaseService.run(
              'UPDATE transactions SET category = ? WHERE id = ?', 
              [newCategory, transaction.id]
            );
            
            console.log(`Updated transaction ${transaction.id}: ${transaction.category} -> ${newCategory}`);
            updatedCount++;
          }
        } catch (error) {
          console.error(`Error recategorizing transaction ${transaction.id}:`, error);
          errors.push(`Transaction ${transaction.id}: ${error.message}`);
        }
      }

      console.log(`Recategorization complete: ${updatedCount} transactions updated`);
      
      return {
        success: true,
        updatedCount,
        totalCount: transactions.length,
        errors: errors.slice(0, 5) // Limit error list
      };
      
    } catch (error) {
      console.error('Recategorization error:', error);
      return {
        success: false,
        message: 'Failed to recategorize transactions: ' + error.message
      };
    }
  }

  // Get categories that should be excluded from income calculations
  getIncomeExcludedCategories() {
    return [
      'Transfer', 
      'Self Transfer', 
      'Credit Card Payment', 
      'Investment', 
      'Investment Withdrawal', 
      'Refund', 
      'Uncategorized Income'
    ];
  }

  // Get categories that should be counted as income
  getIncomeCategories() {
    return [
      'Income', 
      'Salary Income', 
      'Splitwise Settlement'
    ];
  }

  clearCache() {
    this.merchantCategoryCache.clear();
  }
}

// Export singleton instance
const categorizationService = new CategorizationService();
module.exports = categorizationService;
