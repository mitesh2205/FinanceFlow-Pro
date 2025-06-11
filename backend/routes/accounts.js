const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database/database.db');

// Get all accounts
router.get('/', (req, res) => {
    db.all('SELECT * FROM accounts', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get single account
router.get('/:id', (req, res) => {
    db.get('SELECT * FROM accounts WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(row);
    });
});

// Create new account
router.post('/', (req, res) => {
    const { name, type, balance, institution } = req.body;
    db.run(
        'INSERT INTO accounts (name, type, balance, institution) VALUES (?, ?, ?, ?)',
        [name, type, balance, institution],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        }
    );
});

// Update account
router.put('/:id', (req, res) => {
    const { name, type, balance, institution } = req.body;
    db.run(
        'UPDATE accounts SET name = ?, type = ?, balance = ?, institution = ? WHERE id = ?',
        [name, type, balance, institution, req.params.id],
        (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ message: "Account updated successfully" });
        }
    );
});

// Delete account
router.delete('/:id', (req, res) => {
    db.run('DELETE FROM accounts WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: "Account deleted successfully" });
    });
});

module.exports = router;
