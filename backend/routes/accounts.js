const express = require('express');
const router = express.Router();
const DatabaseService = require('../services/databaseService');
const { authenticateToken } = require('../middleware/auth');
const { validationRules, handleValidationErrors } = require('../middleware/validation');

const db = DatabaseService.getInstance();

// GET /api/accounts/for-import - Fetch accounts for import dropdown
router.get('/for-import', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const accounts = await db.all(
      "SELECT name, type FROM accounts WHERE user_id = ? OR user_id IS NULL ORDER BY name",
      [userId]
    );
    res.json(accounts);
  } catch (err) {
    console.error('Error fetching accounts for import:', err);
    res.status(500).json({ error: 'Failed to fetch accounts for import' });
  }
});

// GET /api/accounts - Fetch all accounts for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const accounts = await db.all(
      "SELECT * FROM accounts WHERE user_id = ? OR user_id IS NULL ORDER BY id",
      [userId]
    );
    res.json(accounts);
  } catch (err) {
    console.error('Error fetching accounts:', err);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// GET /api/accounts/:id - Get single account (with user verification)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    
    const account = await db.get(
      'SELECT * FROM accounts WHERE id = ? AND (user_id = ? OR user_id IS NULL)',
      [id, userId]
    );
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json(account);
  } catch (err) {
    console.error('Error fetching account:', err);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

// POST /api/accounts - Create a new account for the authenticated user
router.post('/', authenticateToken, validationRules.createAccount, handleValidationErrors, async (req, res) => {
  try {
    const { name, type, balance, institution } = req.body;

    if (!name || !type || balance === undefined || !institution) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await db.run(
      "INSERT INTO accounts (name, type, balance, institution, user_id) VALUES (?, ?, ?, ?, ?)",
      [name, type, balance, institution, req.userId]
    );

    res.json({ 
      id: result.lastID, 
      message: "Account created successfully" 
    });
  } catch (err) {
    console.error('Error creating account:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// PUT /api/accounts/:id - Update account (with user verification)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, balance, institution } = req.body;
    const userId = req.userId;
    
    if (!name || !type || balance === undefined || !institution) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Verify account belongs to user first
    const existing = await db.get(
      'SELECT id FROM accounts WHERE id = ? AND (user_id = ? OR user_id IS NULL)',
      [id, userId]
    );
    
    if (!existing) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    await db.run(
      'UPDATE accounts SET name = ?, type = ?, balance = ?, institution = ? WHERE id = ?',
      [name, type, balance, institution, id]
    );
    
    res.json({ message: "Account updated successfully" });
  } catch (err) {
    console.error('Error updating account:', err);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// DELETE /api/accounts/:id - Delete account (with user verification)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    
    // Verify account belongs to user first
    const existing = await db.get(
      'SELECT id FROM accounts WHERE id = ? AND (user_id = ? OR user_id IS NULL)',
      [id, userId]
    );
    
    if (!existing) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    await db.run('DELETE FROM accounts WHERE id = ?', [id]);
    
    res.json({ message: "Account deleted successfully" });
  } catch (err) {
    console.error('Error deleting account:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;
