import pool from '../config/db.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { unauthorized } from '../utils/errors.js';

/**
 * Verifies the Bearer access token and loads the CURRENT user + role from the
 * database on every request. The JWT contains only user_id; role is never
 * trusted from the token, request body, or query parameters.
 */
export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw unauthorized('Authentication required.');
    }

    const payload = await verifyAccessToken(token);

    const { rows } = await pool.query(
      `SELECT id, email, role, account_status, email_verified_at
         FROM users
        WHERE id = $1`,
      [payload.user_id],
    );

    if (rows.length === 0) {
      throw unauthorized('Account not found.');
    }

    const user = rows[0];
    if (user.account_status === 'suspended') {
      const err = new Error('This account is suspended.');
      err.code = 'ACCOUNT_SUSPENDED';
      err.status = 403;
      throw err;
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}