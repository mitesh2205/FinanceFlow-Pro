// Test setup file
const path = require('path');
const fs = require('fs');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.PORT = '3003';
process.env.DB_PATH = ':memory:'; // Use in-memory database for tests
process.env.LOAD_SAMPLE_DATA = 'false';

// Global test utilities
global.testUtils = {
  // Create a test user
  createTestUser: () => ({
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    password: 'TestPass123!'
  }),

  // Create test transaction
  createTestTransaction: () => ({
    date: '2024-01-15',
    description: 'Test Transaction',
    amount: -50.99,
    category: 'Food & Dining',
    account_name: 'Test Account'
  }),

  // Create test account
  createTestAccount: () => ({
    name: 'Test Account',
    type: 'checking',
    balance: 1000.00,
    institution: 'Test Bank'
  }),

  // Create test budget
  createTestBudget: () => ({
    category: 'Food & Dining',
    budgeted: 500.00
  }),

  // Create test goal
  createTestGoal: () => ({
    name: 'Emergency Fund',
    target: 10000.00,
    current: 2500.00,
    deadline: '2024-12-31'
  }),

  // Create test investment
  createTestInvestment: () => ({
    symbol: 'AAPL',
    name: 'Apple Inc.',
    shares: 10.5,
    value: 1500.00,
    gain_loss: '+5.2%'
  })
};

// Clean up after tests
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
});

// Global error handler for tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

console.log('Test environment initialized');