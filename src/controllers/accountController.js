const accountService = require('../services/accountService');
const { sendSuccess } = require('../utils/response');

class AccountController {
  /**
   * POST /api/accounts
   * Create a new account
   */
  async createAccount(req, res, next) {
    try {
      const { account_holder_name } = req.body;
      const account = await accountService.createAccount({ account_holder_name });
      return sendSuccess(res, account, 201, 'Account created successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/accounts/:id
   * Get account details by ID
   */
  async getAccount(req, res, next) {
    try {
      const { id } = req.params;
      const account = await accountService.getAccountById(id);
      return sendSuccess(res, account, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/accounts/:id/balance
   * Get account balance
   */
  async getAccountBalance(req, res, next) {
    try {
      const { id } = req.params;
      const balanceData = await accountService.getAccountBalance(id);
      return sendSuccess(res, balanceData, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/accounts
   * List accounts
   */
  async listAccounts(req, res, next) {
    try {
      const accounts = await accountService.listAccounts();
      return sendSuccess(res, accounts, 200);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AccountController();
