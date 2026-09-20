import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { ok, created } from '../utils/envelope.js';
import { badRequest, notFound, forbidden, AppError, ERROR_CODES } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { notifyUser } from '../services/notifications.js';
import { loadStatTemplate, assertStatsMatchTemplate } from '../services/statistics.js';

const router = Router();

const TOURNAMENT_STATUSES = ['draft', 'published', 'registration_open', 'registration_closed', 'ongoing', 'completed', 'cancelled'];

const SORTABLE = ['created_at', 'updated_at', 'title', 'start_date', 'registration_deadline', 'status'];

// Allowed transitions for the deterministic tournament state machine.
// cancelled can be entered from any state; completed accepts results.
const ALLOWED_TRANSITIONS = {
  draft: ['published', 'cancelled'],
  published: ['draft', 'registration_open', 'cancelled'],
  registration_open: ['registration_closed', 'published', 'cancelled'],
  registration_closed: ['registration_open', 'ongoing', 'cancelled'],
  ongoing: ['completed', 'registration_closed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  category_id: z.string().uuid().optional(),
  eligibility_requirements: z.string().trim().max(3000).optional(),
  location_country: z.string().trim().max(100).optional(),
  location_city: z.string().trim().max(100).optional(),
  registration_deadline: z.string().datetime({ offset: true }),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  max_participants: z.number().int().min(1).max(100000),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(TOURNAMENT_STATUSES).optional(),
});

const packageSchema = z.object({
  name: z.string().trim().min(1).max(200),
  price: z.number().min(0),
  currency: z.string().length(3).toUpperCase().default('USD'),
  benefits_description: z.string().trim().max(2000).optional(),
  max_slots: z.number().int().min(1).max(1000).default(1),
});

const applySchema = z.object({
  sport_id: z.string().uuid().optional(),
  notes: z.string().trim().max(1000).optional(),
});

const resultsSchema = z.array(
  z.object({
    athlete_id: z.string().uuid(),
    placement: z.number().int().min(1),
    prize_description: z.string().trim().max(500).optional(),
    sport_id: z.string().uuid().optional(),
    stat_values: z.record(z.unknown()).optional(),
  }),
).min(1);

function assertTransition(from, to) {
  if (from === to) return;
  if (!(ALLOWED_TRANSITIONS[from] || []).includes(to)) {
    throw new AppError(
      ERROR_CODES.TOURNAMENT_ILLEGAL_TRANSITION,
      `Cannot move a tournament from "${from}" to "${to}".`,
      409,
      { from, to, allowed: ALLOWED_TRANSITIONS[from] || [] },
    );
  }
}

async function loadTournament(id) {
  const { rows } = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
  if (rows.length === 0) throw notFound('Tournament not found.');
  return rows[0];
}

async function organizerProfile(userId) {
  const { rows } = await pool.query('SELECT id, user_id FROM organizer_profiles WHERE user_id = $1 AND archived_at IS NULL', [userId]);
  if (rows.length === 0) throw forbidden('Organizer profile required.');
  return rows[0];
}

async function athleteProfile(userId) {
  const { rows } = await pool.query('SELECT id, user_id, verification_status FROM athlete_profiles WHERE user_id = $1 AND archived_at IS NULL', [userId]);
  if (rows.length === 0) throw forbidden('Athlete profile required.');
  return rows[0];
}

async function assertOrganizerOwns(userId, tournament) {
  const org = await organizerProfile(userId);
  if (org.id !== tournament.organizer_id) {
    throw forbidden('Only the tournament organizer can do this.');
  }
}

