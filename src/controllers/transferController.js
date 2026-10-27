const transferService = require('../services/transferService');
const { sendSuccess } = require('../utils/response');

class TransferController {
  /**
   * POST /api/transfers
   * Atomically transfer money between two accounts
   */
  async transferFunds(req, res, next) {
    try {
      const { from_account_id, to_account_id, amount, description, reference_id } = req.body;
      const result = await transferService.transferFunds({
        fromAccountId: from_account_id,
        toAccountId: to_account_id,
        amount,
        description,
        referenceId: reference_id
      });

      return sendSuccess(res, result, 201, 'Fund transfer completed successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new TransferController();
