import { Router } from 'express';
import pool from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { ok } from '../utils/envelope.js';
import { notFound } from '../utils/errors.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/notifications — client polls this (~30s). Read via read_at.
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const q = req.query;
    const pageSize = Math.min(parseInt(q.pageSize || '20', 10), 100);
    const page = Math.max(parseInt(q.page || '1', 10), 1);

    const values = [req.user.id];
    let listWhere = ' WHERE user_id = $1';
    let countWhere = ' WHERE user_id = $1';
    if (q.unread === 'true') {
      listWhere += ' AND read_at IS NULL';
      countWhere += ' AND read_at IS NULL';
    }

    const { rows: countRows } = await pool.query(
      `SELECT count(*)::int AS total FROM notifications${countWhere}`,
      values,
    );

    const { rows } = await pool.query(
      `SELECT id, type, title, body, read_at, created_at
         FROM notifications${listWhere}
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [...values, pageSize, (page - 1) * pageSize],
    );

    const { rows: unreadRows } = await pool.query(
      `SELECT count(*)::int AS unread FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [req.user.id],
    );

    res.json(ok(rows, {
      page,
      pageSize,
      total: countRows[0].total,
      unread: unreadRows[0].unread,
      totalPages: Math.max(1, Math.ceil(countRows[0].total / pageSize)),
    }));
  }),
);

// ---------------------------------------------------------------------------
// PUT /api/notifications/:id/read
// ---------------------------------------------------------------------------
router.put(
  '/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now()), updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING id, read_at`,
      [req.params.id, req.user.id],
    );
    if (rows.length === 0) throw notFound('Notification not found.');
    res.json(ok(rows[0]));
  }),
);

export default router;