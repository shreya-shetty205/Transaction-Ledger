const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');

test('=== API Health & Root Endpoints ===', async (t) => {
  await t.test('GET / should return healthy status', async () => {
    const res = await request(app).get('/');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.service, 'Transaction Ledger API');
  });

  await t.test('GET /health should return UP status', async () => {
    const res = await request(app).get('/health');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.status, 'UP');
  });

  await t.test('GET /unknown-route should return 404', async () => {
    const res = await request(app).get('/unknown-route');
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'NOT_FOUND');
  });
});

test('=== Account Creation Validation (Requirement 1) ===', async (t) => {
  await t.test('Should reject account creation when account_holder_name is missing', async () => {
    const res = await request(app)
      .post('/api/accounts')
      .send({});

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'MISSING_FIELD');
  });

  await t.test('Should reject account creation when account_holder_name is empty string', async () => {
    const res = await request(app)
      .post('/api/accounts')
      .send({ account_holder_name: '   ' });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'INVALID_FIELD');
  });

  await t.test('Should reject invalid UUID in GET /api/accounts/:id', async () => {
    const res = await request(app).get('/api/accounts/invalid-uuid-123');
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'INVALID_ACCOUNT_ID');
  });

  await t.test('Should reject invalid UUID in GET /api/accounts/:id/balance', async () => {
    const res = await request(app).get('/api/accounts/invalid-uuid-123/balance');
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'INVALID_ACCOUNT_ID');
  });
});

test('=== Transaction Validation (Requirement 2) ===', async (t) => {
  const validUUID = 'a0000000-0000-0000-0000-000000000001';

  await t.test('Should reject transaction when account_id is not a valid UUID', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({
        account_id: 'bad-id',
        type: 'credit',
        amount: 100,
        description: 'Test',
        reference_id: 'REF-001'
      });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_ACCOUNT_ID');
  });

  await t.test('Should reject transaction when type is missing', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({
        account_id: validUUID,
        amount: 100,
        description: 'Test',
        reference_id: 'REF-001'
      });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'MISSING_TYPE');
  });

  await t.test('Should reject transaction when type is not credit or debit', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({
        account_id: validUUID,
        type: 'deposit',
        amount: 100,
        description: 'Test',
        reference_id: 'REF-001'
      });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_TYPE');
  });

  await t.test('Should reject transaction when amount is <= 0 or not numeric', async () => {
    const zeroRes = await request(app)
      .post('/api/transactions')
      .send({
        account_id: validUUID,
        type: 'credit',
        amount: 0,
        description: 'Test',
        reference_id: 'REF-001'
      });
    assert.strictEqual(zeroRes.statusCode, 400);
    assert.strictEqual(zeroRes.body.error.code, 'INVALID_AMOUNT');

    const negativeRes = await request(app)
      .post('/api/transactions')
      .send({
        account_id: validUUID,
        type: 'credit',
        amount: -50,
        description: 'Test',
        reference_id: 'REF-002'
      });
    assert.strictEqual(negativeRes.statusCode, 400);
    assert.strictEqual(negativeRes.body.error.code, 'INVALID_AMOUNT');

    const stringRes = await request(app)
      .post('/api/transactions')
      .send({
        account_id: validUUID,
        type: 'credit',
        amount: 'abc',
        description: 'Test',
        reference_id: 'REF-003'
      });
    assert.strictEqual(stringRes.statusCode, 400);
    assert.strictEqual(stringRes.body.error.code, 'INVALID_AMOUNT');
  });

  await t.test('Should reject transaction when amount has more than 2 decimal places', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({
        account_id: validUUID,
        type: 'credit',
        amount: 10.999,
        description: 'Fractional cent test',
        reference_id: 'REF-004'
      });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_PRECISION');
  });

  await t.test('Should reject transaction when description is empty', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({
        account_id: validUUID,
        type: 'credit',
        amount: 100,
        description: '   ',
        reference_id: 'REF-005'
      });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'MISSING_DESCRIPTION');
  });

  await t.test('Should reject transaction when reference_id is empty', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({
        account_id: validUUID,
        type: 'credit',
        amount: 100,
        description: 'Valid description',
        reference_id: '   '
      });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'MISSING_REFERENCE_ID');
  });
});

