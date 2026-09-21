import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { ok, created } from '../utils/envelope.js';
import { notFound, forbidden, badRequest, AppError, ERROR_CODES } from '../utils/errors.js';
import { notifyUser } from '../services/notifications.js';

const router = Router();

const startThreadSchema = z.object({
  athlete_id: z.string().uuid(),
  initial_message: z.string().trim().min(1).max(4000),
});

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

async function resolveThreadScoutAthlete(thread) {
  const [scout, athlete] = await Promise.all([
    pool.query(
      `SELECT CONCAT(first_name, ' ', last_name) AS name, organization FROM scout_profiles WHERE id = $1`,
      [thread.scout_id],
    ),
    pool.query(
      `SELECT CONCAT(first_name, ' ', last_name) AS name, verification_status FROM athlete_profiles WHERE id = $1`,
      [thread.athlete_id],
    ),
  ]);
  return {
    scout: scout.rows[0] ?? null,
    athlete: athlete.rows[0] ?? null,
  };
}

async function loadThread(id) {
  const { rows } = await pool.query('SELECT * FROM message_threads WHERE id = $1', [id]);
  if (rows.length === 0) throw notFound('Message thread not found.');
  return rows[0];
}

function assertCanReadThread(req, thread) {
  // Parties (scout or the athlete) and admins may read.
  if (req.user.role === 'admin') return true;
  const isScoutParty = (async () => {
    const { rows } = await pool.query(
      'SELECT 1 FROM scout_profiles WHERE id = $1 AND user_id = $2 AND archived_at IS NULL',
      [thread.scout_id, req.user.id],
    );
    return rows.length > 0;
  })();
  const isAthleteParty = (async () => {
    const { rows } = await pool.query(
      'SELECT 1 FROM athlete_profiles WHERE id = $1 AND user_id = $2 AND archived_at IS NULL',
      [thread.athlete_id, req.user.id],
    );
    return rows.length > 0;
  })();
  return Promise.all([isScoutParty, isAthleteParty]).then(([s, a]) => s || a);
}

// ---------------------------------------------------------------------------
// POST /api/messages — a scout starts (or resumes) a thread with an athlete.
// Threads are keyed on (scout_id, athlete_id). A blocked scout cannot start
// new threads; existing threads stay visible to both sides.
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  requireRole('scout'),
  validateBody(startThreadSchema),
  asyncHandler(async (req, res) => {
    const { rows: scoutRows } = await pool.query(
      'SELECT id FROM scout_profiles WHERE user_id = $1 AND archived_at IS NULL',
      [req.user.id],
    );
    if (scoutRows.length === 0) throw forbidden('Scout profile required.');
    const scoutId = scoutRows[0].id;

    const athlete = await pool.query(
      'SELECT id FROM athlete_profiles WHERE id = $1 AND archived_at IS NULL',
      [req.body.athlete_id],
    );
    if (athlete.rowCount === 0) throw notFound('Athlete not found.');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: existing } = await client.query(
        `SELECT * FROM message_threads WHERE scout_id = $1 AND athlete_id = $2 FOR UPDATE`,
        [scoutId, req.body.athlete_id],
      );
      let thread = existing[0];

      if (thread && thread.blocked_at) {
        throw new AppError(ERROR_CODES.BLOCKED, 'This athlete has blocked new threads from you.', 403);
      }
      if (!thread) {
        const inserted = await client.query(
          `INSERT INTO message_threads (scout_id, athlete_id, is_seed) VALUES ($1, $2, false) RETURNING *`,
          [scoutId, req.body.athlete_id],
        );
        thread = inserted.rows[0];
      }

      const { rows: message } = await client.query(
        `INSERT INTO messages (thread_id, sender_user_id, sender_role, body, is_seed)
         VALUES ($1, $2, 'scout', $3, false)
         RETURNING id, body, created_at, read_at`,
        [thread.id, req.user.id, req.body.initial_message],
      );

      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, is_seed)
         VALUES ($1, 'scout_contact', 'A scout contacted you',
                 'A scout has started a conversation with you.', false)`,
        [await athleteUserIdOf(req.body.athlete_id)],
      );

      await client.query('COMMIT');
      res.status(201).json(created({ threadId: thread.id, message: message.rows[0] }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

function athleteUserIdOf(athleteId) {
  return pool.query('SELECT user_id FROM athlete_profiles WHERE id = $1', [athleteId]).then((r) => r.rows[0]?.user_id);
}

// ---------------------------------------------------------------------------
// GET /api/messages — my threads.
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  requireRole('scout', 'athlete', 'admin'),
  asyncHandler(async (req, res) => {
    const q = req.query;
    const pageSize = Math.min(parseInt(q.pageSize || '20', 10), 100);
    const page = Math.max(parseInt(q.page || '1', 10), 1);

    const values = [];
    const conditions = [];
    let i = 1;
    const add = (sql, ...vs) => {
      values.push(...vs);
      conditions.push(sql.replace(/\?/g, () => `$${i++}`));
    };

    if (req.user.role === 'scout') {
      const { rows } = await pool.query('SELECT id FROM scout_profiles WHERE user_id = $1 AND archived_at IS NULL', [req.user.id]);
      if (rows.length === 0) throw forbidden('Scout profile required.');
      add('mt.scout_id = ?::uuid', rows[0].id);
    } else if (req.user.role === 'athlete') {
      const { rows } = await pool.query('SELECT id FROM athlete_profiles WHERE user_id = $1 AND archived_at IS NULL', [req.user.id]);
      if (rows.length === 0) throw forbidden('Athlete profile required.');
      add('mt.athlete_id = ?::uuid', rows[0].id);
    }

    const whereSql = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT mt.id, mt.blocked_at, mt.created_at AS thread_created_at,
              (SELECT body FROM messages m WHERE m.thread_id = mt.id ORDER BY created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages m WHERE m.thread_id = mt.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
              (SELECT count(*)::int FROM messages m WHERE m.thread_id = mt.id AND m.read_at IS NULL AND m.sender_user_id <> $1) AS unread_count,
              spn.user_id AS scout_user_id, CONCAT(sp.first_name, ' ', sp.last_name) AS scout_name,
              ap.user_id AS athlete_user_id, CONCAT(ap.first_name, ' ', ap.last_name) AS athlete_name
         FROM message_threads mt
         JOIN scout_profiles sp ON sp.id = mt.scout_id
         JOIN athlete_profiles ap ON ap.id = mt.athlete_id${whereSql}
         ORDER BY last_message_at DESC NULLS LAST
         LIMIT $${i} OFFSET $${i + 1}`,
      [req.user.id, ...values, pageSize, (page - 1) * pageSize],
    );
    res.json(ok(rows));
  }),
);

