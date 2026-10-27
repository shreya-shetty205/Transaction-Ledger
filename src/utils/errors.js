class ApiError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends ApiError {
  constructor(message = 'Bad Request', code = 'BAD_REQUEST', details = null) {
    super(message, 400, code, details);
  }
}

class NotFoundError extends ApiError {
  constructor(message = 'Resource Not Found', code = 'NOT_FOUND', details = null) {
    super(message, 404, code, details);
  }
}

class ConflictError extends ApiError {
  constructor(message = 'Conflict', code = 'CONFLICT', details = null) {
    super(message, 409, code, details);
  }
}

class UnprocessableEntityError extends ApiError {
  constructor(message = 'Unprocessable Entity', code = 'UNPROCESSABLE_ENTITY', details = null) {
    super(message, 422, code, details);
  }
}

class MethodNotAllowedError extends ApiError {
  constructor(message = 'Method Not Allowed', code = 'METHOD_NOT_ALLOWED', details = null) {
    super(message, 405, code, details);
  }
}

module.exports = {
  ApiError,
  BadRequestError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  MethodNotAllowedError
};
