import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { ok } from '../utils/envelope.js';
import { notFound, forbidden, AppError, ERROR_CODES } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { notifyUser } from '../services/notifications.js';

const router = Router();

const decisionSchema = z.object({
  status: z.enum(['approved', 'rejected', 'waitlisted']),
});

const SORTABLE = ['applied_at', 'decided_at', 'created_at', 'updated_at', 'status'];

const APPLICATION_FROM = `
  FROM tournament_applications ta
  JOIN tournaments t ON t.id = ta.tournament_id
  JOIN athlete_profiles ap ON ap.id = ta.athlete_id
`;

const APPLICATION_SELECT = `
  SELECT ta.id, ta.tournament_id, ta.athlete_id, ta.sport_id, ta.status, ta.notes,
         ta.applied_at, ta.decided_at, ta.created_at, ta.updated_at,
         t.title AS tournament_title, t.status AS tournament_status, t.max_participants,
         CONCAT(ap.first_name, ' ', ap.last_name) AS athlete_name
    ${APPLICATION_FROM}
`;

// ---------------------------------------------------------------------------
// GET /api/applications
//   athlete  → their own applications
//   organizer/admin → applications for their tournament(s)
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  requireRole('athlete', 'organizer', 'admin'),
  asyncHandler(async (req, res) => {
    const { page, pageSize, sort, order, offset } = parsePagination(req, SORTABLE);
    const q = req.query;

    const values = [];
    const conditions = [];
    let i = 1;
    const add = (sql, ...vs) => {
      values.push(...vs);
      conditions.push(sql.replace(/\?/g, () => `$${i++}`));
    };

    if (req.user.role === 'athlete') {
      const { rows: pr } = await pool.query('SELECT id FROM athlete_profiles WHERE user_id = $1 AND archived_at IS NULL', [req.user.id]);
      if (pr.length === 0) throw forbidden('Athlete profile required.');
      add('ta.athlete_id = ?::uuid', pr[0].id);
      if (q.status) add('ta.status = ?', q.status);
    } else if (req.user.role === 'organizer') {
      const { rows: or } = await pool.query('SELECT id FROM organizer_profiles WHERE user_id = $1 AND archived_at IS NULL', [req.user.id]);
      if (or.length === 0) throw forbidden('Organizer profile required.');
      add('t.organizer_id = ?::uuid', or[0].id);
      if (q.tournament_id) add('ta.tournament_id = ?::uuid', q.tournament_id);
      if (q.status) add('ta.status = ?', q.status);
    } else {
      if (q.tournament_id) add('ta.tournament_id = ?::uuid', q.tournament_id);
      if (q.status) add('ta.status = ?', q.status);
      if (q.athlete_id) add('ta.athlete_id = ?::uuid', q.athlete_id);
    }

    const whereSql = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const orderSql = `${sort} ${order}`;

    const { rows: countRows } = await pool.query(`SELECT count(*)::int AS total ${APPLICATION_FROM}${whereSql}`, values);
    const { rows } = await pool.query(
      `${APPLICATION_SELECT}${whereSql} ORDER BY ${orderSql} NULLS LAST, ta.id LIMIT $${i} OFFSET $${i + 1}`,
      [...values, pageSize, offset],
    );

    res.json(ok(rows, { page, pageSize, total: countRows[0].total, totalPages: Math.max(1, Math.ceil(countRows[0].total / pageSize)) }));
  }),
);

// ---------------------------------------------------------------------------
// PUT /api/applications/:id — organizer (owner of the tournament) or admin.
//   pending   -> approved (adds to tournament_participants if capacity allows)
//   pending   -> rejected
//   pending   -> waitlisted
//   waitlisted-> approved (organizer promotion; no auto-promotion in v1)
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  authenticate,
  requireRole('organizer', 'admin'),
  validateBody(decisionSchema),
  asyncHandler(async (req, res) => {
    const target = req.body.status;

    const { rows } = await pool.query(
      `SELECT ta.*, t.title AS tournament_title, t.organizer_id, t.max_participants
         FROM tournament_applications ta
         JOIN tournaments t ON t.id = ta.tournament_id
        WHERE ta.id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) throw notFound('Application not found.');
    const app = rows[0];

    if (req.user.role !== 'admin') {
      const { rows: orgRows } = await pool.query(
        'SELECT id FROM organizer_profiles WHERE user_id = $1 AND archived_at IS NULL',
        [req.user.id],
      );
      if (orgRows.length === 0 || orgRows[0].id !== app.organizer_id) {
        throw forbidden('Only the tournament organizer can review applications.');
      }
    }

    const from = app.status;
    if (from === 'withdrawn') {
      throw new AppError(ERROR_CODES.APPLICANT_NOT_PENDING, 'Cannot update a withdrawn application.', 409);
    }
    if (target === 'approved' && !['pending', 'waitlisted'].includes(from)) {
      throw new AppError(ERROR_CODES.APPLICANT_NOT_PENDING, `Cannot approve an application with status "${from}".`, 409);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (target === 'approved') {
        const { rows: takenRows } = await client.query(
          'SELECT count(*)::int AS taken FROM tournament_participants WHERE tournament_id = $1',
          [app.tournament_id],
        );
        if (takenRows[0].taken >= app.max_participants) {
          throw new AppError(
            ERROR_CODES.TOURNAMENT_FULL,
            'This tournament has reached its participant limit. Consider keeping the applicant on the waitlist instead.',
            409,
          );
        }
      }

      await client.query(
        `UPDATE tournament_applications SET status = $1, decided_at = now(), updated_at = now() WHERE id = $2`,
        [target, app.id],
      );

      if (target === 'approved') {
        await client.query(
          `INSERT INTO tournament_participants (tournament_id, athlete_id, is_seed)
           VALUES ($1, $2, false)
           ON CONFLICT (tournament_id, athlete_id) DO NOTHING`,
          [app.tournament_id, app.athlete_id],
        );
      }

      const athleteUserId = await client.query('SELECT user_id FROM athlete_profiles WHERE id = $1', [app.athlete_id]);
      const message = target === 'approved'
        ? `Your application to "${app.tournament_title}" has been approved.`
        : `Your application to "${app.tournament_title}" has been ${target}.`;
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, is_seed)
         VALUES ($1, 'application_${target}', 'Application ${target}', $2, false)`,
        [athleteUserId.rows[0].user_id, message],
      );

      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, from_state, to_state, actor_id, is_seed)
         VALUES ('tournament_application', $1, $2, $3, $4, false)`,
        [app.id, from, target, req.user.id],
      );

      await client.query('COMMIT');
      res.json(ok({ id: app.id, status: target }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

export default router;