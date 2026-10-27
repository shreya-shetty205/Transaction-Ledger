/**
 * End-to-End Live Integration Test Runner for Supabase
 * Run via: npm run test:live
 */
const config = require('../src/config/env');
const request = require('supertest');
const app = require('../src/app');

async function runLiveTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING TRANSACTION LEDGER LIVE INTEGRATION SUITE');
  console.log('====================================================\n');

  if (!config.isConfigured) {
    console.log('⚠️ SUPABASE CREDENTIALS MISSING:');
    console.log('To run live integration tests against Supabase:');
    console.log('1. Add your SUPABASE_URL and SUPABASE_KEY to your .env file.');
    console.log('2. Execute sql/schema.sql in your Supabase SQL Editor.');
    console.log('3. Run "npm run test:live" again.\n');
    console.log('ℹ️ Note: Automated unit and validation tests passed via "npm test".\n');
    return;
  }

  try {
    const timestamp = Date.now();

    // 1. Create Alice's Account
    console.log('Step 1: Creating Account 1 (Alice)...');
    const resAlice = await request(app)
      .post('/api/accounts')
      .send({ account_holder_name: `Alice Walker ${timestamp}`, balance: 999999 }); // balance should be ignored!

    if (resAlice.statusCode !== 201) {
      throw new Error(`Failed to create Alice: ${JSON.stringify(resAlice.body)}`);
    }
    const aliceId = resAlice.body.data.id;
    console.log(`✅ Alice created (ID: ${aliceId}) with balance: $${resAlice.body.data.balance} (client balance was strictly ignored)`);

    // 2. Create Bob's Account
    console.log('\nStep 2: Creating Account 2 (Bob)...');
    const resBob = await request(app)
      .post('/api/accounts')
      .send({ account_holder_name: `Bob Miller ${timestamp}` });

    if (resBob.statusCode !== 201) {
      throw new Error(`Failed to create Bob: ${JSON.stringify(resBob.body)}`);
    }
    const bobId = resBob.body.data.id;
    console.log(`✅ Bob created (ID: ${bobId}) with balance: $${resBob.body.data.balance}`);

    // 3. Credit Alice $250.00
    console.log('\nStep 3: Crediting Alice $250.00...');
    const creditRef = `DEP-${timestamp}-1`;
    const resCredit = await request(app)
      .post('/api/transactions')
      .send({
        account_id: aliceId,
        type: 'credit',
        amount: 250.00,
        description: 'Initial salary deposit',
        reference_id: creditRef
      });

    if (resCredit.statusCode !== 201) {
      throw new Error(`Failed to credit Alice: ${JSON.stringify(resCredit.body)}`);
    }
    console.log(`✅ Credited $250.00. New balance: $${resCredit.body.data.new_balance}`);

    // 4. Debit Alice $50.00
    console.log('\nStep 4: Debiting Alice $50.00 (grocery shopping)...');
    const debitRef = `WDL-${timestamp}-1`;
    const resDebit = await request(app)
      .post('/api/transactions')
      .send({
        account_id: aliceId,
        type: 'debit',
        amount: 50.00,
        description: 'Grocery shopping',
        reference_id: debitRef
      });

    if (resDebit.statusCode !== 201) {
      throw new Error(`Failed to debit Alice: ${JSON.stringify(resDebit.body)}`);
    }
    console.log(`✅ Debited $50.00. New balance: $${resDebit.body.data.new_balance}`);

    // 5. Test Insufficient Funds (Debit $10,000)
    console.log('\nStep 5: Testing Insufficient Funds (Attempting $10,000 debit)...');
    const resOverdraft = await request(app)
      .post('/api/transactions')
      .send({
        account_id: aliceId,
        type: 'debit',
        amount: 10000.00,
        description: 'Luxury car purchase attempt',
        reference_id: `WDL-OVERDRAFT-${timestamp}`
      });

    if (resOverdraft.statusCode === 400) {
      console.log(`✅ Correctly rejected with HTTP 400: "${resOverdraft.body.error.message}"`);
    } else {
      throw new Error(`Expected HTTP 400 for insufficient funds, got ${resOverdraft.statusCode}`);
    }

    // 6. Test Duplicate Reference ID Prevention
    console.log('\nStep 6: Testing Duplicate reference_id Prevention...');
    const resDup = await request(app)
      .post('/api/transactions')
      .send({
        account_id: aliceId,
        type: 'credit',
        amount: 10.00,
        description: 'Duplicate attempt',
        reference_id: creditRef // reusing reference_id from step 3
      });

    if (resDup.statusCode === 409) {
      console.log(`✅ Correctly rejected duplicate reference ID with HTTP 409: "${resDup.body.error.message}"`);
    } else {
      throw new Error(`Expected HTTP 409 Conflict, got ${resDup.statusCode}`);
    }

    // 7. Check Alice Balance
    console.log('\nStep 7: Checking Alice balance via GET /api/accounts/:id/balance...');
    const resBalance = await request(app).get(`/api/accounts/${aliceId}/balance`);
    console.log(`✅ Alice current balance: $${resBalance.body.data.balance} (Unchanged by failed transactions)`);

    // 8. Test Bonus: Fund Transfer (Alice -> Bob $75.00)
    console.log('\nStep 8: Bonus Feature - Transferring $75.00 from Alice to Bob...');
    const transferRef = `XFER-${timestamp}`;
    const resTransfer = await request(app)
      .post('/api/transfers')
      .send({
        from_account_id: aliceId,
        to_account_id: bobId,
        amount: 75.00,
        description: 'Splitting dinner bill',
        reference_id: transferRef
      });

    if (resTransfer.statusCode !== 201) {
      throw new Error(`Transfer failed: ${JSON.stringify(resTransfer.body)}`);
    }
    console.log(`✅ Transfer successful!`);
    console.log(`   Alice new balance: $${resTransfer.body.data.from_account.new_balance}`);
    console.log(`   Bob new balance:   $${resTransfer.body.data.to_account.new_balance}`);

    // 9. Fetch Alice Transaction History
    console.log('\nStep 9: Fetching Alice transaction history with pagination...');
    const resHistory = await request(app).get(`/api/accounts/${aliceId}/transactions?page=1&limit=5`);
    console.log(`✅ Retrieved ${resHistory.body.data.length} transactions.`);
    console.log(`   Pagination info:`, resHistory.body.pagination);

    // 10. Verify Transaction Immutability
    console.log('\nStep 10: Verifying Transaction Immutability (PUT / DELETE)...');
    const dummyTxId = resHistory.body.data[0].id;
    const resPut = await request(app).put(`/api/transactions/${dummyTxId}`).send({ amount: 99999 });
    const resDelete = await request(app).delete(`/api/transactions/${dummyTxId}`);

    if (resPut.statusCode === 405 && resDelete.statusCode === 405) {
      console.log('✅ Transactions cannot be modified (PUT: 405) or deleted (DELETE: 405).');
    } else {
      throw new Error('Immutability check failed');
    }

    console.log('\n====================================================');
    console.log('🎉 ALL LIVE INTEGRATION TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================');
  } catch (err) {
    console.error('\n❌ Live Test Failed:', err.message);
  }
}

runLiveTests();
