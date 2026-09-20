import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import env from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  generateOpaqueToken,
  hashOpaqueToken,
  isTokenExpired,
  signAccessToken,
} from '../utils/tokens.js';
import { validateBody } from '../middleware/validate.js';
import { authRateLimit } from '../middleware/rateLimiters.js';
import { authenticate } from '../middleware/authenticate.js';
import { ok, created } from '../utils/envelope.js';
import {
  badRequest,
  unauthorized,
  AppError,
  ERROR_CODES,
} from '../utils/errors.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/mailer.js';

const router = Router();

const ROLES = ['athlete', 'scout', 'organizer', 'sponsor'];

const profileTableByRole = {
  athlete: 'athlete_profiles',
  scout: 'scout_profiles',
  organizer: 'organizer_profiles',
  sponsor: 'sponsor_profiles',
};

const REDIRECT_BY_ROLE = {
  athlete: '/dashboard/athlete',
  scout: '/dashboard/scout',
  organizer: '/dashboard/organizer',
  sponsor: '/dashboard/sponsor',
  admin: '/dashboard/admin',
};

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  role: z.enum(ROLES),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email().max(254),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

const resendVerificationSchema = z.object({
  email: z.string().email().max(254),
});

function userPayload(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    emailVerified: row.email_verified_at !== null,
  };
}

function setRefreshCookie(res, token) {
  res.cookie('rt', token, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: env.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  });
}

