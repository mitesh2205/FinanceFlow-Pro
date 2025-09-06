const request = require('supertest');
const app = require('../server');
const jwt = require('jsonwebtoken');

describe('Authentication Tests', () => {
  let server;
  let testUser;

  beforeAll(async () => {
    // Start server for testing
    server = app.listen(0);
    testUser = global.testUtils.createTestUser();
  });

  afterAll(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  describe('POST /api/auth/register', () => {
    test('should register a new user with valid data', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.user.firstName).toBe(testUser.firstName);
      expect(response.body.data.user.lastName).toBe(testUser.lastName);
    });

    test('should reject registration with invalid email', async () => {
      const invalidUser = { ...testUser, email: 'invalid-email' };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidUser);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'email',
            msg: expect.stringContaining('valid email')
          })
        ])
      );
    });

    test('should reject registration with weak password', async () => {
      const weakPasswordUser = { ...testUser, password: 'weak', email: 'test2@example.com' };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(weakPasswordUser);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'password',
            msg: expect.stringContaining('8 characters')
          })
        ])
      );
    });

    test('should reject registration with missing fields', async () => {
      const incompleteUser = { email: 'test3@example.com', password: 'ValidPass123!' };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(incompleteUser);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors.length).toBeGreaterThan(0);
    });

    test('should reject duplicate email registration', async () => {
      // First registration should succeed (already done in first test)
      // Second registration with same email should fail
      const duplicateUser = { ...testUser, email: testUser.email };
      
      const response = await request(app)
        .post('/api/auth/register')
        .send(duplicateUser);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    test('should login with valid credentials', async () => {
      const loginData = {
        email: testUser.email,
        password: testUser.password
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.email).toBe(testUser.email);

      // Verify token is valid
      const decoded = jwt.verify(response.body.data.token, process.env.JWT_SECRET);
      expect(decoded.userId).toBeDefined();
    });

    test('should reject login with invalid email', async () => {
      const invalidLogin = {
        email: 'nonexistent@example.com',
        password: testUser.password
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidLogin);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid email or password');
    });

    test('should reject login with invalid password', async () => {
      const invalidLogin = {
        email: testUser.email,
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidLogin);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid email or password');
    });

    test('should reject login with malformed email', async () => {
      const malformedLogin = {
        email: 'not-an-email',
        password: testUser.password
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(malformedLogin);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('GET /api/auth/profile', () => {
    let authToken;

    beforeAll(async () => {
      // Login to get auth token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });
      
      authToken = loginResponse.body.data.token;
    });

    test('should get user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.user.firstName).toBe(testUser.firstName);
      expect(response.body.data.user.lastName).toBe(testUser.lastName);
      expect(response.body.data.user.createdAt).toBeDefined();
    });

    test('should reject profile request without token', async () => {
      const response = await request(app)
        .get('/api/auth/profile');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Access token required');
    });

    test('should reject profile request with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid or expired token');
    });
  });

  describe('POST /api/auth/logout', () => {
    let authToken;

    beforeAll(async () => {
      // Login to get auth token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });
      
      authToken = loginResponse.body.data.token;
    });

    test('should logout successfully with valid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Logout successful');
    });

    test('should reject logout without token', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Access token required');
    });
  });
});