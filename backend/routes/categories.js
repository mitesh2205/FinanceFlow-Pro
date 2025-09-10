const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/databaseService');
const { authenticateToken } = require('../middleware/auth');

const db = DatabaseService.getInstance();

// GET /api/categories - Dynamic categories based on actual usage
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get all unique categories from user's transactions, plus default categories
    const defaultCategories = [
      "Food & Dining", "Transportation", "Entertainment", "Bills & Utilities",
      "Shopping", "Healthcare", "Education", "Travel", "Income", "Transfer",
      "Salary Income", "Self Transfer", "Splitwise Settlement", "Investment", 
      "Investment Withdrawal"
    ];
    
    const usedCategories = await db.all(
      "SELECT DISTINCT category FROM transactions t LEFT JOIN accounts a ON t.account_name = a.name WHERE (a.user_id = ? OR a.user_id IS NULL) ORDER BY category",
      [userId]
    );

    // Combine default categories with used categories
    const categoryNames = usedCategories.map(row => row.category);
    const allCategories = [...new Set([...defaultCategories, ...categoryNames])];
    allCategories.sort();
    
    res.json(allCategories);
  } catch (err) {
    console.error('Error fetching categories:', err);
    // Fall back to default categories if there's an error
    const defaultCategories = [
      "Food & Dining", "Transportation", "Entertainment", "Bills & Utilities",
      "Shopping", "Healthcare", "Education", "Travel", "Income", "Transfer",
      "Salary Income", "Self Transfer", "Splitwise Settlement", "Investment", 
      "Investment Withdrawal"
    ];
    res.json(defaultCategories);
  }
});

// POST /api/categories - Create a new custom category
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { category } = req.body;
    
    if (!category) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    
    // Note: Categories are implicitly created when used in transactions
    // This endpoint could be used to validate category names or store metadata
    res.json({ message: "Category can be used in transactions", category });
  } catch (err) {
    console.error('Error handling category creation:', err);
    res.status(500).json({ error: 'Failed to process category' });
  }
});

module.exports = router;
