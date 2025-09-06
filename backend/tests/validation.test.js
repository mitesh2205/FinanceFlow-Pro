const request = require('supertest');
const app = require('../server');

describe('Validation Tests', () => {
  let server;
  let authToken;
  let testUser;

  beforeAll(async () => {
    server = app.listen(0);
    testUser = global.testUtils.createTestUser();

    // Register and login to get auth token
    await request(app)
      .post('/api/auth/register')
      .send({ ...testUser, email: 'validation@test.com' });

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'validation@test.com',
        password: testUser.password
      });
    
    authToken = loginResponse.body.data.token;
  });

  afterAll(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  describe('Account Validation', () => {
    test('should validate account creation with valid data', async () => {
      const validAccount = global.testUtils.createTestAccount();

      const response = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validAccount);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('successfully');
    });

    test('should reject account creation with invalid type', async () => {
      const invalidAccount = {
        ...global.testUtils.createTestAccount(),
        type: 'invalid-type'
      };

      const response = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidAccount);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'type',
            message: expect.stringContaining('Invalid account type')
          })
        ])
      );
    });

    test('should reject account creation with missing fields', async () => {
      const incompleteAccount = {
        name: 'Test Account'
        // Missing type, balance, institution
      };

      const response = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(incompleteAccount);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors.length).toBeGreaterThan(0);
    });

    test('should reject account with invalid balance', async () => {
      const invalidAccount = {
        ...global.testUtils.createTestAccount(),
        balance: 'not-a-number'
      };

      const response = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidAccount);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Transaction Validation', () => {
    beforeAll(async () => {
      // Create a test account first
      await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(global.testUtils.createTestAccount());
    });

    test('should validate transaction creation with valid data', async () => {
      const validTransaction = global.testUtils.createTestTransaction();

      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validTransaction);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('successfully');
    });

    test('should reject transaction with invalid date format', async () => {
      const invalidTransaction = {
        ...global.testUtils.createTestTransaction(),
        date: '15-01-2024' // Invalid format, should be YYYY-MM-DD
      };

      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidTransaction);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'date',
            message: expect.stringContaining('YYYY-MM-DD')
          })
        ])
      );
    });

    test('should reject transaction with future date', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      
      const invalidTransaction = {
        ...global.testUtils.createTestTransaction(),
        date: futureDate.toISOString().split('T')[0]
      };

      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidTransaction);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'date',
            message: expect.stringContaining('cannot be in the future')
          })
        ])
      );
    });

    test('should reject transaction with invalid category', async () => {
      const invalidTransaction = {
        ...global.testUtils.createTestTransaction(),
        category: 'Invalid Category'
      };

      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidTransaction);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'category',
            message: expect.stringContaining('Invalid category')
          })
        ])
      );
    });

    test('should reject transaction with invalid amount', async () => {
      const invalidTransaction = {
        ...global.testUtils.createTestTransaction(),
        amount: 'not-a-number'
      };

      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidTransaction);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should reject transaction with extremely large amount', async () => {
      const invalidTransaction = {
        ...global.testUtils.createTestTransaction(),
        amount: 9999999.99 // Exceeds limit
      };

      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidTransaction);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should reject transaction with too long description', async () => {
      const invalidTransaction = {
        ...global.testUtils.createTestTransaction(),
        description: 'A'.repeat(501) // Exceeds 500 character limit
      };

      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidTransaction);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Budget Validation', () => {
    test('should validate budget creation with valid data', async () => {
      const validBudget = global.testUtils.createTestBudget();

      const response = await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validBudget);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('successfully');
    });

    test('should reject budget with negative amount', async () => {
      const invalidBudget = {
        ...global.testUtils.createTestBudget(),
        budgeted: -100.00
      };

      const response = await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidBudget);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should reject budget with invalid category', async () => {
      const invalidBudget = {
        ...global.testUtils.createTestBudget(),
        category: 'Invalid Category'
      };

      const response = await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidBudget);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Goal Validation', () => {
    test('should validate goal creation with valid data', async () => {
      const validGoal = global.testUtils.createTestGoal();

      const response = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validGoal);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('successfully');
    });

    test('should reject goal with zero target', async () => {
      const invalidGoal = {
        ...global.testUtils.createTestGoal(),
        target: 0
      };

      const response = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidGoal);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should reject goal with past deadline', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      
      const invalidGoal = {
        ...global.testUtils.createTestGoal(),
        deadline: pastDate.toISOString().split('T')[0]
      };

      const response = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidGoal);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Investment Validation', () => {
    test('should validate investment creation with valid data', async () => {
      const validInvestment = global.testUtils.createTestInvestment();

      const response = await request(app)
        .post('/api/investments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validInvestment);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('successfully');
    });

    test('should reject investment with invalid symbol', async () => {
      const invalidInvestment = {
        ...global.testUtils.createTestInvestment(),
        symbol: 'INVALID_SYMBOL_TOO_LONG!'
      };

      const response = await request(app)
        .post('/api/investments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidInvestment);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should reject investment with invalid shares amount', async () => {
      const invalidInvestment = {
        ...global.testUtils.createTestInvestment(),
        shares: -5
      };

      const response = await request(app)
        .post('/api/investments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidInvestment);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});