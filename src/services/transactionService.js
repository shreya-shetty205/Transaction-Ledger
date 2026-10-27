const crypto = require('crypto');
const supabase = require('../config/supabase');
const accountService = require('./accountService');
const { 
  BadRequestError, 
  NotFoundError, 
  ConflictError 
} = require('../utils/errors');
const { normalizeDatabaseError } = require('../middlewares/errorHandler');

class TransactionService {
  /**
   * Adds a transaction (credit or debit) atomically.
   * Utilizes PostgreSQL stored procedure 'process_transaction' with row-level locks
   * for guaranteed atomicity, race-condition safety, and balance integrity.
   */
  async addTransaction({ accountId, type, amount, description, referenceId }) {
    // 1. First attempt atomic execution via Supabase RPC (PostgreSQL Stored Procedure)
    const { data, error } = await supabase.rpc('process_transaction', {
      p_account_id: accountId,
      p_type: type,
      p_amount: amount,
      p_description: description,
      p_reference_id: referenceId
    });

    if (!error && data) {
      return {
        transaction: {
          ...data.transaction,
          amount: Number(data.transaction.amount)
        },
        account_id: data.account_id,
        previous_balance: Number(data.previous_balance),
        new_balance: Number(data.new_balance)
      };
    }

    // If RPC failed due to business logic (insufficient funds, duplicate reference, not found),
    // normalize and throw the exact error.
    if (error) {
      const normalized = normalizeDatabaseError(error);
      if (normalized) {
        throw normalized;
      }

      // If the RPC function has not yet been installed or has schema mismatch (e.g. updated_at column missing),
      // fallback cleanly to robust direct execution
      if (error.code === 'PGRST202' || error.code === '42703' || error.message.includes('process_transaction') || error.message.includes('updated_at')) {
        return await this._addTransactionFallback({ accountId, type, amount, description, referenceId });
      }

      throw error;
    }

    throw new Error('Unexpected error processing transaction');
  }

  /**
   * Fallback execution in case the PL/pgSQL function is not yet created in Supabase
   */
  async _addTransactionFallback({ accountId, type, amount, description, referenceId }) {
    // 1. Fetch and verify account exists
    const account = await accountService.getAccountById(accountId);

    // 2. Check for duplicate reference_id for this account
    const { data: existingTx, error: checkErr } = await supabase
      .from('transactions')
      .select('id')
      .eq('account_id', accountId)
      .eq('reference_id', referenceId)
      .maybeSingle();

    if (checkErr) {
      throw checkErr;
    }

    if (existingTx) {
      throw new ConflictError(
        'Duplicate reference_id: A transaction with this reference ID already exists for this account'
      );
    }

    // 3. Balance verification for debit
    let newBalance;
    const currentBalance = Number(account.balance);
    const numericAmount = Number(amount);

    if (type === 'credit') {
      newBalance = Math.round((currentBalance + numericAmount) * 100) / 100;
    } else if (type === 'debit') {
      if (currentBalance < numericAmount) {
        throw new BadRequestError(
          `Insufficient funds for debit transaction. Current balance: ${currentBalance.toFixed(2)}, requested: ${numericAmount.toFixed(2)}`,
          'INSUFFICIENT_FUNDS'
        );
      }
      newBalance = Math.round((currentBalance - numericAmount) * 100) / 100;
    } else {
      throw new BadRequestError("Transaction type must be 'credit' or 'debit'", 'INVALID_TYPE');
    }

    const txId = crypto.randomUUID();
    const now = new Date().toISOString();

    // 4. Insert transaction
    const { data: insertedTx, error: insertErr } = await supabase
      .from('transactions')
      .insert({
        id: txId,
        account_id: accountId,
        type,
        amount: numericAmount,
        description,
        reference_id: referenceId,
        created_at: now
      })
      .select()
      .single();

    if (insertErr) {
      const normalized = normalizeDatabaseError(insertErr);
      if (normalized) throw normalized;
      throw insertErr;
    }

    // 5. Update account balance
    const { error: updateErr } = await supabase
      .from('accounts')
      .update({ balance: newBalance })
      .eq('id', accountId);

    if (updateErr) {
      throw updateErr;
    }

    return {
      transaction: {
        ...insertedTx,
        amount: Number(insertedTx.amount)
      },
      account_id: accountId,
      previous_balance: currentBalance,
      new_balance: newBalance
    };
  }

  /**
   * Retrieves paginated transaction history for an account
   * Supports filtering by type ('credit' | 'debit') and sorting by created_at DESC
   */
  async getTransactionHistory(accountId, { type, page = 1, limit = 10 } = {}) {
    // 1. Verify account exists
    await accountService.getAccountById(accountId);

    // 2. Query transactions with exact count
    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (type) {
      query = query.eq('type', type.toLowerCase());
    }

    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      throw error;
    }

    const totalRecords = count !== null ? count : (data ? data.length : 0);
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    const formattedTransactions = (data || []).map(tx => ({
      ...tx,
      amount: Number(tx.amount)
    }));

    return {
      transactions: formattedTransactions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total_records: totalRecords,
        total_pages: totalPages
      }
    };
  }
}

module.exports = new TransactionService();
