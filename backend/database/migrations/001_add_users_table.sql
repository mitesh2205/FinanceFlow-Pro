-- Migration: Add users table for authentication
-- Created: 2025-09-04

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    email_verified BOOLEAN DEFAULT 0,
    verification_token TEXT,
    reset_password_token TEXT,
    reset_password_expires DATETIME
);

-- Create index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Add user_id foreign key to existing tables
ALTER TABLE accounts ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE budgets ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE goals ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE investments ADD COLUMN user_id INTEGER REFERENCES users(id);

-- Create indexes for user_id foreign keys
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_investments_user_id ON investments(user_id);