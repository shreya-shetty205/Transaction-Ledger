function sendSuccess(res, data = null, statusCode = 200, message = null, meta = null) {
  const payload = {
    success: true
  };

  if (message) {
    payload.message = message;
  }

  if (data !== null) {
    payload.data = data;
  }

  if (meta !== null) {
    payload.pagination = meta;
  }

  return res.status(statusCode).json(payload);
}

function sendError(res, error, defaultStatusCode = 500) {
  const statusCode = error.statusCode || defaultStatusCode;
  const code = error.code || 'INTERNAL_SERVER_ERROR';
  const message = error.message || 'An unexpected error occurred';

  const payload = {
    success: false,
    error: {
      code,
      message
    }
  };

  if (error.details) {
    payload.error.details = error.details;
  }

  return res.status(statusCode).json(payload);
}

module.exports = {
  sendSuccess,
  sendError
};
