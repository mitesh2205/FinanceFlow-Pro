const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database/database.db');

// Get all transactions
router.get('/', (req, res) => {
    db.all('SELECT * FROM transactions ORDER BY date DESC', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get transactions for specific account
router.get('/account/:accountId', (req, res) => {
    db.all(
        'SELECT * FROM transactions WHERE account_id = ? ORDER BY date DESC',
        [req.params.accountId],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows);
        }
    );
});

// Create new transaction
router.post('/', (req, res) => {
    const { date, description, amount, category, account_id } = req.body;
    db.run(
        'INSERT INTO transactions (date, description, amount, category, account_id) VALUES (?, ?, ?, ?, ?)',
        [date, description, amount, category, account_id],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            // Update account balance
            db.run(
                'UPDATE accounts SET balance = balance + ? WHERE id = ?',
                [amount, account_id],
                (err) => {
                    if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                    }
                    res.json({ id: this.lastID });
                }
            );
        }
    );
});

// Delete transaction
router.delete('/:id', (req, res) => {
    // Get transaction details first
    db.get(
        'SELECT amount, account_id FROM transactions WHERE id = ?',
        [req.params.id],
        (err, row) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            // Delete transaction
            db.run('DELETE FROM transactions WHERE id = ?', [req.params.id], (err) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                
                // Update account balance
                db.run(
                    'UPDATE accounts SET balance = balance - ? WHERE id = ?',
                    [row.amount, row.account_id],
                    (err) => {
                        if (err) {
                            res.status(500).json({ error: err.message });
                            return;
                        }
                        res.json({ message: "Transaction deleted successfully" });
                    }
                );
            });
        }
    );
});

module.exports = router;
