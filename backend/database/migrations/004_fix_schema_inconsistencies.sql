-- Migration: Fix database schema inconsistencies
-- Created: 2025-09-10
-- Description: Standardize foreign key relationships and fix data consistency issues

-- 1. Fix transactions table to use proper foreign key to accounts
-- First, add account_id column if it doesn't exist
ALTER TABLE transactions ADD COLUMN account_id INTEGER;

-- Update account_id based on account_name
UPDATE transactions 
SET account_id = (
    SELECT a.id 
    FROM accounts a 
    WHERE a.name = transactions.account_name
)
WHERE account_id IS NULL;

-- Create foreign key constraint (SQLite doesn't support ADD CONSTRAINT, so we need to recreate table)
-- First, create the new transactions table with proper constraints
CREATE TABLE IF NOT EXISTS transactions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    account_name TEXT NOT NULL, -- Keep for backward compatibility during transition
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Copy data from old table to new table
INSERT INTO transactions_new (id, date, description, amount, category, account_id, account_name, created_at)
SELECT id, date, description, amount, category, account_id, account_name, created_at
FROM transactions;

-- Drop old table and rename new table
DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);

-- 2. Ensure all tables have proper user_id relationships
-- Add user_id to merchant_category_map for user-specific mappings
ALTER TABLE merchant_category_map ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_merchant_category_map_user_id ON merchant_category_map(user_id);

-- 3. Add created_at and updated_at timestamps where missing
ALTER TABLE budgets ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE budgets ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- 4. Create a view for easier transaction queries with account information
CREATE VIEW IF NOT EXISTS transactions_with_accounts AS
SELECT 
    t.*,
    a.name as account_name_current,
    a.type as account_type,
    a.institution,
    a.user_id as account_user_id
FROM transactions t
LEFT JOIN accounts a ON t.account_id = a.id;

-- 5. Update any orphaned records (transactions without valid account references)
-- Mark transactions with invalid account references for cleanup
CREATE TABLE IF NOT EXISTS orphaned_transactions AS
SELECT t.* 
FROM transactions t
LEFT JOIN accounts a ON t.account_id = a.id
WHERE a.id IS NULL;

-- Delete orphaned transactions (optional - comment out if you want to keep them)
-- DELETE FROM transactions 
-- WHERE id IN (SELECT id FROM orphaned_transactions);

-- 6. Add constraints and validation
-- Ensure account balances are reasonable (not more than 1 billion)
-- This is a soft constraint via a check that can be added in application logic

-- 7. Create a trigger to automatically update account_name when account is renamed
CREATE TRIGGER IF NOT EXISTS update_transaction_account_name
AFTER UPDATE OF name ON accounts
FOR EACH ROW
BEGIN
    UPDATE transactions 
    SET account_name = NEW.name 
    WHERE account_id = NEW.id;
END;
