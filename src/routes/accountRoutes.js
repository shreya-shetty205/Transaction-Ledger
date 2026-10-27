const express = require('express');
const accountController = require('../controllers/accountController');
const transactionController = require('../controllers/transactionController');
const {
  validateCreateAccount,
  validateAccountId,
  validateAddTransaction,
  validateTransactionQuery
} = require('../middlewares/validator');

const router = express.Router();

// Account creation
router.post('/', validateCreateAccount, accountController.createAccount);

// List accounts
router.get('/', accountController.listAccounts);

// Get account details
router.get('/:id', validateAccountId, accountController.getAccount);

// Get account balance
router.get('/:id/balance', validateAccountId, accountController.getAccountBalance);

// Get transaction history for an account (with filtering & pagination)
router.get('/:id/transactions', validateAccountId, validateTransactionQuery, transactionController.getTransactionHistory);

// Add transaction to specific account via sub-resource route
router.post('/:id/transactions', validateAddTransaction, transactionController.addTransaction);

module.exports = router;
