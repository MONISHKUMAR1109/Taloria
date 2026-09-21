import { Router } from 'express';
import pool from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { COMPLETENESS_SQL } from '../services/completeness.js';
import { ok } from '../utils/envelope.js';

/**
 * Public landing-page endpoints (§5). Every number is a real COUNT()/query.
 */
const router = Router();

// ---------------------------------------------------------------------------
// GET /api/public/stats — platform statistics: real COUNT queries only.
// ---------------------------------------------------------------------------
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM athlete_profiles ap WHERE ap.archived_at IS NULL AND ap.verification_status = 'verified') AS verified_athletes,
        (SELECT count(*)::int FROM tournaments t WHERE t.status IN ('published','registration_open','registration_closed','ongoing','completed')) AS tournaments,
        (SELECT count(*)::int FROM tournament_applications ta WHERE ta.status <> 'withdrawn') AS applications,
        (SELECT count(*)::int FROM sponsorship_requests sr WHERE sr.status = 'active') AS active_sponsorships
    `);
    res.json(ok(
      {
        verifiedAthletes: rows[0].verified_athletes,
        tournaments: rows[0].tournaments,
        applications: rows[0].applications,
        activeSponsorships: rows[0].active_sponsorships,
        generatedAt: new Date(),
      },
      {
        labels: {
          verifiedAthletes: 'Verified athletes',
          tournaments: 'Tournaments',
          applications: 'Applications submitted',
          activeSponsorships: 'Active sponsorships',
        },
      },
    ));
  }),
);

// ---------------------------------------------------------------------------
// GET /api/public/talent — verified athlete profiles, limit 3–6.
// ---------------------------------------------------------------------------
router.get(
  '/talent',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '6', 10), 1), 12);
    const { rows } = await pool.query(
      `SELECT ap.id, ap.first_name, ap.last_name, ap.country, ap.city,
              ap.verification_status, ap.profile_picture_key, ap.created_at,
              (SELECT count(*)::int FROM athlete_sports a2 WHERE a2.athlete_id = ap.id) AS sport_count,
              (SELECT count(*)::int FROM athlete_statistics st WHERE st.athlete_id = ap.id) AS stat_count,
              ${COMPLETENESS_SQL} AS completeness
         FROM athlete_profiles ap
        WHERE ap.archived_at IS NULL AND ap.verification_status = 'verified'
        ORDER BY ap.created_at DESC
        LIMIT $1`,
      [limit],
    );
    res.json(ok(rows));
  }),
);

// ---------------------------------------------------------------------------
// GET /api/public/tournaments — published tournaments, limit 3–6.
// ---------------------------------------------------------------------------
router.get(
  '/tournaments',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '6', 10), 1), 12);
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.location_country, t.location_city, t.registration_deadline,
              t.start_date, t.end_date, t.status,
              c.name AS category_name,
              (SELECT count(*)::int FROM tournament_participants tp WHERE tp.tournament_id = t.id) AS participant_count,
              t.max_participants,
              (SELECT count(*)::int FROM sponsorship_requests sr WHERE sr.tournament_id = t.id AND sr.status = 'active') AS sponsor_count
         FROM tournaments t
         LEFT JOIN tournament_categories c ON c.id = t.category_id
        WHERE t.status = 'published'
        ORDER BY t.registration_deadline ASC
        LIMIT $1`,
      [limit],
    );
    res.json(ok(rows));
  }),
);

export default router;