test('=== Transaction Immutability (Requirement 5) ===', async (t) => {
  const sampleTxId = 'b0000000-0000-0000-0000-000000000002';

  await t.test('PUT /api/transactions/:id must be rejected with 405 Method Not Allowed', async () => {
    const res = await request(app)
      .put(`/api/transactions/${sampleTxId}`)
      .send({ amount: 999 });

    assert.strictEqual(res.statusCode, 405);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'METHOD_NOT_ALLOWED');
    assert.match(res.body.error.message, /immutable/i);
  });

  await t.test('PATCH /api/transactions/:id must be rejected with 405 Method Not Allowed', async () => {
    const res = await request(app)
      .patch(`/api/transactions/${sampleTxId}`)
      .send({ description: 'Hacked' });

    assert.strictEqual(res.statusCode, 405);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'METHOD_NOT_ALLOWED');
    assert.match(res.body.error.message, /immutable/i);
  });

  await t.test('DELETE /api/transactions/:id must be rejected with 405 Method Not Allowed', async () => {
    const res = await request(app)
      .delete(`/api/transactions/${sampleTxId}`);

    assert.strictEqual(res.statusCode, 405);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'METHOD_NOT_ALLOWED');
    assert.match(res.body.error.message, /immutable/i);
  });
});

test('=== Transaction History Query Validation (Requirement 4) ===', async (t) => {
  const validUUID = 'a0000000-0000-0000-0000-000000000001';

  await t.test('Should reject invalid type filter', async () => {
    const res = await request(app)
      .get(`/api/accounts/${validUUID}/transactions?type=invalid_type`);

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_TYPE_FILTER');
  });

  await t.test('Should reject invalid page number (< 1)', async () => {
    const res = await request(app)
      .get(`/api/accounts/${validUUID}/transactions?page=0`);

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_PAGE');
  });

  await t.test('Should reject invalid limit (< 1 or > 100)', async () => {
    const resNegative = await request(app)
      .get(`/api/accounts/${validUUID}/transactions?limit=0`);
    assert.strictEqual(resNegative.statusCode, 400);
    assert.strictEqual(resNegative.body.error.code, 'INVALID_LIMIT');

    const resTooLarge = await request(app)
      .get(`/api/accounts/${validUUID}/transactions?limit=150`);
    assert.strictEqual(resTooLarge.statusCode, 400);
    assert.strictEqual(resTooLarge.body.error.code, 'INVALID_LIMIT');
  });
});

test('=== Fund Transfer Validation (Bonus Feature) ===', async (t) => {
  const id1 = 'a0000000-0000-0000-0000-000000000001';
  const id2 = 'a0000000-0000-0000-0000-000000000002';

  await t.test('Should reject transfer with invalid from_account_id', async () => {
    const res = await request(app)
      .post('/api/transfers')
      .send({
        from_account_id: 'invalid',
        to_account_id: id2,
        amount: 50,
        description: 'Test',
        reference_id: 'XFER-001'
      });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_FROM_ACCOUNT_ID');
  });

  await t.test('Should reject transfer between identical accounts', async () => {
    const res = await request(app)
      .post('/api/transfers')
      .send({
        from_account_id: id1,
        to_account_id: id1,
        amount: 50,
        description: 'Self transfer',
        reference_id: 'XFER-002'
      });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'IDENTICAL_ACCOUNTS');
  });

  await t.test('Should reject non-positive transfer amount', async () => {
    const res = await request(app)
      .post('/api/transfers')
      .send({
        from_account_id: id1,
        to_account_id: id2,
        amount: -10,
        description: 'Negative transfer',
        reference_id: 'XFER-003'
      });

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_AMOUNT');
  });
});

test('=== Account Creation Server Enforcement (Requirement 1) ===', async (t) => {
  await t.test('Client-provided initial balance must be stripped/ignored by validator', async () => {
    // We test that validator correctly strips balance before reaching service
    const reqMock = {
      body: { name: 'Alice Test', balance: 500000.00 }
    };
    const resMock = {};
    let nextCalled = false;
    const { validateCreateAccount } = require('../src/middlewares/validator');
    
    validateCreateAccount(reqMock, resMock, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(reqMock.body.balance, undefined, 'Client balance must be deleted from req.body');
    assert.strictEqual(reqMock.body.name, 'Alice Test');
    assert.strictEqual(reqMock.body.account_holder_name, 'Alice Test');
  });

  await t.test('Validator accepts account_holder_name as alias for name', async () => {
    const reqMock = {
      body: { account_holder_name: 'Bob Test' }
    };
    const { validateCreateAccount } = require('../src/middlewares/validator');
    validateCreateAccount(reqMock, {}, () => {});
    assert.strictEqual(reqMock.body.name, 'Bob Test');
    assert.strictEqual(reqMock.body.account_holder_name, 'Bob Test');
  });
});

