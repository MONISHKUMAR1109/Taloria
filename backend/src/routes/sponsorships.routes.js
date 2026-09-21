import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { ok, created } from '../utils/envelope.js';
import { notFound, forbidden, badRequest, AppError, ERROR_CODES } from '../utils/errors.js';
import { audit } from '../utils/audit.js';

const router = Router();

const SORTABLE = ['requested_at', 'decided_at', 'created_at', 'updated_at', 'status'];

const createSchema = z.object({
  tournament_id: z.string().uuid(),
  package_id: z.string().uuid(),
});

const updateSchema = z.object({
  status: z.enum(['active', 'rejected', 'cancelled']).optional(),
});

// ---------------------------------------------------------------------------
// POST /api/sponsorships — sponsor submits a request for a package.
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  requireRole('sponsor'),
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const { tournament_id, package_id } = req.body;

    const { rows: spn } = await pool.query(
      'SELECT id FROM sponsor_profiles WHERE user_id = $1 AND archived_at IS NULL',
      [req.user.id],
    );
    if (spn.length === 0) throw forbidden('Sponsor profile required.');
    const sponsorId = spn[0].id;

    const pkg = await pool.query(
      `SELECT sp.id, sp.tournament_id, sp.name, t.status AS tournament_status
         FROM sponsorship_packages sp
         JOIN tournaments t ON t.id = sp.tournament_id
        WHERE sp.id = $1`,
      [package_id],
    );
    if (pkg.rowCount === 0) throw notFound('Sponsorship package not found.');
    if (pkg.rows[0].tournament_id !== tournament_id) {
      throw badRequest('VALIDATION_ERROR', 'Package does not belong to this tournament.');
    }
    if (!['published', 'registration_open', 'registration_closed', 'ongoing'].includes(pkg.rows[0].tournament_status)) {
      throw new AppError(ERROR_CODES.TOURNAMENT_NOT_OPEN, 'This tournament is not accepting sponsorships.', 409);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT id, status FROM sponsorship_requests
          WHERE sponsor_id = $1 AND tournament_id = $2 AND package_id = $3 AND status <> 'rejected'`,
        [sponsorId, tournament_id, package_id],
      );
      if (existing.rowCount > 0) {
        throw new AppError(
          ERROR_CODES.SPONSORSHIP_ALREADY_REQUESTED,
          'You have already submitted a request for this package.',
          409,
        );
      }

      const { rows: slotRows } = await client.query(
        `SELECT sp.max_slots, count(sr.id)::int AS active
           FROM sponsorship_packages sp
           LEFT JOIN sponsorship_requests sr ON sr.package_id = sp.id AND sr.status = 'active'
          WHERE sp.id = $1
          GROUP BY sp.max_slots`,
        [package_id],
      );
      if (slotRows[0].active >= slotRows[0].max_slots) {
        const err = new AppError(
          ERROR_CODES.SPONSORSHIP_SLOT_FULL,
          'All slots for this package are taken.',
          409,
        );
        await client.query('ROLLBACK');
        throw err;
      }

      const { rows } = await client.query(
        `INSERT INTO sponsorship_requests (sponsor_id, tournament_id, package_id, status, is_seed)
         VALUES ($1, $2, $3, 'pending', false)
         RETURNING id, tournament_id, package_id, status, requested_at`,
        [sponsorId, tournament_id, package_id],
      );

      const org = await client.query(
        `SELECT o.user_id FROM tournaments t JOIN organizer_profiles o ON o.id = t.organizer_id WHERE t.id = $1`,
        [tournament_id],
      );
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, is_seed)
         VALUES ($1, 'sponsorship_request', 'New sponsorship request',
                 'A sponsor wants the "${pkg.rows[0].name}" package.', false)`,
        [org.rows[0].user_id],
      );

      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, from_state, to_state, actor_id, is_seed)
         VALUES ('sponsorship_request', $1, NULL, 'pending', $2, false)`,
        [rows[0].id, req.user.id],
      );

      await client.query('COMMIT');
      res.status(201).json(created(rows[0]));
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505' && err.detail?.includes('sponsorship_requests')) {
        throw new AppError(ERROR_CODES.SPONSORSHIP_ALREADY_REQUESTED, 'You have already submitted a request for this package.', 409);
      }
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ---------------------------------------------------------------------------
// GET /api/sponsorships — sponsor (own), organizer (for own tournaments), admin.
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  requireRole('sponsor', 'organizer', 'admin'),
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

    const base = `
      FROM sponsorship_requests sr
      JOIN tournaments t ON t.id = sr.tournament_id
      JOIN sponsorship_packages spk ON spk.id = sr.package_id
      JOIN sponsor_profiles spn ON spn.id = sr.sponsor_id
    `;

    if (req.user.role === 'sponsor') {
      const { rows: pr } = await pool.query('SELECT id FROM sponsor_profiles WHERE user_id = $1 AND archived_at IS NULL', [req.user.id]);
      if (pr.length === 0) throw forbidden('Sponsor profile required.');
      add('sr.sponsor_id = ?::uuid', pr[0].id);
    } else if (req.user.role === 'organizer') {
      const { rows: or } = await pool.query('SELECT id FROM organizer_profiles WHERE user_id = $1 AND archived_at IS NULL', [req.user.id]);
      if (or.length === 0) throw forbidden('Organizer profile required.');
      add('t.organizer_id = ?::uuid', or[0].id);
    }
    if (q.status) add('sr.status = ?', q.status);
    if (q.tournament_id) add('sr.tournament_id = ?::uuid', q.tournament_id);

    const whereSql = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const orderSql = `${sort} ${order}`;

    const { rows: countRows } = await pool.query(
      `SELECT count(*)::int AS total ${base}${whereSql}`, values,
    );
    const { rows } = await pool.query(
      `SELECT sr.id, sr.tournament_id, t.title AS tournament_title, sr.package_id,
              spk.name AS package_name, spk.price, spk.currency, sr.status, sr.requested_at, sr.decided_at,
              spn.company_name
       ${base}${whereSql}
       ORDER BY ${orderSql} NULLS LAST, sr.id
       LIMIT $${i} OFFSET $${i + 1}`,
      [...values, pageSize, offset],
    );

    res.json(ok(rows, { page, pageSize, total: countRows[0].total, totalPages: Math.max(1, Math.ceil(countRows[0].total / pageSize)) }));
  }),
);

// ---------------------------------------------------------------------------
// PUT /api/sponsorships/:id
//   organizer owner: pending -> active (approval) | rejected
//   sponsor: pending -> cancelled
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  authenticate,
  requireRole('sponsor', 'organizer', 'admin'),
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT sr.*, t.title AS tournament_title, t.organizer_id
         FROM sponsorship_requests sr
         JOIN tournaments t ON t.id = sr.tournament_id
        WHERE sr.id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) throw notFound('Sponsorship request not found.');
    const request = rows[0];
    const isAdmin = req.user.role === 'admin';

    if (request.status !== 'pending') {
      throw new AppError(ERROR_CODES.SPONSORSHIP_NOT_PENDING, `Request is already "${request.status}".`, 409);
    }

    if (req.user.role === 'sponsor') {
      const { rows: pr } = await pool.query('SELECT id FROM sponsor_profiles WHERE user_id = $1 AND archived_at IS NULL', [req.user.id]);
      if (pr.length === 0 || pr[0].id !== request.sponsor_id) {
        throw forbidden('Not your sponsorship request.');
      }
      // Sponsor cancels: translate 'rejected' intent to cancellation.
      await pool.query(
        `UPDATE sponsorship_requests SET status = 'cancelled', decided_at = now(), updated_at = now() WHERE id = $1`,
        [request.id],
      );
      await audit({ entityType: 'sponsorship_request', entityId: request.id, actorId: req.user.id, fromState: 'pending', toState: 'cancelled' });
      return res.json(ok({ id: request.id, status: 'cancelled' }));
    }

    // organizer or admin
    if (req.user.role !== 'sponsor' && !req.body.status) {
      throw badRequest('VALIDATION_ERROR', '"status" must be "active" or "rejected".');
    }
    if (!isAdmin) {
      const { rows: or } = await pool.query('SELECT id FROM organizer_profiles WHERE user_id = $1 AND archived_at IS NULL', [req.user.id]);
      if (or.length === 0 || or[0].id !== request.organizer_id) {
        throw forbidden('Only the tournament organizer can review this request.');
      }
    }

    const target = req.body.status === 'active' ? 'active' : 'rejected';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (target === 'active') {
        const { rows: slotRows } = await client.query(
          `SELECT sp.max_slots, count(sr.id)::int AS active
             FROM sponsorship_packages sp
             LEFT JOIN sponsorship_requests sr ON sr.package_id = sp.id AND sr.status = 'active'
            WHERE sp.id = $1
            GROUP BY sp.max_slots`,
          [request.package_id],
        );
        if (slotRows[0].active >= slotRows[0].max_slots) {
          throw new AppError(ERROR_CODES.SPONSORSHIP_SLOT_FULL, 'All slots for this package are taken.', 409);
        }
      }

      await client.query(
        `UPDATE sponsorship_requests SET status = $1, decided_at = now(), updated_at = now() WHERE id = $2`,
        [target, request.id],
      );

      const sponsorUserId = await client.query('SELECT user_id FROM sponsor_profiles WHERE id = $1', [request.sponsor_id]);
      const message = target === 'active'
        ? `Your sponsorship of "${request.tournament_title}" is now active.`
        : `Your sponsorship request for "${request.tournament_title}" was declined.`;
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, is_seed)
         VALUES ($1, 'sponsorship_${target}', 'Sponsorship ${target}', $2, false)`,
        [sponsorUserId.rows[0].user_id, message],
      );

      await client.query(
        `INSERT INTO audit_logs (entity_type, entity_id, from_state, to_state, actor_id, is_seed)
         VALUES ('sponsorship_request', $1, 'pending', $2, $3, false)`,
        [request.id, target, req.user.id],
      );

      await client.query('COMMIT');
      res.json(ok({ id: request.id, status: target }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

export default router;