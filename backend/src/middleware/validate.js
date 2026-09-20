import { ZodError } from 'zod';
import { badRequest } from '../utils/errors.js';

/**
 * Validates req.body (or a chosen source) against a zod schema.
 * Server-side validation is authoritative; client-side validation is a UX layer.
 */
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(badRequest('VALIDATION_ERROR', 'Invalid request body.', formatZod(result.error)));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(badRequest('VALIDATION_ERROR', 'Invalid query parameters.', formatZod(result.error)));
    }
    next();
  };
}

export function formatZod(error) {
  if (error instanceof ZodError) {
    return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  }
  return null;
}