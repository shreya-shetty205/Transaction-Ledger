const express = require('express');
const transferController = require('../controllers/transferController');
const { validateTransfer } = require('../middlewares/validator');

const router = express.Router();

// Atomic fund transfer between accounts (Bonus feature)
router.post('/', validateTransfer, transferController.transferFunds);

module.exports = router;
