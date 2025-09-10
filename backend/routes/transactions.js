const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/databaseService');
const CategorizationService = require('../services/categorizationService');
const { authenticateToken } = require('../middleware/auth');
const { validationRules, handleValidationErrors, commonValidation } = require('../middleware/validation');

const databaseService = DatabaseService.getInstance();
const categorizationService = CategorizationService;

// Initialize database connection
const initializeDatabase = async () => {
  try {
    await databaseService.initialize();
  } catch (error) {
    console.error('Failed to initialize database in transactions routes:', error);
  }
};
initializeDatabase();

// Get all transactions with filtering support
router.get('/', authenticateToken, validationRules.getTransactions, handleValidationErrors, async (req, res) => {
  try {
    const { category, account, dateFrom, dateTo } = req.query;
    let query = "SELECT t.* FROM transactions t LEFT JOIN accounts a ON t.account_name = a.name WHERE (a.user_id = ? OR a.user_id IS NULL)";
    let params = [req.userId];

    if (category) {
      query += " AND t.category = ?";
      params.push(category);
    }
    if (account) {
      query += " AND t.account_name = ?";
      params.push(account);
    }
    if (dateFrom) {
      query += " AND t.date >= ?";
      params.push(dateFrom);
    }
    if (dateTo) {
      query += " AND t.date <= ?";
      params.push(dateTo);
    }

    query += " ORDER BY t.date DESC";

    const rows = await databaseService.all(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get transactions for specific account
router.get('/account/:accountName', authenticateToken, async (req, res) => {
  try {
    const { accountName } = req.params;
    const query = `
      SELECT t.* FROM transactions t 
      LEFT JOIN accounts a ON t.account_name = a.name 
      WHERE t.account_name = ? AND (a.user_id = ? OR a.user_id IS NULL)
      ORDER BY t.date DESC
    `;
    
    const rows = await databaseService.all(query, [accountName, req.userId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching account transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new transaction
router.post('/', authenticateToken, validationRules.createTransaction, handleValidationErrors, async (req, res) => {
  try {
    const { date, description, amount, category, account_name } = req.body;

    if (!date || !description || amount === undefined || !category || !account_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Use transaction to ensure data consistency
    const result = await databaseService.transaction([
      () => databaseService.run(
        'INSERT INTO transactions (date, description, amount, category, account_name) VALUES (?, ?, ?, ?, ?)',
        [date, description, amount, category, account_name]
      ),
      () => databaseService.run(
        'UPDATE accounts SET balance = balance + ? WHERE name = ?',
        [parseFloat(amount), account_name]
      )
    ]);

    // Update budget if it's an expense
    if (parseFloat(amount) < 0) {
      try {
        await databaseService.run(`
          UPDATE budgets SET
            spent = spent + ?,
            remaining = budgeted - spent
          WHERE category = ?
        `, [Math.abs(parseFloat(amount)), category]);
      } catch (budgetError) {
        console.error('Error updating budget:', budgetError);
        // Don't fail the transaction creation if budget update fails
      }
    }

    res.json({ 
      id: result[0].id, 
      message: 'Transaction added successfully' 
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Learn category from user edit
router.post('/learn-category', authenticateToken, async (req, res) => {
  try {
    const { descriptionSubstring, category } = req.body;
    
    if (!descriptionSubstring || !category) {
      return res.status(400).json({ error: 'Missing description substring or category.' });
    }

    const result = await categorizationService.learnCategoryMapping(descriptionSubstring, category);
    
    if (result.success) {
      res.json({ message: result.message });
    } else {
      res.status(500).json({ error: result.message });
    }
  } catch (error) {
    console.error('Error learning category:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete transaction
router.delete('/:id', authenticateToken, [commonValidation.id()], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;

    // First get the transaction and verify it belongs to the user
    const transaction = await databaseService.get(`
      SELECT t.* FROM transactions t 
      LEFT JOIN accounts a ON t.account_name = a.name 
      WHERE t.id = ? AND (a.user_id = ? OR a.user_id IS NULL)
    `, [id, req.userId]);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Delete the transaction and update account balance in a transaction
    await databaseService.transaction([
      () => databaseService.run('DELETE FROM transactions WHERE id = ?', [id]),
      () => databaseService.run(
        'UPDATE accounts SET balance = balance - ? WHERE name = ?',
        [transaction.amount, transaction.account_name]
      )
    ]);

    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