// ---------------------------------------------------------------------------
// GET /api/tournaments — public browse.
// ---------------------------------------------------------------------------
router.get(
  '/',
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

    const visibleStatuses = q.scope === 'all'
      ? ['published', 'registration_open', 'registration_closed', 'ongoing', 'completed']
      : ['published', 'registration_open'];

    add(`t.status IN (${visibleStatuses.map(() => '?').join(', ')})`, ...visibleStatuses);

    if (q.q) add('t.title ILIKE ?', `%${q.q}%`);
    if (q.category_id) add('t.category_id = ?::uuid', q.category_id);
    if (q.sport_slug) add('EXISTS (SELECT 1 FROM tournament_applications ta JOIN athlete_sports a2 ON a2.athlete_id = ta.athlete_id JOIN sports s ON s.id = a2.sport_id WHERE ta.tournament_id = t.id AND s.slug = ?)', q.sport_slug);
    if (q.country) add('t.location_country ILIKE ?', `%${q.country}%`);
    if (q.city) add('t.location_city ILIKE ?', `%${q.city}%`);
    if (q.deadline_after) add('t.registration_deadline >= ?::timestamptz', q.deadline_after);
    if (q.status) add('t.status = ?', q.status);
    if (q.min_participants !== undefined) add('(SELECT count(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id) >= ?', Number(q.min_participants));

    const fromClause = 'FROM tournaments t';
    const whereSql = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const orderSql = `${sort} ${order}`;

    const { rows: countRows } = await pool.query(`SELECT count(*)::int AS total ${fromClause}${whereSql}`, values);
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.description, t.category_id, c.name AS category_name,
              t.location_country, t.location_city, t.registration_deadline, t.start_date, t.end_date,
              t.max_participants, t.status, t.published_at, t.created_at, t.updated_at,
              (SELECT count(*)::int FROM tournament_participants tp WHERE tp.tournament_id = t.id) AS participant_count,
              (SELECT count(*)::int FROM sponsorship_requests sr WHERE sr.tournament_id = t.id AND sr.status = 'active') AS sponsor_count
       ${fromClause}
       LEFT JOIN tournament_categories c ON c.id = t.category_id${whereSql}
       ORDER BY ${orderSql} NULLS LAST, t.id
       LIMIT $${i} OFFSET $${i + 1}`,
      [...values, pageSize, offset],
    );

    res.json(ok(rows, { page, pageSize, total: countRows[0].total, totalPages: Math.max(1, Math.ceil(countRows[0].total / pageSize)) }));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/tournaments — organizer only.
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  requireRole('organizer', 'admin'),
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const org = await organizerProfile(req.user.id);
    const b = req.body;

    const { rows } = await pool.query(
      `INSERT INTO tournaments (
         organizer_id, category_id, title, description, eligibility_requirements,
         location_country, location_city, registration_deadline, start_date, end_date,
         max_participants, status, is_seed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', false)
       RETURNING id, title, status, registration_deadline, start_date, max_participants`,
      [org.id, b.category_id ?? null, b.title, b.description ?? null, b.eligibility_requirements ?? null,
        b.location_country ?? null, b.location_city ?? null, b.registration_deadline, b.start_date,
        b.end_date ?? null, b.max_participants],
    );

    await audit({ entityType: 'tournament', entityId: rows[0].id, actorId: req.user.id, toState: 'draft' });
    res.status(201).json(created(rows[0]));
  }),
);

// ---------------------------------------------------------------------------
// GET /api/tournaments/:id — public detail (incl. packages and active sponsors).
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT t.*, c.name AS category_name,
              (SELECT count(*)::int FROM tournament_participants tp WHERE tp.tournament_id = t.id) AS participant_count
         FROM tournaments t
         LEFT JOIN tournament_categories c ON c.id = t.category_id
        WHERE t.id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) throw notFound('Tournament not found.');
    const tournament = rows[0];

    const [packages, participants, activeSponsors] = await Promise.all([
      pool.query(
        `SELECT id, name, price, currency, benefits_description, max_slots,
                (SELECT count(*)::int FROM sponsorship_requests sr WHERE sr.package_id = sp.id AND sr.status = 'active') AS active_slots
           FROM sponsorship_packages sp WHERE sp.tournament_id = $1 ORDER BY sp.price DESC`,
        [req.params.id],
      ),
      pool.query(
        `SELECT ap.id, ap.first_name, ap.last_name, ap.country, ap.city, ap.verification_status,
                (SELECT count(*)::int FROM athlete_sports a2 WHERE a2.athlete_id = ap.id) AS sport_count
           FROM tournament_participants tp
           JOIN athlete_profiles ap ON ap.id = tp.athlete_id
          WHERE tp.tournament_id = $1 AND ap.archived_at IS NULL
          ORDER BY tp.joined_at`,
        [req.params.id],
      ),
      pool.query(
        `SELECT sr.id, spn.company_name, spn.country, spk.name AS package_name, spk.max_slots
           FROM sponsorship_requests sr
           JOIN sponsor_profiles spn ON spn.id = sr.sponsor_id
           JOIN sponsorship_packages spk ON spk.id = sr.package_id
          WHERE sr.tournament_id = $1 AND sr.status = 'active'
          ORDER BY sr.decided_at`,
        [req.params.id],
      ),
    ]);

    res.json(ok({ ...tournament, packages: packages.rows, participants: participants.rows, activeSponsors: activeSponsors.rows }));
  }),
);

// ---------------------------------------------------------------------------
// PUT /api/tournaments/:id — organizer owner/admin; enforces the state machine.
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  authenticate,
  requireRole('organizer', 'admin'),
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const tournament = await loadTournament(req.params.id);
    const b = req.body;
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin) await assertOrganizerOwns(req.user.id, tournament);

    if (b.status && b.status !== tournament.status) {
      assertTransition(tournament.status, b.status);
    }

    const nextStatus = b.status ?? tournament.status;
    const { rows } = await pool.query(
      `UPDATE tournaments SET
         title = COALESCE($1::text, title),
         description = COALESCE($2::text, description),
         category_id = COALESCE($3::uuid, category_id),
         eligibility_requirements = COALESCE($4::text, eligibility_requirements),
         location_country = COALESCE($5::text, location_country),
         location_city = COALESCE($6::text, location_city),
         registration_deadline = COALESCE($7::timestamptz, registration_deadline),
         start_date = COALESCE($8::date, start_date),
         end_date = COALESCE($9::date, end_date),
         max_participants = COALESCE($10::int, max_participants),
         status = $11,
         published_at = CASE WHEN $11 = 'published' AND published_at IS NULL THEN now() ELSE published_at END,
         updated_at = now()
       WHERE id = $12
       RETURNING id, title, status, registration_deadline, start_date, max_participants, published_at`,
      [b.title ?? null, b.description ?? null, b.category_id ?? null, b.eligibility_requirements ?? null,
        b.location_country ?? null, b.location_city ?? null, b.registration_deadline ?? null,
        b.start_date ?? null, b.end_date ?? null, b.max_participants ?? null, nextStatus, req.params.id],
    );

    if (b.status && b.status !== tournament.status) {
      await audit({ entityType: 'tournament', entityId: req.params.id, actorId: req.user.id, fromState: tournament.status, toState: nextStatus });
    }

    res.json(ok(rows[0]));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/tournaments/:id/packages — organizer defines sponsorship packages.
// ---------------------------------------------------------------------------
router.post(
  '/:id/packages',
  authenticate,
  requireRole('organizer', 'admin'),
  validateBody(packageSchema),
  asyncHandler(async (req, res) => {
    const tournament = await loadTournament(req.params.id);
    if (req.user.role !== 'admin') await assertOrganizerOwns(req.user.id, tournament);

    const { rows } = await pool.query(
      `INSERT INTO sponsorship_packages (tournament_id, name, price, currency, benefits_description, max_slots, is_seed)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       RETURNING id, name, price, currency, benefits_description, max_slots`,
      [req.params.id, req.body.name, req.body.price, req.body.currency, req.body.benefits_description ?? null, req.body.max_slots],
    );
    res.status(201).json(created(rows[0]));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/tournaments/:id/apply — athlete. Full tournaments waitlist.
// Server-side deadline enforcement independent of client-side disabled buttons.
// ---------------------------------------------------------------------------
router.post(
  '/:id/apply',
  authenticate,
  requireRole('athlete'),
  validateBody(applySchema),
  asyncHandler(async (req, res) => {
    const tournament = await loadTournament(req.params.id);
    if (tournament.status !== 'registration_open') {
      throw new AppError(ERROR_CODES.TOURNAMENT_NOT_OPEN, `Tournament is not accepting applications (status: "${tournament.status}").`, 409);
    }
    if (new Date(tournament.registration_deadline).getTime() < Date.now()) {
      throw new AppError(ERROR_CODES.TOURNAMENT_DEADLINE_PASSED, 'The application deadline for this tournament has passed.', 409);
    }

    const athlete = await athleteProfile(req.user.id);
    const sportId = req.body.sport_id ?? null;
    if (sportId) {
      const sport = await pool.query('SELECT id FROM sports WHERE id = $1', [sportId]);
      if (sport.rowCount === 0) throw badRequest('VALIDATION_ERROR', 'Unknown sport.');
      const linked = await pool.query(
        'SELECT 1 FROM athlete_sports WHERE athlete_id = $1 AND sport_id = $2', [athlete.id, sportId],
      );
      if (linked.rowCount === 0) throw badRequest('VALIDATION_ERROR', 'You can only apply with a sport you have added to your profile.');
    }

    const duplicate = await pool.query(
      `SELECT id, status FROM tournament_applications WHERE tournament_id = $1 AND athlete_id = $2`,
      [tournament.id, athlete.id],
    );
    if (duplicate.rowCount > 0) {
      throw new AppError(ERROR_CODES.ALREADY_APPLIED, 'You have already applied to this tournament.', 409);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: takenRows } = await client.query(
        `SELECT
           (SELECT count(*)::int FROM tournament_participants WHERE tournament_id = $1) AS participants,
           (SELECT count(*)::int FROM tournament_applications
             WHERE tournament_id = $1 AND status IN ('pending', 'waitlisted')) AS in_line`,
        [tournament.id],
      );
      const full = takenRows[0].participants + takenRows[0].in_line >= tournament.max_participants;
      const status = full ? 'waitlisted' : 'pending';

      const { rows } = await client.query(
        `INSERT INTO tournament_applications (tournament_id, athlete_id, sport_id, status, notes, is_seed)
         VALUES ($1, $2, $3, $4, $5, false)
         RETURNING id, tournament_id, athlete_id, status, notes, applied_at`,
        [tournament.id, athlete.id, sportId, status, req.body.notes ?? null],
      );

      await audit({
        entityType: 'tournament_application', entityId: rows[0].id, actorId: req.user.id, toState: status,
        details: { tournamentId: tournament.id },
      });

      const orgUserId = await client.query('SELECT user_id FROM organizer_profiles WHERE id = $1', [tournament.organizer_id]);
      const app = rows[0];
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, is_seed)
         VALUES ($1, 'application_submitted',
                 'New application', $2, false)`,
        [orgUserId.rows[0].user_id,
          `An athlete applied to "${tournament.title}" (${status}).`],
      );

      await client.query('COMMIT');

      res.status(201).json(created({
        ...app,
        status,
        waitlisted: status === 'waitlisted',
      }));
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505' && err.detail?.includes('tournament_applications')) {
        throw new AppError(ERROR_CODES.ALREADY_APPLIED, 'You have already applied to this tournament.', 409);
      }
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ---------------------------------------------------------------------------
// POST /api/tournaments/:id/withdraw — athlete.
// ---------------------------------------------------------------------------
router.post(
  '/:id/withdraw',
  authenticate,
  requireRole('athlete'),
  asyncHandler(async (req, res) => {
    const athlete = await athleteProfile(req.user.id);
    const { rows } = await pool.query(
      `SELECT id, status FROM tournament_applications
        WHERE tournament_id = $1 AND athlete_id = $2 AND status <> 'withdrawn'`,
      [req.params.id, athlete.id],
    );
    if (rows.length === 0) throw notFound('No active application for this tournament.');

    const app = rows[0];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const wasParticipant = app.status === 'approved';

      await client.query(
        `UPDATE tournament_applications SET status = 'withdrawn', decided_at = now() WHERE id = $1`,
        [app.id],
      );
      if (wasParticipant) {
        await client.query(
          'DELETE FROM tournament_participants WHERE tournament_id = $1 AND athlete_id = $2',
          [req.params.id, athlete.id],
        );
        const tourn = await pool.query('SELECT title, organizer_id FROM tournaments WHERE id = $1', [req.params.id]);
        const org = await client.query('SELECT user_id FROM organizer_profiles WHERE id = $1', [tourn.rows[0].organizer_id]);
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, is_seed)
           VALUES ($1, 'participant_withdrawn', 'Participant withdrew', $2, false)`,
          [org.rows[0].user_id,
            `A confirmed participant withdrew from "${tourn.rows[0].title}". A waitlisted athlete is available to promote.`],
        );
      }
      await audit({ entityType: 'tournament_application', entityId: app.id, actorId: req.user.id, fromState: app.status, toState: 'withdrawn' });
      await client.query('COMMIT');
      res.json(ok({ id: app.id, status: 'withdrawn' }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ---------------------------------------------------------------------------
// POST /api/tournaments/:id/results — organizer enters results.
// Optionally updates athlete_statistics for the tournament (§6).
// ---------------------------------------------------------------------------
router.post(
  '/:id/results',
  authenticate,
  requireRole('organizer', 'admin'),
  validateBody(resultsSchema),
  asyncHandler(async (req, res) => {
    const tournament = await loadTournament(req.params.id);
    if (req.user.role !== 'admin') await assertOrganizerOwns(req.user.id, tournament);
    if (!['ongoing', 'completed'].includes(tournament.status)) {
      throw new AppError(ERROR_CODES.TOURNAMENT_NOT_OPEN, 'Results can only be entered while the tournament is ongoing or completed.', 409);
    }

    // Validate every stat payload against its sport template first.
    for (const entry of req.body) {
      if (entry.sport_id && entry.stat_values) {
        const template = await loadStatTemplate(entry.sport_id);
        assertStatsMatchTemplate(entry.stat_values, template);
      } else if (entry.sport_id || entry.stat_values) {
        throw badRequest('STAT_TEMPLATE_MISMATCH', 'sport_id and stat_values must be provided together.');
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const entry of req.body) {
        const participant = await client.query(
          `SELECT 1 FROM tournament_participants WHERE tournament_id = $1 AND athlete_id = $2`,
          [tournament.id, entry.athlete_id],
        );
        if (participant.rowCount === 0) {
          throw badRequest('VALIDATION_ERROR', `Athlete ${entry.athlete_id} is not a participant of this tournament.`);
        }
        await client.query(
          `INSERT INTO tournament_results (tournament_id, athlete_id, placement, prize_description, details, is_seed)
           VALUES ($1, $2, $3, $4, $5, false)
           ON CONFLICT (tournament_id, athlete_id)
           DO UPDATE SET placement = EXCLUDED.placement, prize_description = EXCLUDED.prize_description, details = EXCLUDED.details, updated_at = now()`,
          [tournament.id, entry.athlete_id, entry.placement, entry.prize_description ?? null,
            entry.stat_values ? JSON.stringify(entry.stat_values) : null],
        );
        if (entry.sport_id && entry.stat_values) {
          await client.query(
            `INSERT INTO athlete_statistics (athlete_id, sport_id, stat_values, recorded_on, is_seed)
             VALUES ($1, $2, $3, $4::date, false)
             ON CONFLICT DO NOTHING`,
            [entry.athlete_id, entry.sport_id, JSON.stringify(entry.stat_values), tournament.end_date || tournament.start_date],
          );
        }
      }

      if (tournament.status === 'ongoing') {
        await client.query(`UPDATE tournaments SET status = 'completed', updated_at = now() WHERE id = $1`, [tournament.id]);
        await client.query(
          `INSERT INTO audit_logs (entity_type, entity_id, from_state, to_state, actor_id, is_seed)
           VALUES ('tournament', $1, 'ongoing', 'completed', $2, false)`,
          [tournament.id, req.user.id],
        );
      }

      await client.query('COMMIT');
      res.json(ok({ results: req.body.length, tournamentStatus: tournament.status === 'ongoing' ? 'completed' : tournament.status }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

export default router;