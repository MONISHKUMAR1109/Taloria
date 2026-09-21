import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { ok, created } from '../utils/envelope.js';
import { notFound, forbidden, AppError, ERROR_CODES } from '../utils/errors.js';

const router = Router();

const submitSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

const reviewSchema = z.object({
  status: z.enum(['verified', 'rejected']),
  review_note: z.string().trim().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// POST /api/verification-requests — athlete asks for verification (§21).
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  requireRole('athlete'),
  validateBody(submitSchema),
  asyncHandler(async (req, res) => {
    const { rows: pr } = await pool.query(
      'SELECT id, verification_status FROM athlete_profiles WHERE user_id = $1 AND archived_at IS NULL',
      [req.user.id],
    );
    if (pr.length === 0) throw forbidden('Athlete profile required.');
    const profile = pr[0];

    if (profile.verification_status === 'verified') {
      throw new AppError(ERROR_CODES.VERIFICATION_ALREADY_PENDING, 'Your profile is already verified.', 409);
    }
    const existing = await pool.query(
      `SELECT id, status FROM verification_requests WHERE athlete_id = $1 AND status = 'pending'`,
      [profile.id],
    );
    if (existing.rowCount > 0) {
      throw new AppError(ERROR_CODES.VERIFICATION_ALREADY_PENDING, 'A verification request is already pending.', 409);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO verification_requests (athlete_id, status, review_note, is_seed)
         VALUES ($1, 'pending', $2, false)
         RETURNING id, athlete_id, status, requested_at`,
        [profile.id, req.body.note ?? null],
      );
      await client.query(
        `UPDATE athlete_profiles SET verification_status = 'pending', updated_at = now() WHERE id = $1`,
        [profile.id],
      );
      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, from_state, to_state, actor_id, is_seed)
         VALUES ('verification_request', $1, 'unverified', 'pending', $2, false)`,
        [rows[0].id, req.user.id],
      );
      await client.query('COMMIT');
      res.status(201).json(created(rows[0]));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ---------------------------------------------------------------------------
// PUT /api/verification-requests/:id — admin reviews.
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  authenticate,
  requireRole('admin'),
  validateBody(reviewSchema),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT vr.*, ap.user_id AS athlete_user_id, CONCAT(ap.first_name, ' ', ap.last_name) AS athlete_name
         FROM verification_requests vr
         JOIN athlete_profiles ap ON ap.id = vr.athlete_id
        WHERE vr.id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) throw notFound('Verification request not found.');
    const request = rows[0];
    const fromState = request.status;
    if (fromState !== 'pending') {
      throw new AppError(ERROR_CODES.BLOCKED_ACTION, `Request already reviewed (status: "${fromState}").`, 409);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE verification_requests
            SET status = $1, review_note = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
          WHERE id = $4`,
        [req.body.status, req.body.review_note ?? null, req.user.id, req.params.id],
      );
      await client.query(
        `UPDATE athlete_profiles SET verification_status = $1, updated_at = now() WHERE id = $2`,
        [req.body.status, request.athlete_id],
      );

      const title = req.body.status === 'verified' ? 'Profile verified' : 'Verification update';
      const body = req.body.status === 'verified'
        ? `Your profile is now verified. Your verified badge is shown on your profile.`
        : `Your verification request was declined. ${req.body.review_note ? req.body.review_note : 'Review the grounds and resubmit when ready.'}`;
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, is_seed)
         VALUES ($1, 'verification_${req.body.status}', $2, $3, false)`,
        [request.athlete_user_id, title, body],
      );

      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, from_state, to_state, actor_id, is_seed)
         VALUES ('verification_request', $1, 'pending', $2, $3, false)`,
        [req.params.id, req.body.status, req.user.id],
      );
      await client.query('COMMIT');

      res.json(ok({ id: req.params.id, status: req.body.status }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ---------------------------------------------------------------------------
// GET /api/verification-requests — admin queue (helper for the admin routes).
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT vr.id, vr.athlete_id, vr.status, vr.requested_at, vr.reviewed_at, vr.review_note,
              CONCAT(ap.first_name, ' ', ap.last_name) AS athlete_name,
              ap.country, ap.city, ap.bio,
              (SELECT count(*)::int FROM athlete_sports a2 WHERE a2.athlete_id = ap.id) AS sport_count
         FROM verification_requests vr
         JOIN athlete_profiles ap ON ap.id = vr.athlete_id
        ORDER BY CASE vr.status WHEN 'pending' THEN 0 ELSE 1 END, vr.requested_at`,
    );
    res.json(ok(rows));
  }),
);

export default router;