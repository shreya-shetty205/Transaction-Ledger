const { ApiError } = require('../utils/errors');
const { sendError } = require('../utils/response');

/**
 * Maps database errors (PostgreSQL/Supabase) to friendly ApiErrors
 */
function normalizeDatabaseError(err) {
  const message = err.message || '';
  const code = err.code || '';
  const details = err.details || err.hint || null;

  // Insufficient funds
  if (message.includes('INSUFFICIENT_FUNDS') || code === '22003') {
    const error = new ApiError(
      message.replace(/^.*?INSUFFICIENT_FUNDS:\s*/, '') || 'Insufficient funds for this transaction',
      400,
      'INSUFFICIENT_FUNDS',
      details
    );
    return error;
  }

  // Duplicate reference ID or unique constraint violation
  if (message.includes('DUPLICATE_REFERENCE') || code === '23505' || message.includes('uq_account_reference')) {
    const error = new ApiError(
      'Duplicate reference_id: A transaction with this reference ID already exists for this account',
      409,
      'DUPLICATE_REFERENCE_ID',
      details
    );
    return error;
  }

  // Account not found
  if (message.includes('ACCOUNT_NOT_FOUND') || code === 'P0002' || code === '23503') {
    const error = new ApiError(
      'Account not found or does not exist',
      404,
      'ACCOUNT_NOT_FOUND',
      details
    );
    return error;
  }

  // Invalid parameters
  if (message.includes('INVALID_TYPE') || message.includes('INVALID_AMOUNT') || message.includes('INVALID_TRANSFER') || code === '22023') {
    const error = new ApiError(
      message.replace(/^.*?INVALID_[A-Z]+:\s*/, '') || 'Invalid transaction parameter',
      400,
      'INVALID_PARAMETER',
      details
    );
    return error;
  }

  // Immutability violation
  if (message.includes('DATA_INTEGRITY_VIOLATION') || code === '27000') {
    const error = new ApiError(
      'Transactions are immutable and cannot be updated or deleted.',
      405,
      'TRANSACTION_IMMUTABLE',
      details
    );
    return error;
  }

  return null;
}

/**
 * Centralized error handler middleware
 */
function errorHandler(err, req, res, next) {
  // Check if error is malformed JSON from body-parser
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return sendError(
      res,
      {
        statusCode: 400,
        code: 'INVALID_JSON',
        message: 'Malformed JSON payload received in request body'
      },
      400
    );
  }

  // Check if it can be normalized from a database error
  const dbError = normalizeDatabaseError(err);
  if (dbError) {
    return sendError(res, dbError, dbError.statusCode);
  }

  // Check if it is an instance of ApiError
  if (err instanceof ApiError) {
    return sendError(res, err, err.statusCode);
  }

  // Supabase PostgREST error structure check
  if (err && typeof err === 'object' && (err.code || err.details || err.message)) {
    const postgrestError = normalizeDatabaseError(err);
    if (postgrestError) {
      return sendError(res, postgrestError, postgrestError.statusCode);
    }
  }

  // Unhandled error
  console.error('Unhandled Application Error:', err);

  const isProduction = process.env.NODE_ENV === 'production';
  return sendError(
    res,
    {
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: isProduction ? 'An unexpected server error occurred' : err.message || 'Internal server error'
    },
    500
  );
}

module.exports = {
  errorHandler,
  normalizeDatabaseError
};
