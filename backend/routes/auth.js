const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { generateToken, authenticateToken, handleValidationErrors } = require('../middleware/auth');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();

// Database connection
const dbPath = path.join(__dirname, '..', 'database', 'database.db');
const db = new sqlite3.Database(dbPath);

// Validation rules
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Register endpoint
router.post('/register', registerValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Check if user already exists
    db.get('SELECT id FROM users WHERE email = ?', [email], async (err, existingUser) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({
          success: false,
          message: 'Internal server error'
        });
      }

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }

      try {
        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user
        const stmt = db.prepare(`
          INSERT INTO users (email, password_hash, first_name, last_name)
          VALUES (?, ?, ?, ?)
        `);

        stmt.run([email, passwordHash, firstName, lastName], function(err) {
          if (err) {
            console.error('Error creating user:', err);
            return res.status(500).json({
              success: false,
              message: 'Failed to create user'
            });
          }

          // Generate token
          const token = generateToken(this.lastID);

          res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: {
              token,
              user: {
                id: this.lastID,
                email,
                firstName,
                lastName
              }
            }
          });
        });

        stmt.finalize();
      } catch (hashError) {
        console.error('Password hashing error:', hashError);
        return res.status(500).json({
          success: false,
          message: 'Internal server error'
        });
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Login endpoint
router.post('/login', loginValidation, handleValidationErrors, (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    db.get('SELECT * FROM users WHERE email = ? AND is_active = 1', [email], async (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({
          success: false,
          message: 'Internal server error'
        });
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      try {
        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        if (!isValidPassword) {
          return res.status(401).json({
            success: false,
            message: 'Invalid email or password'
          });
        }

        // Update last login
        db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

        // Generate token
        const token = generateToken(user.id);

        res.json({
          success: true,
          message: 'Login successful',
          data: {
            token,
            user: {
              id: user.id,
              email: user.email,
              firstName: user.first_name,
              lastName: user.last_name
            }
          }
        });
      } catch (passwordError) {
        console.error('Password verification error:', passwordError);
        return res.status(500).json({
          success: false,
          message: 'Internal server error'
        });
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, (req, res) => {
  db.get(
    'SELECT id, email, first_name, last_name, created_at, last_login FROM users WHERE id = ?',
    [req.userId],
    (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({
          success: false,
          message: 'Internal server error'
        });
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            createdAt: user.created_at,
            lastLogin: user.last_login
          }
        }
      });
    }
  );
});

// Logout endpoint (client-side token removal)
router.post('/logout', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful. Please remove the token from client storage.'
  });
});

module.exports = router;