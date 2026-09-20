import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import pool from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole, requireOwnerOrAdmin } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { ok, created } from '../utils/envelope.js';
import { badRequest, notFound } from '../utils/errors.js';
import { COMPLETENESS_SQL, DISCOVERABLE_SQL } from '../services/completeness.js';
import { loadStatTemplate, assertStatsMatchTemplate } from '../services/statistics.js';
import { storeUpload, SIZE_LIMITS } from '../services/storage.js';
import { audit } from '../utils/audit.js';

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: SIZE_LIMITS.video } });

const SORTABLE = ['created_at', 'updated_at', 'first_name', 'last_name', 'verification_status', 'city', 'country', 'date_of_birth'];

const updateSchema = z.object({
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().min(1).max(100).optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_of_birth must be YYYY-MM-DD').optional(),
  country: z.string().trim().min(1).max(100).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  bio: z.string().trim().max(2000).optional(),
});

const addSportSchema = z.object({
  sport_id: z.string().uuid(),
  position: z.string().trim().max(100).optional(),
  years_experience: z.number().min(0).max(60).optional(),
});

const statisticsSchema = z.object({
  sport_id: z.string().uuid(),
  recorded_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  stat_values: z.record(z.unknown()),
});

const achievementSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  achieved_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const videoSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

const PROFILE_SELECT = `
  SELECT
    ap.id,
    ap.user_id,
    ap.first_name,
    ap.last_name,
    ap.date_of_birth,
    ap.country,
    ap.city,
    ap.bio,
    ap.profile_picture_key,
    ap.verification_status,
    ap.created_at,
    ap.updated_at,
    (SELECT count(*)::int FROM athlete_sports as2 WHERE as2.athlete_id = ap.id) AS sport_count,
    (SELECT count(*)::int FROM athlete_achievements aa WHERE aa.athlete_id = ap.id) AS achievements_count,
    ${COMPLETENESS_SQL} AS completeness,
    ${DISCOVERABLE_SQL} AS discoverable
  FROM athlete_profiles ap
`;

async function loadAthleteRow(id) {
  const { rows } = await pool.query('SELECT * FROM athlete_profiles WHERE id = $1', [id]);
  if (rows.length === 0) throw notFound('Athlete profile not found.');
  return rows[0];
}

async function formatAthleteDetail(id, requester) {
  const { rows } = await pool.query(`
    ${PROFILE_SELECT}
    WHERE ap.id = $1 AND ap.archived_at IS NULL
  `, [id]);
  if (rows.length === 0) throw notFound('Athlete profile not found.');

  const detail = rows[0];

  const [sports, stats, achievements, videos, results, applications] = await Promise.all([
    pool.query(
      `SELECT s.id, s.name, s.slug, a2.position, a2.years_experience
         FROM athlete_sports a2 JOIN sports s ON s.id = a2.sport_id
        WHERE a2.athlete_id = $1 ORDER BY s.name`,
      [id],
    ),
    pool.query(
      `SELECT st.id, s.name AS sport_name, st.stat_values, st.recorded_on
         FROM athlete_statistics st JOIN sports s ON s.id = st.sport_id
        WHERE st.athlete_id = $1 ORDER BY st.recorded_on DESC, st.created_at DESC`,
      [id],
    ),
    pool.query(
      `SELECT id, title, description, achieved_at, document_key
         FROM athlete_achievements WHERE athlete_id = $1 ORDER BY achieved_at DESC`,
      [id],
    ),
    pool.query(
      `SELECT id, title, object_key, mime_type, size_bytes, created_at
         FROM performance_videos WHERE athlete_id = $1 ORDER BY created_at DESC`,
      [id],
    ),
    pool.query(
      `SELECT tr.id, tr.tournament_id, t.title AS tournament_title, tr.placement, tr.prize_description, tr.details
         FROM tournament_results tr JOIN tournaments t ON t.id = tr.tournament_id
        WHERE tr.athlete_id = $1 ORDER BY tr.placement`,
      [id],
    ),
    pool.query(
      `SELECT ta.id, ta.tournament_id, t.title AS tournament_title, ta.status, ta.applied_at
         FROM tournament_applications ta JOIN tournaments t ON t.id = ta.tournament_id
        WHERE ta.athlete_id = $1 ORDER BY ta.applied_at DESC`,
      [id],
    ),
  ]);

  const canViewApplications = detail.user_id === requester.userId || requester.role === 'admin';

  return {
    ...detail,
    sports: sports.rows,
    statistics: stats.rows,
    achievements: achievements.rows,
    videos: videos.rows,
    results: results.rows,
    applications: canViewApplications ? applications.rows : applications.rows.map((r) => ({ ...r, status: undefined })),
  };
}

