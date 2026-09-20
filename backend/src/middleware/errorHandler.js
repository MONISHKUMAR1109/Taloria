import { AppError, ERROR_CODES, errorBody } from '../utils/errors.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(ERROR_CODES.NOT_FOUND, `Route ${req.method} ${req.originalUrl} not found.`, 404));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(errorBody(
      new AppError(ERROR_CODES.VALIDATION, 'Malformed JSON in request body.', 400),
    ));
  }

  const status = err.status || (err instanceof AppError ? err.status : 500);
  const body = errorBody(err);

  // Auth-code remapping so raw bounded errors never leak.
  if (body.error.code === 'TOKEN_EXPIRED' || body.error.code === 'TOKEN_INVALID') {
    body.error.message = 'Your session is invalid or has expired. Please log in again.';
  }

  if (status >= 500) {
    // Raw stack traces and SQL errors are logged server-side only.
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  res.status(status).json(body);
}