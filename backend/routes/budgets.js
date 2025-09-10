const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/databaseService');
const { authenticateToken } = require('../middleware/auth');
const { validationRules, handleValidationErrors } = require('../middleware/validation');

const db = DatabaseService.getInstance();

// GET /api/budgets - Fetch all budgets for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const budgets = await db.all(
      "SELECT * FROM budgets WHERE user_id = ? OR user_id IS NULL ORDER BY category",
      [userId]
    );
    res.json(budgets);
  } catch (err) {
    console.error('Error fetching budgets:', err);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

// POST /api/budgets - Create or update a budget for the authenticated user
router.post('/', authenticateToken, validationRules.createBudget, handleValidationErrors, async (req, res) => {
  try {
    const { category, budgeted } = req.body;

    if (!category || budgeted === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await db.run(
      "INSERT OR REPLACE INTO budgets (category, budgeted, spent, remaining, user_id) VALUES (?, ?, 0, ?, ?)",
      [category, budgeted, budgeted, req.userId]
    );

    res.json({ message: "Budget updated successfully" });
  } catch (err) {
    console.error('Error creating/updating budget:', err);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

// PUT /api/budgets/:id - Update existing budget
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { category, budgeted, spent } = req.body;
    const userId = req.userId;

    if (!category || budgeted === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify budget belongs to user first
    const existing = await db.get(
      'SELECT id FROM budgets WHERE id = ? AND (user_id = ? OR user_id IS NULL)',
      [id, userId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    const spentAmount = spent !== undefined ? spent : 0;
    const remaining = budgeted - spentAmount;

    await db.run(
      'UPDATE budgets SET category = ?, budgeted = ?, spent = ?, remaining = ? WHERE id = ?',
      [category, budgeted, spentAmount, remaining, id]
    );

    res.json({ message: "Budget updated successfully" });
  } catch (err) {
    console.error('Error updating budget:', err);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

// DELETE /api/budgets/:id - Delete budget (with user verification)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Verify budget belongs to user first
    const existing = await db.get(
      'SELECT id FROM budgets WHERE id = ? AND (user_id = ? OR user_id IS NULL)',
      [id, userId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    await db.run('DELETE FROM budgets WHERE id = ?', [id]);

    res.json({ message: "Budget deleted successfully" });
  } catch (err) {
    console.error('Error deleting budget:', err);
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

module.exports = router;
