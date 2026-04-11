'use strict';
/**
 * Integration tests for the API routes using the JSON DB layer.
 * No MongoDB or external services required.
 */

const request = require('supertest');
const path    = require('path');
const fs      = require('fs');

// Point DB to a temp directory so tests don't corrupt production data
const TMP_DB = path.join('/tmp', `triu-test-db-${process.pid}`);
fs.mkdirSync(TMP_DB, { recursive: true });

// Patch jsonDB path BEFORE requiring any routes
process.env.TRIU_DB_DIR  = TMP_DB;
process.env.JWT_SECRET   = 'integration-test-secret';
process.env.JWT_EXPIRE   = '1h';
process.env.NODE_ENV     = 'test';
process.env.CLIENT_URL   = '*';

// Seed empty collections
['users','products','orders','gst','ledger','invoices','settlements','events'].forEach(col => {
  fs.writeFileSync(path.join(TMP_DB, `${col}.json`), '[]');
});

let app;

beforeAll(() => {
  app = require('../../server');
});

afterAll(() => {
  // Clean up temp DB
  try { fs.rmSync(TMP_DB, { recursive: true, force: true }); } catch {}
  if (app && app._server && typeof app._server.close === 'function') {
    app._server.close();
  }
});

// Helper: register + get token
async function registerUser(overrides = {}) {
  const data = {
    name: 'Test User',
    email: `testuser_${Date.now()}@example.com`,
    phone: '9876543210',
    password: 'Test@123',
    passwordConfirm: 'Test@123',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(data);
  return { token: res.body.token, user: res.body.user, data };
}

// ─── Health ──────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  test('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  test('creates a new user and returns token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'New User',
      email: 'newuser@example.com',
      phone: '9876543210',
      password: 'Pass@123',
      passwordConfirm: 'Pass@123',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test('rejects duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Dup User',
      email: 'dup@example.com',
      phone: '9876543210',
      password: 'Pass@123',
      passwordConfirm: 'Pass@123',
    });
    const res = await request(app).post('/api/auth/register').send({
      name: 'Dup User 2',
      email: 'dup@example.com',
      phone: '9876543210',
      password: 'Pass@123',
      passwordConfirm: 'Pass@123',
    });
    expect(res.status).toBe(409);
  });

  test('rejects mismatched passwords', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'X', email: 'x@x.com', phone: '1234567890',
      password: 'abc123', passwordConfirm: 'abc456',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  test('returns token for valid credentials', async () => {
    const { data } = await registerUser({ email: 'login_test@example.com' });
    const res = await request(app).post('/api/auth/login').send({
      email: data.email, password: data.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  test('rejects wrong password with 401', async () => {
    const { data } = await registerUser({ email: 'wrong_pw@example.com' });
    const res = await request(app).post('/api/auth/login').send({
      email: data.email, password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
  });
});

// ─── Products (public) ────────────────────────────────────────────────────────

describe('GET /api/products', () => {
  test('returns 200 and success:true for guests', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('accepts search query param', async () => {
    const res = await request(app).get('/api/products?search=organic');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('accepts category filter', async () => {
    const res = await request(app).get('/api/products?category=Electronics');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── Protected routes ─────────────────────────────────────────────────────────

describe('Protected routes (no token)', () => {
  test('GET /api/orders returns 401 without token', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });

  test('GET /api/users/profile returns 401 without token', async () => {
    const res = await request(app).get('/api/users/profile');
    expect(res.status).toBe(401);
  });
});

// ─── GST ──────────────────────────────────────────────────────────────────────

describe('POST /api/gst/calculate', () => {
  test('calculates inter-state GST correctly', async () => {
    const res = await request(app).post('/api/gst/calculate').send({
      amount: 1000, hsnCode: '8518',
      sellerState: 'Maharashtra', buyerState: 'Karnataka',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.igst).toBe(180);
    expect(res.body.data.cgst).toBe(0);
  });

  test('calculates intra-state GST correctly', async () => {
    const res = await request(app).post('/api/gst/calculate').send({
      amount: 1000, hsnCode: '8518',
      sellerState: 'Maharashtra', buyerState: 'Maharashtra',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.cgst).toBe(90);
    expect(res.body.data.sgst).toBe(90);
    expect(res.body.data.igst).toBe(0);
  });
});

// ─── Jarvis AI ───────────────────────────────────────────────────────────────

describe('POST /api/jarvis/ask', () => {
  test('returns a response with intent for authenticated user', async () => {
    const { token } = await registerUser({ email: 'jarvis_test@example.com' });
    const res = await request(app)
      .post('/api/jarvis/ask')
      .set('Authorization', `Bearer ${token}`)
      .send({ query: 'show me trending products' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.intent).toBeTruthy();
  });

  test('returns 401 without token', async () => {
    const res = await request(app).post('/api/jarvis/ask').send({ query: 'test' });
    expect(res.status).toBe(401);
  });
});
