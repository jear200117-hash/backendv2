const config = require('../config');

// Shape a consistent error response
function formatErrorResponse(err, req, statusCode) {
  const isDev = config.NODE_ENV === 'development';
  return {
    error: err.code || 'error',
    message: err.publicMessage || err.message || 'Internal server error',
    statusCode,
    path: req.originalUrl,
    requestId: req.id,
    ...(isDev ? { stack: err.stack } : {})
  };
}

// 404 handler
function notFound(req, res, next) {
  res.status(404).json({
    error: 'not_found',
    message: 'Route not found',
    path: req.originalUrl,
    requestId: req.id
  });
}

// Centralized error handler
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Known axios / validation / auth errors
  if (err.name === 'ValidationError') {
    return res.status(400).json(formatErrorResponse({
      ...err,
      code: 'validation_error',
      publicMessage: 'Validation failed'
    }, req, 400));
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json(formatErrorResponse({
      ...err,
      code: 'invalid_token',
      publicMessage: 'Invalid token'
    }, req, 401));
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json(formatErrorResponse({
      ...err,
      code: 'token_expired',
      publicMessage: 'Token expired'
    }, req, 401));
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json(formatErrorResponse({
      ...err,
      code: 'file_too_large',
      publicMessage: 'File too large'
    }, req, 400));
  }

  const status = err.status || err.statusCode || 500;
  // Fallback
  res.status(status).json(formatErrorResponse(err, req, status));
}

module.exports = { notFound, errorHandler };


