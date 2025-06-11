const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database/database.db');

// Get all budgets for current month
router.get('/', (req, res) => {
    const date = new Date();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    
    db.all(
        'SELECT * FROM budgets WHERE month = ? AND year = ?',
        [month, year],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows);
        }
    );
});

// Create or update budget
router.post('/', (req, res) => {
    const { category, budgeted, month, year } = req.body;
    
    db.run(
        `INSERT INTO budgets (category, budgeted, month, year)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(category) DO UPDATE SET
         budgeted = excluded.budgeted`,
        [category, budgeted, month, year],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        }
    );
});

// Update spent amount
router.put('/:category/spent', (req, res) => {
    const { spent } = req.body;
    db.run(
        'UPDATE budgets SET spent = ? WHERE category = ?',
        [spent, req.params.category],
        (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ message: "Budget spent amount updated successfully" });
        }
    );
});

module.exports = router;
