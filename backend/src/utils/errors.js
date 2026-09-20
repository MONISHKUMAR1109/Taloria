/**
 * Stable, machine-readable error codes (documented in docs/ERROR_CODES.md).
 * Codes are part of the API contract — do not rename them casually.
 */
export const ERROR_CODES = Object.freeze({
  VALIDATION: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  EMAIL_VERIFICATION_REQUIRED: 'EMAIL_VERIFICATION_REQUIRED',
  EMAIL_VERIFICATION_INVALID: 'EMAIL_VERIFICATION_INVALID',
  EMAIL_VERIFICATION_EXPIRED: 'EMAIL_VERIFICATION_EXPIRED',
  PASSWORD_RESET_INVALID: 'PASSWORD_RESET_INVALID',
  PASSWORD_RESET_EXPIRED: 'PASSWORD_RESET_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
  TOURNAMENT_CLOSED: 'TOURNAMENT_CLOSED',
  TOURNAMENT_DEADLINE_PASSED: 'TOURNAMENT_DEADLINE_PASSED',
  TOURNAMENT_NOT_OPEN: 'TOURNAMENT_NOT_OPEN',
  TOURNAMENT_ILLEGAL_TRANSITION: 'TOURNAMENT_ILLEGAL_TRANSITION',
  TOURNAMENT_FULL: 'TOURNAMENT_FULL',
  APPLICANT_NOT_PENDING: 'APPLICANT_NOT_PENDING',
  PARTICIPANT_ALREADY_EXISTS: 'PARTICIPANT_ALREADY_EXISTS',
  SPONSORSHIP_SLOT_FULL: 'SPONSORSHIP_SLOT_FULL',
  SPONSORSHIP_ALREADY_REQUESTED: 'SPONSORSHIP_ALREADY_REQUESTED',
  SPONSORSHIP_NOT_PENDING: 'SPONSORSHIP_NOT_PENDING',
  STAT_TEMPLATE_MISMATCH: 'STAT_TEMPLATE_MISMATCH',
  VIDEO_LIMIT_REACHED: 'VIDEO_LIMIT_REACHED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TYPE_UNSUPPORTED: 'FILE_TYPE_UNSUPPORTED',
  BLOCKED: 'BLOCKED',
  ROLE_NOT_ALLOWED: 'ROLE_NOT_ALLOWED',
  ROLE_CHANGE_NOT_ALLOWED: 'ROLE_CHANGE_NOT_ALLOWED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  VERIFICATION_ALREADY_PENDING: 'VERIFICATION_ALREADY_PENDING',
  BLOCKED_ACTION: 'BLOCKED_ACTION',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL_ERROR',
});

export class AppError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function errorBody(err) {
  return {
    success: false,
    error: {
      code: err.code || ERROR_CODES.INTERNAL,
      message: err.message || 'An unexpected error occurred.',
      details: err.details ?? null,
    },
  };
}

export function badRequest(code, message, details = null) {
  return new AppError(code, message, 400, details);
}

export function unauthorized(message = 'Authentication required.') {
  return new AppError(ERROR_CODES.UNAUTHORIZED, message, 401);
}

export function forbidden(message = 'You do not have permission to do this.') {
  return new AppError(ERROR_CODES.FORBIDDEN, message, 403);
}

export function notFound(message = 'Resource not found.') {
  return new AppError(ERROR_CODES.NOT_FOUND, message, 404);
}

export function conflict(message = 'Conflict with existing state.') {
  return new AppError(ERROR_CODES.CONFLICT, message, 409);
}