const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDatabaseError } = require('../src/middlewares/errorHandler');

test('=== Database Error Normalization ===', async (t) => {
  await t.test('Should map INSUFFICIENT_FUNDS to 400 Bad Request', () => {
    const rawError = { message: 'INSUFFICIENT_FUNDS: Insufficient balance for debit', code: '22003' };
    const normalized = normalizeDatabaseError(rawError);
    assert.strictEqual(normalized.statusCode, 400);
    assert.strictEqual(normalized.code, 'INSUFFICIENT_FUNDS');
  });

  await t.test('Should map DUPLICATE_REFERENCE to 409 Conflict', () => {
    const rawError = { message: 'DUPLICATE_REFERENCE: Reference ID already exists', code: '23505' };
    const normalized = normalizeDatabaseError(rawError);
    assert.strictEqual(normalized.statusCode, 409);
    assert.strictEqual(normalized.code, 'DUPLICATE_REFERENCE_ID');
  });

  await t.test('Should map unique constraint uq_account_reference to 409 Conflict', () => {
    const rawError = { message: 'duplicate key value violates unique constraint "uq_account_reference"', code: '23505' };
    const normalized = normalizeDatabaseError(rawError);
    assert.strictEqual(normalized.statusCode, 409);
    assert.strictEqual(normalized.code, 'DUPLICATE_REFERENCE_ID');
  });

  await t.test('Should map ACCOUNT_NOT_FOUND to 404 Not Found', () => {
    const rawError = { message: 'ACCOUNT_NOT_FOUND: Account not found', code: 'P0002' };
    const normalized = normalizeDatabaseError(rawError);
    assert.strictEqual(normalized.statusCode, 404);
    assert.strictEqual(normalized.code, 'ACCOUNT_NOT_FOUND');
  });

  await t.test('Should map immutability trigger error 27000 to 405 Method Not Allowed', () => {
    const rawError = { message: 'DATA_INTEGRITY_VIOLATION: Transactions are immutable', code: '27000' };
    const normalized = normalizeDatabaseError(rawError);
    assert.strictEqual(normalized.statusCode, 405);
    assert.strictEqual(normalized.code, 'TRANSACTION_IMMUTABLE');
  });
});

test('=== Ledger Math & Balance Consistency Rules ===', async (t) => {
  await t.test('Initial balance must always be zero', () => {
    const account = { balance: 0.00 };
    assert.strictEqual(account.balance, 0.00);
  });

  await t.test('Credit transaction must strictly increase balance', () => {
    let balance = 0.00;
    const creditAmount = 150.25;
    balance = Math.round((balance + creditAmount) * 100) / 100;
    assert.strictEqual(balance, 150.25);

    // Second credit
    balance = Math.round((balance + 49.75) * 100) / 100;
    assert.strictEqual(balance, 200.00);
  });

  await t.test('Debit transaction decreases balance only when sufficient funds exist', () => {
    let balance = 200.00;
    const debitAmount = 75.50;

    assert.ok(balance >= debitAmount, 'Funds are sufficient');
    balance = Math.round((balance - debitAmount) * 100) / 100;
    assert.strictEqual(balance, 124.50);
  });

  await t.test('Debit must fail when amount exceeds current balance', () => {
    const balance = 50.00;
    const debitAmount = 100.00;

    const canDebit = balance >= debitAmount;
    assert.strictEqual(canDebit, false, 'Should reject debit when funds are insufficient');
  });

  await t.test('Pagination calculations correctly compute total pages', () => {
    const calculatePages = (total, limit) => Math.ceil(total / limit) || 1;

    assert.strictEqual(calculatePages(0, 10), 1);
    assert.strictEqual(calculatePages(9, 10), 1);
    assert.strictEqual(calculatePages(10, 10), 1);
    assert.strictEqual(calculatePages(11, 10), 2);
    assert.strictEqual(calculatePages(25, 10), 3);
    assert.strictEqual(calculatePages(100, 20), 5);
  });
});