async function issueTokens(userId, client, res) {
  const accessToken = await signAccessToken(userId);
  const refreshToken = generateRefreshToken();
  await client.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3::int || ' days')::interval)`,
    [userId, hashRefreshToken(refreshToken), env.refreshTokenTtlDays],
  );
  setRefreshCookie(res, refreshToken);
  return { accessToken, refreshToken };
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// Creates the account and the matching empty profile row in one transaction.
// The requested role is a request, not a grant — and 'admin' is never allowed.
// ---------------------------------------------------------------------------
router.post(
  '/register',
  authRateLimit,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, role } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rowCount > 0) {
        throw new AppError(ERROR_CODES.EMAIL_TAKEN, 'An account with this email already exists.', 409);
      }

      const passwordHash = await hashPassword(password);
      const verificationToken = generateOpaqueToken();
      const inserted = await client.query(
        `INSERT INTO users (email, password_hash, role,
                            email_verification_token_hash, email_verification_token_expires_at)
         VALUES ($1, $2, $3, $4, now() + interval '24 hours')
         RETURNING id, email, role`,
        [email, passwordHash, role, hashOpaqueToken(verificationToken)],
      );
      const user = inserted.rows[0];

      await client.query(
        `INSERT INTO ${profileTableByRole[role]} (user_id, is_seed) VALUES ($1, false)`,
        [user.id],
      );

      await client.query('COMMIT');

      // Send token after commit so a mail failure never rolls back the account.
      await sendVerificationEmail(email, verificationToken);

      res.status(201).json(created({
        user: userPayload({ ...user, email_verified_at: null }),
        message: 'Account created. Check your email to verify it.',
      }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/login
// Generic INVALID_CREDENTIALS for both unknown email and wrong password.
// ---------------------------------------------------------------------------
router.post(
  '/login',
  authRateLimit,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const { rows } = await pool.query(
      `SELECT id, email, password_hash, role, account_status, email_verified_at
         FROM users WHERE email = $1`,
      [email],
    );

    const user = rows[0];
    const passwordHash = user ? user.password_hash : '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7l0qP.O7VYo5g1jweF5THZ8pVh4tKj6';
    const matches = await verifyPassword(password, passwordHash);

    if (!user || !matches) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password.', 401);
    }

    if (user.account_status === 'suspended') {
      throw new AppError(ERROR_CODES.ACCOUNT_SUSPENDED, 'This account is suspended.', 403);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { accessToken, refreshToken } = await issueTokens(user.id, client, res);
      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, from_state, to_state, actor_id, is_seed)
         VALUES ('user', $1, NULL, 'login', $1, false)`,
        [user.id],
      );
      await client.query('COMMIT');

      res.json(ok({
        accessToken,
        refreshToken,
        user: userPayload(user),
        redirect: REDIRECT_BY_ROLE[user.role],
      }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/refresh — rotates the refresh token on every use.
// ---------------------------------------------------------------------------
router.post(
  '/refresh',
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    const provided = req.body.refreshToken || req.cookies?.rt;
    if (!provided) throw unauthorized('Refresh token required.');

    const hash = hashRefreshToken(provided);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
        [hash],
      );
      const stored = rows[0];

      if (!stored) throw unauthorized('Invalid refresh token.');
      if (stored.revoked_at) {
        // Replay of a rotated token → revoke the whole family.
        await client.query(
          'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
          [stored.user_id],
        );
        throw unauthorized('Refresh token already used. Please log in again.');
      }
      if (isTokenExpired(stored.expires_at)) {
        throw unauthorized('Refresh token expired. Please log in again.');
      }

      await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [stored.id]);

      const { rows: userRows } = await client.query(
        `SELECT id, email, role, account_status, email_verified_at FROM users WHERE id = $1`,
        [stored.user_id],
      );
      if (userRows.length === 0) throw unauthorized('Account not found.');
      if (userRows[0].account_status === 'suspended') {
        throw new AppError(ERROR_CODES.ACCOUNT_SUSPENDED, 'This account is suspended.', 403);
      }

      const { accessToken, refreshToken } = await issueTokens(stored.user_id, client, res);
      await client.query('COMMIT');

      res.json(ok({ accessToken, refreshToken, user: userPayload(userRows[0]) }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/logout — revokes the presentation refresh token.
// ---------------------------------------------------------------------------
router.post(
  '/logout',
  validateBody(logoutSchema),
  asyncHandler(async (req, res) => {
    const provided = req.body.refreshToken || req.cookies?.rt;
    if (provided) {
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = now()
          WHERE token_hash = $1 AND revoked_at IS NULL`,
        [hashRefreshToken(provided)],
      );
    }
    res.clearCookie('rt', { path: '/api/auth' });
    res.json(ok(true));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/verify-email
// ---------------------------------------------------------------------------
router.post(
  '/verify-email',
  authRateLimit,
  validateBody(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    const hash = hashOpaqueToken(token);

    const { rows } = await pool.query(
      `SELECT id, email_verified_at, email_verification_token_expires_at
         FROM users
        WHERE email_verification_token_hash = $1`,
      [hash],
    );
    const user = rows[0];

    if (!user) throw badRequest(ERROR_CODES.EMAIL_VERIFICATION_INVALID, 'Verification link is invalid.');
    if (user.email_verified_at) return res.json(ok({ message: 'Email already verified.' }));

    const now = Date.now();
    if (!user.email_verification_token_expires_at || new Date(user.email_verification_token_expires_at).getTime() < now) {
      throw badRequest(ERROR_CODES.EMAIL_VERIFICATION_EXPIRED, 'Verification link has expired. Request a new one.');
    }

    await pool.query(
      `UPDATE users
          SET email_verified_at = now(),
              email_verification_token_hash = NULL,
              email_verification_token_expires_at = NULL
        WHERE id = $1`,
      [user.id],
    );

    res.json(ok({ message: 'Email verified. You can now log in.' }));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/resend-verification (token is single-use, 24h, resendable)
// ---------------------------------------------------------------------------
router.post(
  '/resend-verification',
  authRateLimit,
  validateBody(resendVerificationSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const { rows } = await pool.query(
      `SELECT id, email, email_verified_at FROM users WHERE email = $1`,
      [email],
    );
    if (rows.length === 0 || rows[0].email_verified_at) {
      return res.json(ok({ message: 'If an account exists and is unverified, a new link was sent.' }));
    }

    const verificationToken = generateOpaqueToken();
    await pool.query(
      `UPDATE users SET email_verification_token_hash = $1, email_verification_token_expires_at = now() + interval '24 hours'
        WHERE id = $2`,
      [hashOpaqueToken(verificationToken), rows[0].id],
    );
    await sendVerificationEmail(email, verificationToken);
    res.json(ok({ message: 'If an account exists and is unverified, a new link was sent.' }));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password — always returns the same generic message.
// ---------------------------------------------------------------------------
router.post(
  '/forgot-password',
  authRateLimit,
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const { rows } = await pool.query(
      `SELECT id, email FROM users WHERE email = $1`,
      [email],
    );

    if (rows.length === 0) {
      return res.json(ok({ message: 'If an account with that email exists, a reset link will be sent.' }));
    }

    // Overwrite any prior (identical/expired) token so a user can always
    // request a fresh link. Rate limiting keeps this abuse-safe.
    const token = generateOpaqueToken();
    await pool.query(
      `UPDATE users
          SET password_reset_token_hash = $1, password_reset_token_expires_at = now() + interval '1 hour'
        WHERE id = $2`,
      [hashOpaqueToken(token), rows[0].id],
    );
    await sendPasswordResetEmail(email, token);
    res.json(ok({ message: 'If an account with that email exists, a reset link will be sent.' }));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password — single use token, 1h expiry.
// ---------------------------------------------------------------------------
router.post(
  '/reset-password',
  authRateLimit,
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    const hash = hashOpaqueToken(token);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT id, password_reset_token_expires_at
           FROM users WHERE password_reset_token_hash = $1 FOR UPDATE`,
        [hash],
      );
      const user = rows[0];

      if (!user) throw badRequest(ERROR_CODES.PASSWORD_RESET_INVALID, 'Reset link is invalid.');
      if (!user.password_reset_token_expires_at || new Date(user.password_reset_token_expires_at).getTime() < Date.now()) {
        throw badRequest(ERROR_CODES.PASSWORD_RESET_EXPIRED, 'Reset link has expired. Request a new one.');
      }

      const passwordHash = await hashPassword(newPassword);
      await client.query(
        `UPDATE users
            SET password_hash = $1,
                password_reset_token_hash = NULL,
                password_reset_token_expires_at = NULL
          WHERE id = $2`,
        [passwordHash, user.id],
      );
      // Invalidating all sessions after a password reset is the safe default.
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [user.id],
      );

      await client.query('COMMIT');
      res.json(ok({ message: 'Password updated. You can now log in.' }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ---------------------------------------------------------------------------
// GET /api/auth/me — for bootstrapping the client session after refresh.
// ---------------------------------------------------------------------------
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(ok({ user: userPayload(req.user) }));
  }),
);

export default router;