// ---------------------------------------------------------------------------
// GET /api/messages/:threadId — full thread, marks the reader's side as read.
// ---------------------------------------------------------------------------
router.get(
  '/:threadId',
  authenticate,
  requireRole('scout', 'athlete', 'admin'),
  asyncHandler(async (req, res) => {
    const thread = await loadThread(req.params.threadId);
    if (!(await assertCanReadThread(req, thread))) throw forbidden();

    const { rows: messages } = await pool.query(
      `SELECT id, sender_user_id, sender_role, body, read_at, created_at
         FROM messages WHERE thread_id = $1 ORDER BY created_at`,
      [thread.id],
    );

    // Mark the reader's view as read (messages from the other side).
    const { rows: myProfile } = req.user.role === 'scout'
      ? await pool.query('SELECT id FROM scout_profiles WHERE user_id = $1 AND archived_at IS NULL', [req.user.id])
      : await pool.query('SELECT id FROM athlete_profiles WHERE user_id = $1 AND archived_at IS NULL', [req.user.id]);
    if (myProfile.length > 0) {
      if (req.user.role === 'scout') {
        await pool.query(
          `UPDATE messages SET read_at = now()
            WHERE thread_id = $1 AND sender_role = 'athlete' AND read_at IS NULL`,
          [thread.id],
        );
      } else if (req.user.role === 'athlete') {
        await pool.query(
          `UPDATE messages SET read_at = now()
            WHERE thread_id = $1 AND sender_role = 'scout' AND read_at IS NULL`,
          [thread.id],
        );
      }
    }

    const parties = await resolveThreadScoutAthlete(thread);
    res.json(ok({
      id: thread.id,
      blockedAt: thread.blocked_at,
      ...parties,
      messages,
    }));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/messages/:threadId — send a message in the thread.
// ---------------------------------------------------------------------------
router.post(
  '/:threadId',
  authenticate,
  requireRole('scout', 'athlete', 'admin'),
  validateBody(messageSchema),
  asyncHandler(async (req, res) => {
    const thread = await loadThread(req.params.threadId);
    if (!(await assertCanReadThread(req, thread))) throw forbidden();

    if (thread.blocked_at && req.user.role === 'scout') {
      throw new AppError(ERROR_CODES.BLOCKED, 'This athlete has blocked you from sending messages.', 403);
    }

    const senderRole = req.user.role === 'athlete' ? 'athlete' : 'scout';
    const { rows } = await pool.query(
      `INSERT INTO messages (thread_id, sender_user_id, sender_role, body, is_seed)
       VALUES ($1, $2, $3, $4, false)
       RETURNING id, sender_role, body, read_at, created_at`,
      [thread.id, req.user.id, senderRole, req.body.body],
    );

    const recipientUserId = senderRole === 'scout'
      ? (await athleteUserIdOf(thread.athlete_id))
      : (await pool.query('SELECT user_id FROM scout_profiles WHERE id = $1', [thread.scout_id])).rows[0]?.user_id;
    await notifyUser(recipientUserId, 'message', 'New message', req.body.body.slice(0, 140));

    res.status(201).json(created(rows[0]));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/messages/:threadId/block — athlete blocks a scout from new threads.
// Existing threads stay visible to both sides.
// ---------------------------------------------------------------------------
router.post(
  '/:threadId/block',
  authenticate,
  requireRole('athlete'),
  asyncHandler(async (req, res) => {
    const thread = await loadThread(req.params.threadId);
    const { rows: mine } = await pool.query(
      'SELECT id FROM athlete_profiles WHERE user_id = $1 AND archived_at IS NULL',
      [req.user.id],
    );
    if (mine.length === 0 || mine[0].id !== thread.athlete_id) {
      throw forbidden('Only the athlete in this thread can block it.');
    }
    await pool.query('UPDATE message_threads SET blocked_at = now(), updated_at = now() WHERE id = $1', [thread.id]);
    res.json(ok({ id: thread.id, blockedAt: new Date() }));
  }),
);

export default router;