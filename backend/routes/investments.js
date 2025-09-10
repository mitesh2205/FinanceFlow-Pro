const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/databaseService');
const { authenticateToken } = require('../middleware/auth');
const { validationRules, handleValidationErrors } = require('../middleware/validation');

const db = DatabaseService.getInstance();

// GET /api/investments - Fetch all investments for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const investments = await db.all(
      "SELECT * FROM investments WHERE user_id = ? OR user_id IS NULL ORDER BY symbol",
      [userId]
    );
    res.json(investments);
  } catch (err) {
    console.error('Error fetching investments:', err);
    res.status(500).json({ error: 'Failed to fetch investments' });
  }
});

// POST /api/investments - Add a new investment for the authenticated user
router.post('/', authenticateToken, validationRules.createInvestment, handleValidationErrors, async (req, res) => {
  try {
    const { symbol, name, shares, value, gain_loss } = req.body;

    if (!symbol || !name || shares === undefined || value === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await db.run(
      "INSERT INTO investments (symbol, name, shares, value, gain_loss, user_id) VALUES (?, ?, ?, ?, ?, ?)",
      [symbol, name, shares, value, gain_loss || "0%", req.userId]
    );

    res.json({ 
      id: result.lastID, 
      message: "Investment added successfully" 
    });
  } catch (err) {
    console.error('Error creating investment:', err);
    res.status(500).json({ error: 'Failed to create investment' });
  }
});

// PUT /api/investments/:id - Update existing investment
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { symbol, name, shares, value, gain_loss } = req.body;
    const userId = req.userId;

    if (!symbol || !name || shares === undefined || value === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify investment belongs to user first
    const existing = await db.get(
      'SELECT id FROM investments WHERE id = ? AND (user_id = ? OR user_id IS NULL)',
      [id, userId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Investment not found' });
    }

    await db.run(
      'UPDATE investments SET symbol = ?, name = ?, shares = ?, value = ?, gain_loss = ? WHERE id = ?',
      [symbol, name, shares, value, gain_loss || "0%", id]
    );

    res.json({ message: "Investment updated successfully" });
  } catch (err) {
    console.error('Error updating investment:', err);
    res.status(500).json({ error: 'Failed to update investment' });
  }
});

// DELETE /api/investments/:id - Delete investment (with user verification)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Verify investment belongs to user first
    const existing = await db.get(
      'SELECT id FROM investments WHERE id = ? AND (user_id = ? OR user_id IS NULL)',
      [id, userId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Investment not found' });
    }

    await db.run('DELETE FROM investments WHERE id = ?', [id]);

    res.json({ message: "Investment deleted successfully" });
  } catch (err) {
    console.error('Error deleting investment:', err);
    res.status(500).json({ error: 'Failed to delete investment' });
  }
});

module.exports = router;
