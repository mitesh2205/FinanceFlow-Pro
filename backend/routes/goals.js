const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/databaseService');
const { authenticateToken } = require('../middleware/auth');
const { validationRules, handleValidationErrors, commonValidation } = require('../middleware/validation');

const db = DatabaseService.getInstance();

// GET /api/goals - Fetch all goals for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const goals = await db.all(
      "SELECT * FROM goals WHERE user_id = ? OR user_id IS NULL ORDER BY deadline",
      [userId]
    );
    res.json(goals);
  } catch (err) {
    console.error('Error fetching goals:', err);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

// POST /api/goals - Create a new goal for the authenticated user
router.post('/', authenticateToken, validationRules.createGoal, handleValidationErrors, async (req, res) => {
  try {
    const { name, target, current, deadline } = req.body;

    if (!name || target === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await db.run(
      "INSERT INTO goals (name, target, current, deadline, user_id) VALUES (?, ?, ?, ?, ?)",
      [name, target, current || 0, deadline, req.userId]
    );

    res.json({ 
      id: result.lastID, 
      message: "Goal created successfully" 
    });
  } catch (err) {
    console.error('Error creating goal:', err);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

// PUT /api/goals/:id - Update goal progress for the authenticated user
router.put('/:id', authenticateToken, validationRules.updateGoal, handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const { current } = req.body;
    const userId = req.userId;

    if (current === undefined) {
      return res.status(400).json({ error: 'Current amount is required' });
    }

    // Verify goal belongs to user first
    const existing = await db.get(
      'SELECT id FROM goals WHERE id = ? AND (user_id = ? OR user_id IS NULL)',
      [id, userId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    await db.run(
      "UPDATE goals SET current = ? WHERE id = ?",
      [current, id]
    );

    res.json({ message: "Goal updated successfully" });
  } catch (err) {
    console.error('Error updating goal:', err);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

// DELETE /api/goals/:id - Delete goal (with user verification)
router.delete('/:id', authenticateToken, [commonValidation.id()], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Verify goal belongs to user first
    const existing = await db.get(
      'SELECT id FROM goals WHERE id = ? AND (user_id = ? OR user_id IS NULL)',
      [id, userId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    await db.run('DELETE FROM goals WHERE id = ?', [id]);

    res.json({ message: "Goal deleted successfully" });
  } catch (err) {
    console.error('Error deleting goal:', err);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

module.exports = router;
