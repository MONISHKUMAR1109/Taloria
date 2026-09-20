import rateLimit from 'express-rate-limit';
import { ERROR_CODES } from '../utils/errors.js';

const rateLimitedBody = {
  success: false,
  error: {
    code: ERROR_CODES.RATE_LIMITED,
    message: 'Too many requests. Please try again shortly.',
    details: { window: '1 minute' },
  },
};

function limitRequests(maxPerMinute) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: maxPerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json(rateLimitedBody);
    },
  });
}

/** Applied to auth endpoints (e.g. 10 req/min/IP on login). */
export const authRateLimit = limitRequests(10);

/** Generic API-safe limit to prevent runaway clients. */
export const apiRateLimit = limitRequests(120);

export default authRateLimit;