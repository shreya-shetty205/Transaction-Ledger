const transactionService = require('../services/transactionService');
const { sendSuccess } = require('../utils/response');
const { MethodNotAllowedError } = require('../utils/errors');

class TransactionController {
  /**
   * POST /api/transactions
   * Add a credit or debit transaction
   */
  async addTransaction(req, res, next) {
    try {
      const { account_id, type, amount, description, reference_id } = req.body;
      const result = await transactionService.addTransaction({
        accountId: account_id,
        type,
        amount,
        description,
        referenceId: reference_id
      });

      return sendSuccess(res, result, 201, 'Transaction recorded successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/accounts/:id/transactions
   * Get paginated transaction history with optional type filter
   */
  async getTransactionHistory(req, res, next) {
    try {
      const accountId = req.params.id || req.params.accountId;
      const { type, page, limit } = req.query;

      const { transactions, pagination } = await transactionService.getTransactionHistory(
        accountId,
        { type, page, limit }
      );

      return sendSuccess(res, transactions, 200, null, pagination);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Block any modification or deletion to enforce transaction immutability
   * PUT /api/transactions/:id, PATCH /api/transactions/:id, DELETE /api/transactions/:id
   */
  rejectModification(req, res, next) {
    return next(new MethodNotAllowedError('Transactions are immutable and cannot be modified or deleted.'));
  }
}

module.exports = new TransactionController();
