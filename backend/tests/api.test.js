const request = require('supertest');
const app = require('../server');

describe('API Integration Tests', () => {
  let server;
  let authToken;
  let testUser;
  let testAccountId;

  beforeAll(async () => {
    server = app.listen(0);
    testUser = { ...global.testUtils.createTestUser(), email: 'api@test.com' };

    // Register and login to get auth token
    await request(app)
      .post('/api/auth/register')
      .send(testUser);

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      });
    
    authToken = loginResponse.body.data.token;
  });

  afterAll(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  describe('Accounts API', () => {
    test('should create, read, and list accounts', async () => {
      const testAccount = global.testUtils.createTestAccount();

      // Create account
      const createResponse = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testAccount);

      expect(createResponse.status).toBe(200);
      expect(createResponse.body.id).toBeDefined();
      testAccountId = createResponse.body.id;

      // List accounts
      const listResponse = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listResponse.status).toBe(200);
      expect(Array.isArray(listResponse.body)).toBe(true);
      expect(listResponse.body.length).toBeGreaterThan(0);
      
      const createdAccount = listResponse.body.find(account => account.id === testAccountId);
      expect(createdAccount).toBeDefined();
      expect(createdAccount.name).toBe(testAccount.name);
      expect(createdAccount.type).toBe(testAccount.type);
      expect(createdAccount.balance).toBe(testAccount.balance);
    });

    test('should get accounts for import', async () => {
      const response = await request(app)
        .get('/api/accounts/for-import')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      if (response.body.length > 0) {
        const account = response.body[0];
        expect(account.displayName).toBeDefined();
        expect(account.name).toBeDefined();
        expect(account.type).toBeDefined();
        expect(account.institution).toBeDefined();
      }
    });
  });

  describe('Transactions API', () => {
    let transactionId;

    test('should create, read, update, and delete transactions', async () => {
      const testTransaction = {
        ...global.testUtils.createTestTransaction(),
        account_name: 'Test Account'
      };

      // Create transaction
      const createResponse = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testTransaction);

      expect(createResponse.status).toBe(200);
      expect(createResponse.body.id).toBeDefined();
      transactionId = createResponse.body.id;

      // List transactions
      const listResponse = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listResponse.status).toBe(200);
      expect(Array.isArray(listResponse.body)).toBe(true);
      
      const createdTransaction = listResponse.body.find(t => t.id === transactionId);
      expect(createdTransaction).toBeDefined();
      expect(createdTransaction.description).toBe(testTransaction.description);
      expect(createdTransaction.amount).toBe(testTransaction.amount);

      // Update transaction
      const updatedTransaction = {
        ...testTransaction,
        description: 'Updated Test Transaction',
        amount: -75.50
      };

      const updateResponse = await request(app)
        .put(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updatedTransaction);

      expect(updateResponse.status).toBe(200);

      // Verify update
      const verifyResponse = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`);

      const updated = verifyResponse.body.find(t => t.id === transactionId);
      expect(updated.description).toBe(updatedTransaction.description);
      expect(updated.amount).toBe(updatedTransaction.amount);

      // Delete transaction
      const deleteResponse = await request(app)
        .delete(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(200);

      // Verify deletion
      const finalResponse = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`);

      const deletedTransaction = finalResponse.body.find(t => t.id === transactionId);
      expect(deletedTransaction).toBeUndefined();
    });

    test('should filter transactions by category', async () => {
      // Create test transactions with different categories
      const transaction1 = {
        ...global.testUtils.createTestTransaction(),
        category: 'Food & Dining',
        description: 'Restaurant meal',
        account_name: 'Test Account'
      };

      const transaction2 = {
        ...global.testUtils.createTestTransaction(),
        category: 'Transportation',
        description: 'Gas station',
        account_name: 'Test Account'
      };

      await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(transaction1);

      await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(transaction2);

      // Filter by category
      const response = await request(app)
        .get('/api/transactions?category=Food & Dining')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      // All returned transactions should be in the Food & Dining category
      response.body.forEach(transaction => {
        expect(transaction.category).toBe('Food & Dining');
      });
    });
  });

  describe('Budgets API', () => {
    test('should create and read budgets', async () => {
      const testBudget = global.testUtils.createTestBudget();

      // Create budget
      const createResponse = await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testBudget);

      expect(createResponse.status).toBe(200);

      // List budgets
      const listResponse = await request(app)
        .get('/api/budgets')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listResponse.status).toBe(200);
      expect(Array.isArray(listResponse.body)).toBe(true);
      
      const createdBudget = listResponse.body.find(b => b.category === testBudget.category);
      expect(createdBudget).toBeDefined();
      expect(createdBudget.budgeted).toBe(testBudget.budgeted);
      expect(createdBudget.spent).toBe(0);
      expect(createdBudget.remaining).toBe(testBudget.budgeted);
    });
  });

  describe('Goals API', () => {
    let goalId;

    test('should create, read, update, and delete goals', async () => {
      const testGoal = global.testUtils.createTestGoal();

      // Create goal
      const createResponse = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testGoal);

      expect(createResponse.status).toBe(200);
      expect(createResponse.body.id).toBeDefined();
      goalId = createResponse.body.id;

      // List goals
      const listResponse = await request(app)
        .get('/api/goals')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listResponse.status).toBe(200);
      expect(Array.isArray(listResponse.body)).toBe(true);
      
      const createdGoal = listResponse.body.find(g => g.id === goalId);
      expect(createdGoal).toBeDefined();
      expect(createdGoal.name).toBe(testGoal.name);
      expect(createdGoal.target).toBe(testGoal.target);

      // Update goal progress
      const updateData = { current: 5000.00 };
      const updateResponse = await request(app)
        .put(`/api/goals/${goalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(updateResponse.status).toBe(200);

      // Delete goal
      const deleteResponse = await request(app)
        .delete(`/api/goals/${goalId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(200);
    });
  });

  describe('Investments API', () => {
    test('should create and read investments', async () => {
      const testInvestment = global.testUtils.createTestInvestment();

      // Create investment
      const createResponse = await request(app)
        .post('/api/investments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testInvestment);

      expect(createResponse.status).toBe(200);

      // List investments
      const listResponse = await request(app)
        .get('/api/investments')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listResponse.status).toBe(200);
      expect(Array.isArray(listResponse.body)).toBe(true);
      
      const createdInvestment = listResponse.body.find(i => i.symbol === testInvestment.symbol);
      expect(createdInvestment).toBeDefined();
      expect(createdInvestment.name).toBe(testInvestment.name);
      expect(createdInvestment.shares).toBe(testInvestment.shares);
    });
  });

  describe('Dashboard API', () => {
    test('should get dashboard summary', async () => {
      const response = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.total_balance).toBeDefined();
      expect(response.body.monthly_income).toBeDefined();
      expect(response.body.monthly_expenses).toBeDefined();
      expect(response.body.savings_rate).toBeDefined();
      expect(Array.isArray(response.body.monthly_data)).toBe(true);
    });
  });

  describe('Categories API', () => {
    test('should get list of categories', async () => {
      const response = await request(app)
        .get('/api/categories');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toContain('Food & Dining');
      expect(response.body).toContain('Transportation');
      expect(response.body).toContain('Entertainment');
    });
  });

  describe('Health Check', () => {
    test('should return API health status', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('OK');
      expect(response.body.message).toContain('FinanceFlow Pro API is running');
    });
  });
});