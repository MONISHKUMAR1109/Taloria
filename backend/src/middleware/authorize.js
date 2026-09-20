import { forbidden } from '../utils/errors.js';

/**
 * Role-based authorization, evaluated server-side after authenticate().
 * req.user.role always comes fresh from the users table.
 *
 * @param  {...('athlete'|'scout'|'organizer'|'sponsor'|'admin')} roles
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(forbidden());
    }
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`Role "${req.user.role}" is not allowed for this action.`));
    }
    return next();
  };
}

/** Convenience: only the account owner (or admin) may proceed. */
export function requireOwnerOrAdmin(loadOwnerUserId) {
  return async (req, _res, next) => {
    try {
      if (!req.user) return next(forbidden());
      if (req.user.role === 'admin') return next();
      const ownerUserId = await loadOwnerUserId(req);
      if (ownerUserId === req.user.id) return next();
      return next(forbidden());
    } catch (err) {
      return next(err);
    }
  };
}