# Backend - FinanceFlow Pro API

A RESTful API built with Node.js, Express.js, and SQLite for personal finance management.

## 🚀 Quick Start

### Installation
```bash
cd backend
npm install
```

### Start Server
```bash
# Production
npm start

# Development with auto-restart
npm run dev
```

The server will start on `http://localhost:3001`

## 📊 Database

Uses SQLite database with the following tables:
- **accounts** - Bank accounts and balances
- **transactions** - Financial transactions
- **budgets** - Budget categories and limits
- **goals** - Savings goals and progress
- **investments** - Investment holdings

### Database File
- Location: `./database/database.db`
- Created automatically on first run
- Sample data inserted automatically

## 🔌 API Endpoints

### Health Check
- `GET /api/health` - Server health status

### Accounts
- `GET /api/accounts` - Get all accounts
- `POST /api/accounts` - Create new account

### Transactions
- `GET /api/transactions` - Get all transactions (with optional filters)
- `POST /api/transactions` - Add new transaction
- `DELETE /api/transactions/:id` - Delete transaction

**Query Parameters for GET /api/transactions:**
- `category` - Filter by category
- `account` - Filter by account name
- `dateFrom` - Filter from date (YYYY-MM-DD)
- `dateTo` - Filter to date (YYYY-MM-DD)

### Budgets
- `GET /api/budgets` - Get all budgets
- `POST /api/budgets` - Create/update budget

### Goals
- `GET /api/goals` - Get all goals
- `POST /api/goals` - Create new goal
- `PUT /api/goals/:id` - Update goal progress

### Investments
- `GET /api/investments` - Get investment portfolio

### Dashboard
- `GET /api/dashboard` - Get dashboard summary data

## 📝 Sample Data

The server automatically inserts sample data including:
- 4 Bank accounts (Chase Checking, Savings, Credit Card, Investment)
- 5 Recent transactions
- 5 Budget categories
- 3 Financial goals
- 3 Investment holdings

## 🔧 Configuration

### Environment Variables
Configure in `.env` file:

```env
PORT=3001                           # Server port
DB_PATH=./database/database.db      # Database file path
CORS_ORIGIN=http://localhost:8000   # Frontend URL for CORS
NODE_ENV=development                # Environment
```

### CORS
Configured to allow requests from frontend origin specified in `CORS_ORIGIN`

## 🛡️ Security

### Current Implementation
- CORS protection
- Input validation
- Error handling
- SQL injection protection (parameterized queries)

### Future Enhancements
- User authentication with JWT
- Rate limiting
- Request validation middleware
- API key authentication

## 📊 Database Schema

### Accounts Table
```sql
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    balance REAL NOT NULL,
    institution TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Transactions Table
```sql
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    account_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Budgets Table
```sql
CREATE TABLE budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL UNIQUE,
    budgeted REAL NOT NULL,
    spent REAL DEFAULT 0,
    remaining REAL DEFAULT 0
);
```

### Goals Table
```sql
CREATE TABLE goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target REAL NOT NULL,
    current REAL DEFAULT 0,
    deadline DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Investments Table
```sql
CREATE TABLE investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    shares REAL NOT NULL,
    value REAL NOT NULL,
    gain_loss TEXT
);
```

## 🚨 Error Handling

All endpoints include proper error handling:
- **400** - Bad Request (invalid input)
- **404** - Not Found (resource doesn't exist)
- **500** - Internal Server Error (database/server errors)

Error responses format:
```json
{
  "error": "Error message description"
}
```

## 📈 Performance

- Efficient SQLite queries
- Connection pooling
- Minimal middleware overhead
- Proper indexing on frequently queried columns

## 🧪 Testing

### Manual Testing
```bash
# Health check
curl http://localhost:3001/api/health

# Get accounts
curl http://localhost:3001/api/accounts

# Get transactions with filters
curl "http://localhost:3001/api/transactions?category=Food%20%26%20Dining"
```

### Future Testing
- Unit tests with Jest
- Integration tests
- API documentation with Swagger

## 🔄 Development

### Adding New Endpoints
1. Add route in `server.js`
2. Implement database query
3. Add error handling
4. Update this documentation

### Database Migrations
Currently using simple table creation. For production:
- Implement migration system
- Version control for schema changes
- Backup and restore procedures

## 📦 Deployment

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Configure proper CORS origins
- [ ] Set up SSL/HTTPS
- [ ] Implement authentication
- [ ] Set up monitoring and logging
- [ ] Configure database backups
- [ ] Implement rate limiting