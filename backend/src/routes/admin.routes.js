import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { ok } from '../utils/envelope.js';
import { notFound, badRequest, AppError, ERROR_CODES } from '../utils/errors.js';
import { audit } from '../utils/audit.js';

const router = Router();

const PROFILE_TABLE = {
  athlete: 'athlete_profiles',
  scout: 'scout_profiles',
  organizer: 'organizer_profiles',
  sponsor: 'sponsor_profiles',
};

const statusSchema = z.object({
  account_status: z.enum(['active', 'suspended']),
});

const roleSchema = z.object({
  role: z.enum(['athlete', 'scout', 'organizer', 'sponsor']),
});

// ---------------------------------------------------------------------------
// GET /api/admin/users — user management.
// ---------------------------------------------------------------------------
router.get(
  '/users',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, sort, order, offset } = parsePagination(
      req,
      ['created_at', 'updated_at', 'email', 'role', 'account_status'],
    );
    const q = req.query;

    const values = [];
    const conditions = [];
    let i = 1;
    const add = (sql, ...vs) => {
      values.push(...vs);
      conditions.push(sql.replace(/\?/g, () => `$${i++}`));
    };

    if (q.role) add('u.role = ?', q.role);
    if (q.account_status) add('u.account_status = ?', q.account_status);
    if (q.q) add('(u.email ILIKE ?)', `%${q.q}%`);

    const whereSql = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const { rows: countRows } = await pool.query(`SELECT count(*)::int AS total FROM users u${whereSql}`, values);
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.role, u.account_status, u.email_verified_at, u.created_at, u.updated_at,
              (SELECT count(*)::int FROM refresh_tokens rt WHERE rt.user_id = u.id AND rt.revoked_at IS NULL) AS active_sessions
         FROM users u${whereSql}
        ORDER BY ${sort} ${order} NULLS LAST, u.id
        LIMIT $${i} OFFSET $${i + 1}`,
      [...values, pageSize, offset],
    );

    res.json(ok(rows, { page, pageSize, total: countRows[0].total, totalPages: Math.max(1, Math.ceil(countRows[0].total / pageSize)) }));
  }),
);

// ---------------------------------------------------------------------------
// PUT /api/admin/users/:id/status — suspend / activate.
// ---------------------------------------------------------------------------
router.put(
  '/users/:id/status',
  authenticate,
  requireRole('admin'),
  validateBody(statusSchema),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) {
      throw badRequest('BLOCKED_ACTION', 'You cannot suspend your own account.');
    }
    const { rows } = await pool.query(
      `UPDATE users SET account_status = $1, updated_at = now() WHERE id = $2 RETURNING id, email, role, account_status`,
      [req.body.account_status, req.params.id],
    );
    if (rows.length === 0) throw notFound('User not found.');
    if (req.body.account_status === 'suspended') {
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [req.params.id],
      );
    }
    await audit({
      entityType: 'user', entityId: req.params.id, actorId: req.user.id, toState: req.body.account_status,
      details: { action: 'account_status' },
    });
    res.json(ok(rows[0]));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/role — Admin-only role change (§4.2).
// Archives the old profile and creates a fresh one of the new role.
// ---------------------------------------------------------------------------
router.post(
  '/users/:id/role',
  authenticate,
  requireRole('admin'),
  validateBody(roleSchema),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT id, role, account_status FROM users WHERE id = $1',
      [req.params.id],
    );
    if (rows.length === 0) throw notFound('User not found.');
    const user = rows[0];

    if (user.account_status === 'suspended') {
      throw badRequest('BLOCKED_ACTION', 'Activate the account before changing its role.');
    }
    if (user.role === req.body.role) {
      throw badRequest('ROLE_CHANGE_NOT_ALLOWED', 'Account already has this role.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE ${PROFILE_TABLE[user.role]} SET archived_at = now(), updated_at = now()
          WHERE user_id = $1 AND archived_at IS NULL`,
        [user.id],
      );
      await client.query(
        `INSERT INTO ${PROFILE_TABLE[req.body.role]} (user_id, is_seed) VALUES ($1, false)`,
        [user.id],
      );
      await client.query(`UPDATE users SET role = $1, updated_at = now() WHERE id = $2`, [req.body.role, user.id]);

      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, from_state, to_state, actor_id, is_seed)
         VALUES ('user_role', $1, $2, $3, $4, false)`,
        [user.id, user.role, req.body.role, req.user.id],
      );
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [user.id],
      );
      await client.query('COMMIT');
      res.json(ok({ id: user.id, role: req.body.role, message: 'Role changed. Existing sessions were revoked.' }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ---------------------------------------------------------------------------
// GET /api/admin/analytics — real COUNT() queries, never fabricated.
// ---------------------------------------------------------------------------
router.get(
  '/analytics',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const [usersByRole, totals, recentRegistrations] = await Promise.all([
      pool.query(`SELECT role, count(*)::int AS total FROM users GROUP BY role ORDER BY role`),
      pool.query(`SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM athlete_profiles ap WHERE ap.archived_at IS NULL) AS athletes,
        (SELECT count(*)::int FROM tournament_applications) AS applications,
        (SELECT count(*)::int FROM tournaments t WHERE t.status <> 'draft' AND t.status <> 'cancelled') AS tournaments,
        (SELECT count(*)::int FROM sponsorship_requests sr WHERE sr.status = 'active') AS active_sponsorships,
        (SELECT count(*)::int FROM verification_requests WHERE status = 'pending') AS verification_queue`,
      ),
      pool.query(
        `SELECT date_trunc('week', created_at)::date AS week, count(*)::int AS total
           FROM users GROUP BY 1 ORDER BY 1 DESC LIMIT 8`,
      ),
    ]);
    res.json(ok({
      usersByRole: usersByRole.rows,
      totals: totals.rows[0],
      weeklyRegistrations: recentRegistrations.rows.reverse(),
      generatedAt: new Date(),
    }));
  }),
);

export default router;