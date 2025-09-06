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
        // Format dates consistently using UTC to avoid timezone issues
        const formattedRows = rows.map(row => {
            // Parse the date in UTC
            const date = new Date(row.date + 'T00:00:00Z');
            // Create UTC year, month, day values
            const year = date.getUTCFullYear();
            const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(date);
            const day = date.getUTCDate();
            
            return {
                ...row,
                date: `${month} ${day}, ${year}`
            };
        });
        res.json(formattedRows);
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
            // Format dates consistently
            const formattedRows = rows.map(row => ({
                ...row,
                date: new Date(row.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                })
            }));
            res.json(formattedRows);
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

// Learn category from user edit
router.post('/learn-category', (req, res) => {
    const { descriptionSubstring, category } = req.body;
    
    if (!descriptionSubstring || !category) {
        return res.status(400).json({ error: 'Missing description substring or category.' });
    }

    db.run(
        `INSERT INTO merchant_category_map (description_substring, category)
         VALUES (?, ?)
         ON CONFLICT(description_substring) DO UPDATE SET category = excluded.category`,
        [descriptionSubstring, category],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ message: 'Learning updated', id: this.lastID });
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
