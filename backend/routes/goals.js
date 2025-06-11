const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database/database.db');

// Get all goals
router.get('/', (req, res) => {
    db.all('SELECT * FROM goals ORDER BY deadline ASC', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Create new goal
router.post('/', (req, res) => {
    const { name, target, current, deadline } = req.body;
    db.run(
        'INSERT INTO goals (name, target, current, deadline) VALUES (?, ?, ?, ?)',
        [name, target, current || 0, deadline],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        }
    );
});

// Update goal progress
router.put('/:id/progress', (req, res) => {
    const { current } = req.body;
    db.run(
        'UPDATE goals SET current = ? WHERE id = ?',
        [current, req.params.id],
        (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ message: "Goal progress updated successfully" });
        }
    );
});

// Delete goal
router.delete('/:id', (req, res) => {
    db.run('DELETE FROM goals WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: "Goal deleted successfully" });
    });
});

module.exports = router;
