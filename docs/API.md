# FinanceFlow Pro API Documentation

Base URL: `http://localhost:3001/api`

## 🔍 Health Check

### GET /health
Check if the API server is running.

**Response:**
```json
{
  "status": "OK",
  "message": "FinanceFlow Pro API is running"
}
```

## 🏦 Accounts API

### GET /accounts
Get all user accounts.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Chase Checking",
    "type": "checking",
    "balance": 4250.67,
    "institution": "Chase Bank",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
]
```

### POST /accounts
Create a new account.

**Request Body:**
```json
{
  "name": "New Account",
  "type": "savings",
  "balance": 1000.00,
  "institution": "Bank Name"
}
```

**Response:**
```json
{
  "id": 5,
  "message": "Account created successfully"
}
```

## 💳 Transactions API

### GET /transactions
Get all transactions with optional filtering.

**Query Parameters:**
- `category` (optional) - Filter by category
- `account` (optional) - Filter by account name
- `dateFrom` (optional) - Filter from date (YYYY-MM-DD)
- `dateTo` (optional) - Filter to date (YYYY-MM-DD)

**Example:**
```
GET /transactions?category=Food%20%26%20Dining&dateFrom=2024-01-01
```

**Response:**
```json
[
  {
    "id": 1,
    "date": "2024-06-08",
    "description": "Grocery Store",
    "amount": -89.45,
    "category": "Food & Dining",
    "account_name": "Chase Checking",
    "created_at": "2024-06-08T00:00:00.000Z"
  }
]
```

### POST /transactions
Add a new transaction.

**Request Body:**
```json
{
  "date": "2024-06-10",
  "description": "Coffee Shop",
  "amount": -5.99,
  "category": "Food & Dining",
  "account_name": "Chase Checking"
}
```

**Response:**
```json
{
  "id": 11,
  "message": "Transaction added successfully"
}
```

### DELETE /transactions/:id
Delete a transaction by ID.

**Response:**
```json
{
  "message": "Transaction deleted successfully"
}
```

## 📊 Budgets API

### GET /budgets
Get all budget categories.

**Response:**
```json
[
  {
    "id": 1,
    "category": "Food & Dining",
    "budgeted": 600.00,
    "spent": 456.78,
    "remaining": 143.22
  }
]
```

### POST /budgets
Create or update a budget category.

**Request Body:**
```json
{
  "category": "Entertainment",
  "budgeted": 200.00
}
```

**Response:**
```json
{
  "message": "Budget updated successfully"
}
```

## 🎯 Goals API

### GET /goals
Get all savings goals.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Emergency Fund",
    "target": 10000.00,
    "current": 7500.00,
    "deadline": "2024-12-31",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
]
```

### POST /goals
Create a new savings goal.

**Request Body:**
```json
{
  "name": "Vacation Fund",
  "target": 5000.00,
  "current": 0,
  "deadline": "2024-08-15"
}
```

**Response:**
```json
{
  "id": 4,
  "message": "Goal created successfully"
}
```

### PUT /goals/:id
Update goal progress.

**Request Body:**
```json
{
  "current": 8000.00
}
```

**Response:**
```json
{
  "message": "Goal updated successfully"
}
```

## 📈 Investments API

### GET /investments
Get investment portfolio.

**Response:**
```json
[
  {
    "id": 1,
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "shares": 50,
    "value": 8750.00,
    "gain_loss": "+12.5%"
  }
]
```

## 📊 Dashboard API

### GET /dashboard
Get dashboard summary data.

**Response:**
```json
{
  "total_balance": 44646.67,
  "monthly_income": 3500.00,
  "monthly_expenses": 2850.00,
  "savings_rate": 18.6,
  "monthly_data": [
    {
      "month": "Jan",
      "income": 3500,
      "expenses": 2800,
      "savings": 700
    }
  ]
}
```

## 🚨 Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "error": "Invalid request data"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

## 📝 Request/Response Notes

### Content-Type
All requests and responses use `application/json` content type.

### Date Format
All dates should be in `YYYY-MM-DD` format.

### Currency
All monetary amounts are in USD as decimal numbers.

### Boolean Values
Use `true`/`false` for boolean values.

## 🔐 Authentication

**Current:** No authentication required (single-user app)

**Future:** JWT token-based authentication
```
Authorization: Bearer <jwt-token>
```

## 📊 Rate Limiting

**Current:** No rate limiting

**Future:** 
- 100 requests per minute per IP
- 1000 requests per hour per user

## 🌐 CORS

API accepts requests from: `http://localhost:8000`

For production, update CORS settings in server configuration.

## 📋 Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `404` - Not Found
- `500` - Internal Server Error

## 🧪 Testing Examples

### Using curl

```bash
# Health check
curl http://localhost:3001/api/health

# Get all transactions
curl http://localhost:3001/api/transactions

# Add a transaction
curl -X POST http://localhost:3001/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-06-10",
    "description": "Test Transaction",
    "amount": -10.00,
    "category": "Food & Dining",
    "account_name": "Chase Checking"
  }'

# Get filtered transactions
curl "http://localhost:3001/api/transactions?category=Food%20%26%20Dining"
```

### Using JavaScript (Frontend)

```javascript
// Get transactions
const response = await fetch('http://localhost:3001/api/transactions');
const transactions = await response.json();

// Add transaction
const response = await fetch('http://localhost:3001/api/transactions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    date: '2024-06-10',
    description: 'Test Transaction',
    amount: -10.00,
    category: 'Food & Dining',
    account_name: 'Chase Checking'
  })
});
```