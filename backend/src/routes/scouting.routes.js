import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { ok, created } from '../utils/envelope.js';
import { notFound, forbidden } from '../utils/errors.js';

const router = Router();

const noteSchema = z.object({
  note: z.string().trim().min(1).max(4000),
});

async function scoutProfileOrThrow(userId) {
  const { rows } = await pool.query(
    'SELECT id FROM scout_profiles WHERE user_id = $1 AND archived_at IS NULL',
    [userId],
  );
  if (rows.length === 0) throw forbidden('Scout profile required.');
  return rows[0].id;
}

async function athleteExistsOrThrow(athleteId) {
  const { rows } = await pool.query(
    'SELECT id FROM athlete_profiles WHERE id = $1 AND archived_at IS NULL',
    [athleteId],
  );
  if (rows.length === 0) throw notFound('Athlete not found.');
}

// ---------------------------------------------------------------------------
// GET /api/scouting/shortlist — the scout's shortlisted athletes (with notes).
// ---------------------------------------------------------------------------
router.get(
  '/shortlist',
  authenticate,
  requireRole('scout'),
  asyncHandler(async (req, res) => {
    const scoutId = await scoutProfileOrThrow(req.user.id);
    const { rows } = await pool.query(
      `SELECT sa.athlete_id AS id, sa.created_at AS shortlisted_at,
              CONCAT(ap.first_name, ' ', ap.last_name) AS name,
              ap.country, ap.city, ap.date_of_birth, ap.verification_status,
              (SELECT count(*)::int FROM athlete_sports a2 WHERE a2.athlete_id = ap.id) AS sport_count,
              (SELECT note FROM scouting_notes sn
                WHERE sn.scout_id = sa.scout_id AND sn.athlete_id = sa.athlete_id
                ORDER BY sn.created_at DESC LIMIT 1) AS note
         FROM shortlisted_athletes sa
         JOIN athlete_profiles ap ON ap.id = sa.athlete_id
        WHERE sa.scout_id = $1 AND ap.archived_at IS NULL
        ORDER BY sa.created_at DESC`,
      [scoutId],
    );
    res.json(ok(rows));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/scouting/shortlist/:athleteId — add an athlete to the shortlist.
// ---------------------------------------------------------------------------
router.post(
  '/shortlist/:athleteId',
  authenticate,
  requireRole('scout'),
  asyncHandler(async (req, res) => {
    const scoutId = await scoutProfileOrThrow(req.user.id);
    await athleteExistsOrThrow(req.params.athleteId);

    const { rows } = await pool.query(
      `INSERT INTO shortlisted_athletes (scout_id, athlete_id, is_seed)
       VALUES ($1, $2, false)
       ON CONFLICT (scout_id, athlete_id) DO NOTHING
       RETURNING id, athlete_id, created_at`,
      [scoutId, req.params.athleteId],
    );
    res.status(201).json(created(rows[0] ?? { athlete_id: req.params.athleteId, created_at: new Date(), already: true }));
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/scouting/shortlist/:athleteId — remove from the shortlist.
// ---------------------------------------------------------------------------
router.delete(
  '/shortlist/:athleteId',
  authenticate,
  requireRole('scout'),
  asyncHandler(async (req, res) => {
    const scoutId = await scoutProfileOrThrow(req.user.id);
    await pool.query(
      'DELETE FROM shortlisted_athletes WHERE scout_id = $1 AND athlete_id = $2',
      [scoutId, req.params.athleteId],
    );
    res.json(ok({ removed: req.params.athleteId }));
  }),
);

// ---------------------------------------------------------------------------
// PUT /api/scouting/notes/:athleteId — upsert the scout's note on an athlete.
// ---------------------------------------------------------------------------
router.put(
  '/notes/:athleteId',
  authenticate,
  requireRole('scout'),
  validateBody(noteSchema),
  asyncHandler(async (req, res) => {
    const scoutId = await scoutProfileOrThrow(req.user.id);
    await athleteExistsOrThrow(req.params.athleteId);

    const updated = await pool.query(
      `UPDATE scouting_notes SET note = $3, updated_at = now()
        WHERE scout_id = $1 AND athlete_id = $2
        RETURNING id, athlete_id, note, updated_at`,
      [scoutId, req.params.athleteId, req.body.note],
    );
    if (updated.rows.length > 0) return res.json(ok(updated.rows[0]));

    const { rows } = await pool.query(
      `INSERT INTO scouting_notes (scout_id, athlete_id, note, is_seed)
       VALUES ($1, $2, $3, false)
       RETURNING id, athlete_id, note, updated_at`,
      [scoutId, req.params.athleteId, req.body.note],
    );
    res.json(ok(rows[0]));
  }),
);

export default router;