# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Application Overview

FinanceFlow Pro is a personal finance management application with a full-stack architecture:
- **Backend**: Node.js/Express.js REST API with SQLite database
- **Frontend**: Vanilla JavaScript single-page application (SPA) with responsive design
- **Database**: SQLite with schema for accounts, transactions, budgets, goals, and investments

## Common Development Commands

### Backend Development
```bash
# Install dependencies
cd backend
npm install

# Start production server
npm start

# Start development server with auto-reload
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm test:watch

# Run tests with coverage
npm test:coverage

# Run tests with verbose output
npm test:verbose
```

### Frontend Development
```bash
# Using Python (recommended)
cd frontend
python -m http.server 8000
# or python3 -m http.server 8000

# Using Node.js http-server
npm install -g http-server
http-server -p 8000

# Using frontend's built-in server
cd frontend
npm start

# Test routing system
# Navigate to: http://localhost:8000/router-test.html
```

### Full Stack Setup
```bash
# Terminal 1 - Start backend
cd backend
npm run dev

# Terminal 2 - Start frontend
cd frontend
python -m http.server 8000

# Access application:
# Frontend: http://localhost:8000
# API: http://localhost:3001 (or 3002)
```

### Database Operations
```bash
# Database file location
backend/database/database.db

# View database schema
sqlite3 backend/database/database.db ".schema"

# Run database migrations (if any new ones)
# Migrations are applied automatically on server start
```

## Architecture

### Backend Architecture
- **Entry Point**: `backend/server.js` - Express server with middleware setup
- **Services Layer**: Modular services in `backend/services/`
  - `database.js` - Centralized database service with transaction support
  - `categorization.js` - Intelligent transaction categorization with caching
  - `fileProcessing.js` - PDF/CSV bank statement parsing
- **Routes**: Properly structured routes in `backend/routes/`
- **Database**: SQLite with automatic initialization and migration system
- **Authentication**: JWT-based auth with middleware in `middleware/auth.js`
- **Validation**: Input validation and sanitization in `middleware/validation.js`
- **Security**: Helmet, CORS, rate limiting, and input sanitization

### Frontend Architecture
- **Single Page Application**: All pages in `index.html` with modern router system
- **Router System**: `router.js` and `routes.js` with browser history, deep linking, and parameter support
- **API Integration**: Centralized API client with authentication handling
- **State Management**: Global `appData` object with local caching
- **Charts**: Chart.js integration for financial visualizations
- **Responsive Design**: CSS custom properties with dark/light theme support
- **Authentication**: Token-based authentication with routing middleware

### Database Schema
Core tables: `accounts`, `transactions`, `budgets`, `goals`, `investments`, `users`
- Automatic sample data insertion on first run
- Migration system in `backend/database/migrations/`
- Foreign key relationships between accounts and transactions

### Key Integration Points
- **Frontend ↔ Backend**: REST API calls to `http://localhost:3001/api`
- **Authentication Flow**: JWT tokens stored in localStorage with automatic refresh
- **File Processing**: PDF parsing for bank statement imports with transaction categorization
- **Real-time Updates**: Frontend updates data without page refresh after API calls

### Development Workflow
1. **Backend Changes**: Server auto-restarts with `npm run dev` (nodemon)
2. **Frontend Changes**: Browser auto-refresh with live server or manual refresh
3. **Database Changes**: Add migrations to `backend/database/migrations/`
4. **Testing**: Jest test suite for backend API endpoints

### Important Files
- `backend/server.js` - Main server configuration and route definitions
- `frontend/app.js` - Frontend application logic and API integration
- `backend/package.json` - Backend dependencies and scripts
- `frontend/package.json` - Frontend server configuration
- `docs/API.md` - Complete API endpoint documentation
- `docs/DASHBOARD.md` - Dashboard calculation and display logic

### Environment Configuration
Backend environment variables (`.env` file):
```env
PORT=3001
DB_PATH=./database/database.db
CORS_ORIGIN=http://localhost:8000
NODE_ENV=development
```

### Testing
- Backend tests use Jest with Supertest for API endpoint testing
- Test configuration in `jest.config.js`
- Test files should be placed in `backend/tests/` directory

### Transaction Categorization
- **Categorization Logic**: Located in `categorizeTransaction()` function in `server.js`
- **Income Calculation**: Dashboard excludes transfers, credit card payments, and refunds from income
- **Admin Tools**: Use `/admin` endpoint to recategorize all transactions after logic updates
- **Categories**: 
  - `Transfer`, `Self Transfer`, `Credit Card Payment` - Excluded from income
  - `Income`, `Salary Income` - Counted as income
  - `Uncategorized Income` - Positive amounts that need manual review