// ---------------------------------------------------------------------------
// GET /api/athletes — scout/admin search (deterministic filters only).
// A profile appears once it has ≥1 sport AND completeness ≥ 50% (§6).
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  requireRole('scout', 'admin'),
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

    const sportId = q.sport;
    const position = q.position;
    const minExp = q.minExperience !== undefined ? Number(q.minExperience) : undefined;
    const maxExp = q.maxExperience !== undefined ? Number(q.maxExperience) : undefined;
    const statKey = q.statKey;
    const statMin = q.statMin !== undefined ? Number(q.statMin) : undefined;
    const statMax = q.statMax !== undefined ? Number(q.statMax) : undefined;

    const ageCategory = q.ageCategory ? await pool.query(
      `SELECT name, min_age, max_age FROM age_categories WHERE name = $1`,
      [q.ageCategory],
    ).then((r) => r.rows[0]) : undefined;
    if (q.ageCategory && !ageCategory) {
      throw badRequest('VALIDATION_ERROR', `Unknown age category "${q.ageCategory}".`);
    }

    // Outer filters reference the wrapped subquery as `p` (see queries below).
    conditions.push('p.discoverable = true');
    conditions.push('p.archived_at IS NULL');

    if (q.q) add('(p.first_name ILIKE ? OR p.last_name ILIKE ?)', `%${q.q}%`, `%${q.q}%`);
    if (sportId) add('EXISTS (SELECT 1 FROM athlete_sports as2 WHERE as2.athlete_id = p.id AND as2.sport_id = ?::uuid)', sportId);
    if (position) add('EXISTS (SELECT 1 FROM athlete_sports as2 WHERE as2.athlete_id = p.id AND as2.position ILIKE ?)', `%${position}%`);
    if (ageCategory) {
      if (ageCategory.max_age !== null) {
        add(
          `EXTRACT(YEAR FROM age(CURRENT_DATE, p.date_of_birth)) BETWEEN ? AND ?`,
          ageCategory.min_age,
          ageCategory.max_age,
        );
      } else {
        add('EXTRACT(YEAR FROM age(CURRENT_DATE, p.date_of_birth)) >= ?', ageCategory.min_age);
      }
    }
    if (q.country) add('p.country ILIKE ?', `%${q.country}%`);
    if (q.city) add('p.city ILIKE ?', `%${q.city}%`);

    if (minExp !== undefined || maxExp !== undefined) {
      if (!sportId) throw badRequest('VALIDATION_ERROR', 'Experience filters require a sport.');
      const parts = ['SELECT 1 FROM athlete_sports as2 WHERE as2.athlete_id = p.id AND as2.sport_id = ?::uuid'];
      const vs = [sportId];
      if (minExp !== undefined) { parts.push('as2.years_experience >= ?'); vs.push(minExp); }
      if (maxExp !== undefined) { parts.push('as2.years_experience <= ?'); vs.push(maxExp); }
      add(`EXISTS (${parts.join(' AND ')})`, ...vs);
    }

    if (statKey !== undefined) {
      if (!sportId) throw badRequest('VALIDATION_ERROR', 'Statistics filters require a sport.');
      const parts = [
        'SELECT 1 FROM athlete_statistics st',
        'WHERE st.athlete_id = p.id AND st.sport_id = ?::uuid',
        `AND (st.stat_values->>?) ~ '^[0-9]+(\\.[0-9]+)?$'`,
      ];
      const vs = [sportId, statKey];
      if (statMin !== undefined) { parts.push('(st.stat_values->>?)::numeric >= ?'); vs.push(statKey, statMin); }
      if (statMax !== undefined) { parts.push('(st.stat_values->>?)::numeric <= ?'); vs.push(statKey, statMax); }
      add(`EXISTS (${parts.join(' ')})`, ...vs);
    }
    if (q.minAchievements !== undefined) {
      const min = Number(q.minAchievements);
      if (!Number.isFinite(min) || min < 0) throw badRequest('VALIDATION_ERROR', 'minAchievements must be a non-negative number.');
      add('(SELECT count(*) FROM athlete_achievements aa WHERE aa.athlete_id = p.id) >= ?', min);
    } else if (q.hasAchievements === 'true') {
      add('EXISTS (SELECT 1 FROM athlete_achievements aa WHERE aa.athlete_id = p.id)');
    }
    if (q.verified === 'true') add('p.verification_status = \'verified\'');

    const whereSql = conditions.join(' AND ');
    const orderColumn = sort in { created_at: 1, updated_at: 1, first_name: 1, last_name: 1, verification_status: 1, city: 1, country: 1, date_of_birth: 1 } ? sort : 'created_at';
    const orderSql = `${orderColumn} ${order}`;

    const { rows: countRows } = await pool.query(
      `SELECT count(*)::int AS total FROM (${PROFILE_SELECT}) p WHERE ${whereSql}`,
      values,
    );

    const { rows } = await pool.query(
      `SELECT * FROM (${PROFILE_SELECT}) p
        WHERE ${whereSql}
        ORDER BY ${orderSql} NULLS LAST, p.id
        LIMIT $${i} OFFSET $${i + 1}`,
      [...values, pageSize, offset],
    );

    res.json(ok(rows, {
      page,
      pageSize,
      total: countRows[0].total,
      totalPages: Math.max(1, Math.ceil(countRows[0].total / pageSize)),
      filters: {
        ageCategory: ageCategory ? ageCategory.name : null,
        availableAgeCategories: (await pool.query('SELECT name FROM age_categories ORDER BY sort_order, min_age')).rows.map((r) => r.name),
      },
    }));
  }),
);

