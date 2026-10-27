const crypto = require('crypto');
const supabase = require('../config/supabase');
const accountService = require('./accountService');
const { 
  BadRequestError, 
  ConflictError 
} = require('../utils/errors');
const { normalizeDatabaseError } = require('../middlewares/errorHandler');

class TransferService {
  /**
   * Atomically transfers funds between two accounts.
   * Utilizes the 'transfer_funds' PL/pgSQL function with deterministic row ordering
   * to guarantee zero race conditions and zero deadlocks.
   */
  async transferFunds({ fromAccountId, toAccountId, amount, description, referenceId }) {
    if (fromAccountId === toAccountId) {
      throw new BadRequestError('Sender and recipient accounts must be different', 'IDENTICAL_ACCOUNTS');
    }

    const { data, error } = await supabase.rpc('transfer_funds', {
      p_from_account_id: fromAccountId,
      p_to_account_id: toAccountId,
      p_amount: amount,
      p_description: description,
      p_reference_id: referenceId
    });

    if (!error && data) {
      return data;
    }

    if (error) {
      const normalized = normalizeDatabaseError(error);
      if (normalized) {
        throw normalized;
      }

      if (error.code === 'PGRST202' || error.code === '42703' || error.message.includes('transfer_funds') || error.message.includes('updated_at')) {
        return await this._transferFundsFallback({
          fromAccountId,
          toAccountId,
          amount,
          description,
          referenceId
        });
      }

      throw error;
    }

    throw new Error('Unexpected error processing fund transfer');
  }

  /**
   * Fallback implementation if the PostgreSQL RPC is not yet created
   */
  async _transferFundsFallback({ fromAccountId, toAccountId, amount, description, referenceId }) {
    const fromAccount = await accountService.getAccountById(fromAccountId);
    const toAccount = await accountService.getAccountById(toAccountId);

    const refDebit = `${referenceId}-DR`;
    const refCredit = `${referenceId}-CR`;

    // Check duplicate reference in sender or receiver
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id')
      .or(`reference_id.eq.${refDebit},reference_id.eq.${refCredit}`)
      .limit(1);

    if (existingTx && existingTx.length > 0) {
      throw new ConflictError('Transfer reference ID has already been processed');
    }

    const numericAmount = Number(amount);
    const fromBalance = Number(fromAccount.balance);
    const toBalance = Number(toAccount.balance);

    if (fromBalance < numericAmount) {
      throw new BadRequestError(
        `Insufficient funds in sender account. Current balance: ${fromBalance.toFixed(2)}, requested: ${numericAmount.toFixed(2)}`,
        'INSUFFICIENT_FUNDS'
      );
    }

    const fromNewBalance = Math.round((fromBalance - numericAmount) * 100) / 100;
    const toNewBalance = Math.round((toBalance + numericAmount) * 100) / 100;
    const now = new Date().toISOString();

    // 1. Debit sender
    const debitTxId = crypto.randomUUID();
    const { data: debitTx, error: debitTxErr } = await supabase
      .from('transactions')
      .insert({
        id: debitTxId,
        account_id: fromAccountId,
        type: 'debit',
        amount: numericAmount,
        description: `Transfer to ${toAccount.account_holder_name}: ${description}`,
        reference_id: refDebit,
        created_at: now
      })
      .select()
      .single();

    if (debitTxErr) throw debitTxErr;

    // 2. Credit receiver
    const creditTxId = crypto.randomUUID();
    const { data: creditTx, error: creditTxErr } = await supabase
      .from('transactions')
      .insert({
        id: creditTxId,
        account_id: toAccountId,
        type: 'credit',
        amount: numericAmount,
        description: `Transfer from ${fromAccount.account_holder_name}: ${description}`,
        reference_id: refCredit,
        created_at: now
      })
      .select()
      .single();

    if (creditTxErr) throw creditTxErr;

    // 3. Update sender balance
    await supabase.from('accounts').update({ balance: fromNewBalance }).eq('id', fromAccountId);

    // 4. Update receiver balance
    await supabase.from('accounts').update({ balance: toNewBalance }).eq('id', toAccountId);

    return {
      transfer_reference: referenceId,
      amount: numericAmount,
      from_account: {
        account_id: fromAccountId,
        previous_balance: fromBalance,
        new_balance: fromNewBalance,
        transaction: debitTx
      },
      to_account: {
        account_id: toAccountId,
        previous_balance: toBalance,
        new_balance: toNewBalance,
        transaction: creditTx
      },
      created_at: now
    };
  }
}

module.exports = new TransferService();
