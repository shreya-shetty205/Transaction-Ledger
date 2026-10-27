const express = require('express');
const transactionController = require('../controllers/transactionController');
const { validateAddTransaction } = require('../middlewares/validator');

const router = express.Router();

// Add transaction (credit or debit)
router.post('/', validateAddTransaction, transactionController.addTransaction);

// Immutable Ledger Enforcement: Disallow edit and delete via API
router.put('/:id', transactionController.rejectModification);
router.patch('/:id', transactionController.rejectModification);
router.delete('/:id', transactionController.rejectModification);

module.exports = router;
