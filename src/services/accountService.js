const crypto = require('crypto');
const supabase = require('../config/supabase');
const { NotFoundError, BadRequestError } = require('../utils/errors');

class AccountService {
  /**
   * Creates a new account with a guaranteed zero balance and unique ID.
   * Populates both 'name' and 'account_holder_name' for compatibility with existing schemas.
   */
  async createAccount({ account_holder_name }) {
    if (!account_holder_name || typeof account_holder_name !== 'string' || !account_holder_name.trim()) {
      throw new BadRequestError('account_holder_name is required and cannot be empty');
    }

    const trimmedName = account_holder_name.trim();
    const accountId = crypto.randomUUID();

    // Data Integrity: Balance is strictly initialized to 0.00 on the server.
    const newAccountData = {
      id: accountId,
      name: trimmedName,
      account_holder_name: trimmedName,
      balance: 0.00
    };

    const { data, error } = await supabase
      .from('accounts')
      .insert(newAccountData)
      .select()
      .single();

    if (error) {
      // In case table only has 'name' and no 'account_holder_name' column
      if (error.message && error.message.includes('account_holder_name')) {
        const fallbackData = {
          id: accountId,
          name: trimmedName,
          balance: 0.00
        };
        const fallbackRes = await supabase.from('accounts').insert(fallbackData).select().single();
        if (fallbackRes.error) {
          throw fallbackRes.error;
        }
        return {
          id: fallbackRes.data.id,
          account_holder_name: fallbackRes.data.name || trimmedName,
          balance: Number(fallbackRes.data.balance || 0),
          created_at: fallbackRes.data.created_at
        };
      }
      throw error;
    }

    return {
      id: data.id,
      name: data.name || data.account_holder_name,
      account_holder_name: data.account_holder_name || data.name,
      balance: Number(data.balance),
      created_at: data.created_at
    };
  }

  /**
   * Retrieves an account by its unique UUID
   */
  async getAccountById(id) {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new NotFoundError(`Account not found with ID: ${id}`);
    }

    return {
      id: data.id,
      name: data.name || data.account_holder_name,
      account_holder_name: data.account_holder_name || data.name,
      balance: Number(data.balance),
      created_at: data.created_at
    };
  }

  /**
   * Retrieves only the account ID and its current balance
   */
  async getAccountBalance(id) {
    const account = await this.getAccountById(id);

    return {
      account_id: account.id,
      name: account.name || account.account_holder_name,
      account_holder_name: account.account_holder_name || account.name,
      balance: account.balance,
      created_at: account.created_at
    };
  }

  /**
   * Lists all accounts (helper for testing and administration)
   */
  async listAccounts({ limit = 50 } = {}) {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, name, account_holder_name, balance, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return (data || []).map(acc => ({
      id: acc.id,
      account_holder_name: acc.account_holder_name || acc.name,
      balance: Number(acc.balance),
      created_at: acc.created_at
    }));
  }
}

module.exports = new AccountService();
