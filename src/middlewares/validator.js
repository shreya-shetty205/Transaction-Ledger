const { BadRequestError } = require('../utils/errors');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(str) {
  return typeof str === 'string' && UUID_REGEX.test(str.trim());
}

/**
 * Validates account creation request
 */
function validateCreateAccount(req, res, next) {
  // Support both 'name' (from PDF spec) and 'account_holder_name'
  const rawName = req.body.name !== undefined ? req.body.name : req.body.account_holder_name;

  if (rawName === undefined || rawName === null) {
    return next(new BadRequestError('name is required', 'MISSING_FIELD'));
  }

  if (typeof rawName !== 'string' || rawName.trim().length === 0) {
    return next(new BadRequestError('name must be a non-empty string', 'INVALID_FIELD'));
  }

  if (rawName.trim().length > 255) {
    return next(new BadRequestError('name cannot exceed 255 characters', 'INVALID_FIELD'));
  }

  // Security & Data Integrity: Client is NEVER permitted to set the initial balance.
  // We sanitize the body to strip any client-supplied balance.
  if ('balance' in req.body) {
    delete req.body.balance;
  }

  req.body.name = rawName.trim();
  req.body.account_holder_name = rawName.trim();
  next();
}

/**
 * Validates transaction creation request
 */
function validateAddTransaction(req, res, next) {
  // Support account_id either in URL param or in body
  const account_id = req.params.accountId || req.params.id || req.body.account_id;
  const { type, amount, description, reference_id } = req.body;

  // 1. Account ID validation
  if (!account_id) {
    return next(new BadRequestError('account_id is required', 'MISSING_ACCOUNT_ID'));
  }

  if (!isValidUUID(account_id)) {
    return next(new BadRequestError('account_id must be a valid UUID', 'INVALID_ACCOUNT_ID'));
  }

  // 2. Transaction Type validation
  if (!type) {
    return next(new BadRequestError("type is required and must be either 'credit' or 'debit'", 'MISSING_TYPE'));
  }

  const normalizedType = String(type).trim().toLowerCase();
  if (normalizedType !== 'credit' && normalizedType !== 'debit') {
    return next(new BadRequestError("Transaction type must be 'credit' or 'debit'", 'INVALID_TYPE'));
  }

  // 3. Amount validation
  if (amount === undefined || amount === null || amount === '') {
    return next(new BadRequestError('amount is required', 'MISSING_AMOUNT'));
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || !isFinite(numericAmount) || numericAmount <= 0) {
    return next(new BadRequestError('amount must be a positive number greater than 0', 'INVALID_AMOUNT'));
  }

  // Check reasonable precision (maximum 2 decimal places)
  const amountStr = numericAmount.toString();
  if (amountStr.includes('.') && amountStr.split('.')[1].length > 2) {
    return next(new BadRequestError('amount cannot have more than 2 decimal places', 'INVALID_PRECISION'));
  }

  // 4. Description validation
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return next(new BadRequestError('description is required and must not be empty', 'MISSING_DESCRIPTION'));
  }

  // 5. Reference ID validation
  if (!reference_id || typeof reference_id !== 'string' || reference_id.trim().length === 0) {
    return next(new BadRequestError('reference_id is required and must not be empty', 'MISSING_REFERENCE_ID'));
  }

  req.body.account_id = account_id.trim();
  req.body.type = normalizedType;
  req.body.amount = Math.round(numericAmount * 100) / 100; // standard 2 decimals
  req.body.description = description.trim();
  req.body.reference_id = reference_id.trim();

  next();
}

/**
 * Validates account ID parameter from route params
 */
function validateAccountId(req, res, next) {
  const accountId = req.params.id || req.params.accountId;

  if (!accountId || !isValidUUID(accountId)) {
    return next(new BadRequestError('A valid UUID account ID is required in the URL parameter', 'INVALID_ACCOUNT_ID'));
  }

  next();
}

/**
 * Validates transaction history query parameters (type, page, limit)
 */
function validateTransactionQuery(req, res, next) {
  const { type, page, limit } = req.query;

  // Filter type validation
  if (type !== undefined) {
    const normalizedType = String(type).trim().toLowerCase();
    if (normalizedType !== 'credit' && normalizedType !== 'debit') {
      return next(new BadRequestError("Filter type must be 'credit' or 'debit'", 'INVALID_TYPE_FILTER'));
    }
    req.query.type = normalizedType;
  }

  // Page validation
  let parsedPage = 1;
  if (page !== undefined) {
    parsedPage = parseInt(page, 10);
    if (isNaN(parsedPage) || parsedPage < 1) {
      return next(new BadRequestError('page must be an integer greater than or equal to 1', 'INVALID_PAGE'));
    }
  }

  // Limit validation
  let parsedLimit = 10;
  if (limit !== undefined) {
    parsedLimit = parseInt(limit, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return next(new BadRequestError('limit must be an integer between 1 and 100', 'INVALID_LIMIT'));
    }
  }

  req.query.page = parsedPage;
  req.query.limit = parsedLimit;

  next();
}

/**
 * Validates fund transfer request between two accounts
 */
function validateTransfer(req, res, next) {
  const { from_account_id, to_account_id, amount, description, reference_id } = req.body;

  if (!from_account_id || !isValidUUID(from_account_id)) {
    return next(new BadRequestError('from_account_id must be a valid UUID', 'INVALID_FROM_ACCOUNT_ID'));
  }

  if (!to_account_id || !isValidUUID(to_account_id)) {
    return next(new BadRequestError('to_account_id must be a valid UUID', 'INVALID_TO_ACCOUNT_ID'));
  }

  if (from_account_id.trim() === to_account_id.trim()) {
    return next(new BadRequestError('Sender and recipient accounts cannot be the same', 'IDENTICAL_ACCOUNTS'));
  }

  if (amount === undefined || amount === null || amount === '') {
    return next(new BadRequestError('amount is required', 'MISSING_AMOUNT'));
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || !isFinite(numericAmount) || numericAmount <= 0) {
    return next(new BadRequestError('amount must be a positive number greater than 0', 'INVALID_AMOUNT'));
  }

  const amountStr = numericAmount.toString();
  if (amountStr.includes('.') && amountStr.split('.')[1].length > 2) {
    return next(new BadRequestError('amount cannot have more than 2 decimal places', 'INVALID_PRECISION'));
  }

  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return next(new BadRequestError('description is required and must not be empty', 'MISSING_DESCRIPTION'));
  }

  if (!reference_id || typeof reference_id !== 'string' || reference_id.trim().length === 0) {
    return next(new BadRequestError('reference_id is required and must not be empty', 'MISSING_REFERENCE_ID'));
  }

  req.body.from_account_id = from_account_id.trim();
  req.body.to_account_id = to_account_id.trim();
  req.body.amount = Math.round(numericAmount * 100) / 100;
  req.body.description = description.trim();
  req.body.reference_id = reference_id.trim();

  next();
}

module.exports = {
  isValidUUID,
  validateCreateAccount,
  validateAddTransaction,
  validateAccountId,
  validateTransactionQuery,
  validateTransfer
};
