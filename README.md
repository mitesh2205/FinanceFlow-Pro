# FinanceFlow Pro - Local Setup Guide

## Quick Setup (Frontend Only)

### Option 1: Using Python (Recommended)
```bash
# Create project directory
mkdir financeflow-pro
cd financeflow-pro

# Add your files (index.html, style.css, app.js)
# Then start a local server:
python -m http.server 8000
# or for Python 2:
python -m SimpleHTTPServer 8000
```

Visit: `http://localhost:8000`

### Option 2: Using Node.js
```bash
# Install a simple HTTP server
npm install -g http-server

# In your project directory
http-server -p 8000
```

### Option 3: Using VS Code
- Install "Live Server" extension
- Right-click `index.html` → "Open with Live Server"

## Full Setup with Database (Recommended)

### 1. Project Structure
```
financeflow-pro/
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── backend/
│   ├── package.json
│   ├── server.js
│   ├── database/
│   │   └── database.db
│   └── routes/
│       ├── accounts.js
│       ├── transactions.js
│       ├── budgets.js
│       └── goals.js
└── README.md
```

### 2. Backend Setup (Node.js + SQLite)
```bash
# Create backend directory
mkdir backend && cd backend

# Initialize Node.js project
npm init -y

# Install dependencies
npm install express cors sqlite3 multer dotenv

# Create server.js (see backend code below)
```

### 3. Database Schema
```sql
-- accounts table
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    balance REAL NOT NULL,
    institution TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- transactions table
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    account_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- budgets table
CREATE TABLE budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL UNIQUE,
    budgeted REAL NOT NULL,
    spent REAL DEFAULT 0,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL
);

-- goals table
CREATE TABLE goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target REAL NOT NULL,
    current REAL DEFAULT 0,
    deadline DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- investments table
CREATE TABLE investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    shares REAL NOT NULL,
    value REAL NOT NULL,
    gain_loss TEXT
);
```

## Alternative Database Options

### Option 1: SQLite (Recommended for local development)
- **Pros**: No setup required, file-based, lightweight
- **Cons**: Not suitable for multiple users

### Option 2: PostgreSQL (Recommended for production)
```bash
# Install PostgreSQL locally
# Create database
createdb financeflow_db

# Connection string
DATABASE_URL=postgresql://username:password@localhost:5432/financeflow_db
```

### Option 3: Firebase (No backend required)
```bash
npm install firebase

# Setup Firebase project at https://console.firebase.google.com
# Enable Firestore Database
```

### Option 4: Supabase (PostgreSQL with built-in features)
```bash
# Visit https://supabase.com
# Create new project
# Get API URL and Key
```

## Environment Variables
Create `.env` file in backend directory:
```env
PORT=3001
DB_PATH=./database/database.db
CORS_ORIGIN=http://localhost:8000
```

## Quick Start Commands
```bash
# Start backend (in backend directory)
npm start

# Start frontend (in frontend directory)  
python -m http.server 8000

# Access application
# Frontend: http://localhost:8000
# API: http://localhost:3001
```