// ---------------------------------------------------------------------------
// GET /api/athletes/:id — authenticated detail view (§10 fields).
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const detail = await formatAthleteDetail(req.params.id, { userId: req.user.id, role: req.user.role });
    res.json(ok(detail));
  }),
);

// ---------------------------------------------------------------------------
// PUT /api/athletes/:id — owner or admin.
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  authenticate,
  requireOwnerOrAdmin(async (req) => ownerOfAthleteId(req.params.id)),
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const row = await loadAthleteRow(req.params.id);
    const input = req.body;

    const { rows } = await pool.query(
      `UPDATE athlete_profiles SET
         first_name = COALESCE($1::text, first_name),
         last_name = COALESCE($2::text, last_name),
         date_of_birth = COALESCE($3::date, date_of_birth),
         country = COALESCE($4::text, country),
         city = COALESCE($5::text, city),
         bio = COALESCE($6::text, bio),
         updated_at = now()
       WHERE id = $7
       RETURNING id, first_name, last_name, date_of_birth, country, city, bio, verification_status, updated_at`,
      [input.first_name ?? null, input.last_name ?? null, input.date_of_birth ?? null,
        input.country ?? null, input.city ?? null, input.bio ?? null, req.params.id],
    );

    await audit({ entityType: 'athlete_profile', entityId: req.params.id, actorId: req.user.id, details: { action: 'update' } });
    res.json(ok(rows[0]));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/athletes/:id/picture — profile image upload (owner/admin).
