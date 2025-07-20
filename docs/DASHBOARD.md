# FinanceFlow Pro Dashboard Documentation

## Overview
The dashboard provides a comprehensive view of your financial status by aggregating data from all your connected accounts (checking and credit cards) and displaying key financial metrics.

## Dashboard Components

### 1. Total Balance Overview
The first card shows your net financial position across all accounts.

**Calculation:**
```
Total Balance = Sum of all account balances
  = (Checking Account Balances) - (Credit Card Balances)
```

For example:
- BofA Checking: +$5,000
- Chase Checking: +$3,000
- BofA Credit Card: -$1,000
- Chase Credit Card: -$500
- Apple Card: -$300
Total Balance = ($5,000 + $3,000) - ($1,000 + $500 + $300) = $6,200

### 2. Monthly Income
Shows all incoming money for the last 30 days.

**Includes:**
- Direct deposits
- Refunds
- Transfers in
- Any other credit transactions

**Calculation:**
```sql
SELECT SUM(amount) as total_income 
FROM transactions 
WHERE amount > 0 
AND date >= date('now', '-30 days')
```

### 3. Monthly Expenses
Displays total spending in the last 30 days.

**Includes:**
- Credit card purchases
- Bill payments
- ATM withdrawals
- Any other debit transactions

**Calculation:**
```sql
SELECT SUM(amount) as total_expenses 
FROM transactions 
WHERE amount < 0 
AND date >= date('now', '-30 days')
```
Note: Displayed as a positive number for readability

### 4. Savings Rate
Shows what percentage of your income you're saving.

**Calculation:**
```
Savings Amount = Monthly Income - Monthly Expenses
Savings Rate = (Savings Amount / Monthly Income) × 100
```

Example:
- Monthly Income: $5,000
- Monthly Expenses: $3,500
- Savings Amount: $1,500
- Savings Rate: (1,500 / 5,000) × 100 = 30%

### 5. Monthly Trends Chart
Visualizes your financial patterns over time.

**Features:**
- 6-month rolling view
- Income trend line
- Expense trend line
- Savings visualization

**Data Points:**
- Based on actual transactions where available
- Uses ±10% variation to show realistic patterns
- Helps identify:
  - Income stability
  - Spending patterns
  - Saving opportunities

## Understanding Account Types

### Checking Accounts
- Positive balances indicate available money
- Shown as assets in total balance calculation
- Includes:
  - Bank of America Checking
  - Chase Checking

### Credit Cards
- Negative balances indicate money owed
- Subtracted in total balance calculation
- Includes:
  - Bank of America Credit Card
  - Chase Credit Card
  - Apple Card

## Data Refresh
- Transaction data is updated in real-time when importing statements
- Dashboard calculations refresh automatically when viewing
- Monthly trends update at the end of each month

## Tips for Reading the Dashboard
1. **Net Position**: Total Balance shows your true financial position after accounting for all debts
2. **Spending Patterns**: Monthly Expenses help identify unusual spending months
3. **Saving Progress**: Savings Rate helps track progress toward financial goals
4. **Trends**: Monthly chart helps spot patterns and plan ahead

## Common Questions

### Why might my total balance look different from expected?
- Credit card balances are subtracted from checking balances
- Recent transactions might need to be imported
- Some transactions might be pending

### Why don't I see all my transactions in monthly calculations?
- Monthly figures only include the last 30 days
- Older transactions are still stored but not included in these calculations
- Historical data can be viewed in the transactions section