// ---------------------------------------------------------------------------
router.post(
  '/:id/picture',
  authenticate,
  requireOwnerOrAdmin(async (req) => ownerOfAthleteId(req.params.id)),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('VALIDATION_ERROR', 'No file uploaded (field "file").');
    const stored = await storeUpload({ buffer: req.file.buffer, category: 'image', uploadKind: 'profile-picture' });

    const { rows } = await pool.query(
      `UPDATE athlete_profiles SET profile_picture_key = $1, updated_at = now()
        WHERE id = $2 RETURNING id, profile_picture_key`,
      [stored.key, req.params.id],
    );
    res.json(ok({ ...rows[0], url: `/uploads/${stored.key}` }));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/athletes/:id/sports — select sport / position / experience.
// ---------------------------------------------------------------------------
router.post(
  '/:id/sports',
  authenticate,
  requireOwnerOrAdmin(async (req) => ownerOfAthleteId(req.params.id)),
  validateBody(addSportSchema),
  asyncHandler(async (req, res) => {
    const { sport_id, position, years_experience } = req.body;
    const sport = await pool.query('SELECT id FROM sports WHERE id = $1', [sport_id]);
    if (sport.rowCount === 0) throw badRequest('VALIDATION_ERROR', 'Unknown sport.');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO athlete_sports (athlete_id, sport_id, position, years_experience, is_seed)
         VALUES ($1, $2, $3, $4, false)
         ON CONFLICT (athlete_id, sport_id)
         DO UPDATE SET position = COALESCE(EXCLUDED.position, athlete_sports.position),
                       years_experience = COALESCE(EXCLUDED.years_experience, athlete_sports.years_experience)
         RETURNING id, sport_id, position, years_experience`,
        [req.params.id, sport_id, position ?? null, years_experience ?? null],
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
// POST /api/athletes/:id/statistics — validated against the sport template.
// ---------------------------------------------------------------------------
router.post(
  '/:id/statistics',
  authenticate,
  requireOwnerOrAdmin(async (req) => ownerOfAthleteId(req.params.id)),
  validateBody(statisticsSchema),
  asyncHandler(async (req, res) => {
    const { sport_id, recorded_on, stat_values } = req.body;
    const template = await loadStatTemplate(sport_id);
    assertStatsMatchTemplate(stat_values, template);

    const { rows } = await pool.query(
      `INSERT INTO athlete_statistics (athlete_id, sport_id, stat_values, recorded_on, is_seed)
       VALUES ($1, $2, $3, $4, false)
       RETURNING id, sport_id, stat_values, recorded_on`,
      [req.params.id, sport_id, JSON.stringify(stat_values), recorded_on || new Date().toISOString().slice(0, 10)],
    );
    res.status(201).json(created(rows[0]));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/athletes/:id/achievements
// ---------------------------------------------------------------------------
router.post(
  '/:id/achievements',
  authenticate,
  requireOwnerOrAdmin(async (req) => ownerOfAthleteId(req.params.id)),
  validateBody(achievementSchema),
  asyncHandler(async (req, res) => {
    const { title, description, achieved_at } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO athlete_achievements (athlete_id, title, description, achieved_at, is_seed)
       VALUES ($1, $2, $3, $4, false)
       RETURNING id, title, description, achieved_at`,
      [req.params.id, title, description ?? null, achieved_at || new Date().toISOString().slice(0, 10)],
    );
    res.status(201).json(created(rows[0]));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/athletes/:id/videos — MP4/MOV, max 200MB, max 3 per athlete.
// ---------------------------------------------------------------------------
router.post(
  '/:id/videos',
  authenticate,
  requireOwnerOrAdmin(async (req) => ownerOfAthleteId(req.params.id)),
  validateBody(videoSchema),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('VALIDATION_ERROR', 'No file uploaded (field "file").');

    const { rows: countRows } = await pool.query(
      'SELECT count(*)::int FROM performance_videos WHERE athlete_id = $1',
      [req.params.id],
    );
    if (countRows[0].count >= 3) {
      throw badRequest('VIDEO_LIMIT_REACHED', 'Each athlete may upload up to 3 performance videos.');
    }

    let stored;
    try {
      stored = await storeUpload({ buffer: req.file.buffer, category: 'video', uploadKind: 'video' });
    } catch (err) {
      // Multer size limit aborts with its own error shape; translate cleanly.
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        throw badRequest('FILE_TOO_LARGE', 'Video is too large. Maximum allowed is 200 MB.');
      }
      throw err;
    }

    const { rows } = await pool.query(
      `INSERT INTO performance_videos (athlete_id, title, object_key, mime_type, size_bytes, is_seed)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING id, title, object_key, mime_type, size_bytes, created_at`,
      [req.params.id, req.body.title, stored.key, stored.mimeType, stored.sizeBytes],
    );
    res.status(201).json(created({ ...rows[0], url: `/uploads/${stored.key}` }));
  }),
);

function ownerOfAthleteId(id) {
  return loadAthleteRow(id).then((row) => row.user_id);
}

export default router;