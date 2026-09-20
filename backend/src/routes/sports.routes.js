import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import { ok, created } from '../utils/envelope.js';
import { audit } from '../utils/audit.js';

const router = Router();

const TEMPLATE_TYPES = ['int', 'number', 'text', 'boolean', 'date'];

const createSportSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(1000).optional(),
  stat_template: z.array(
    z.object({
      key: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9_]+$/),
      label: z.string().trim().min(1).max(100),
      type: z.enum(TEMPLATE_TYPES),
    }),
  ).default([]),
});

// ---------------------------------------------------------------------------
// GET /api/sports — public list with stat templates.
// ---------------------------------------------------------------------------
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, slug, description, stat_template, created_at
         FROM sports ORDER BY name`,
    );
    res.json(ok(rows));
  }),
);

// ---------------------------------------------------------------------------
// POST /api/sports — admin manages sports/categories (§4 admin capability).
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  requireRole('admin'),
  validateBody(createSportSchema),
  asyncHandler(async (req, res) => {
    const { name, slug, description, stat_template } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO sports (name, slug, description, stat_template, is_seed)
       VALUES ($1, $2, $3, $4, false)
       RETURNING id, name, slug, description, stat_template`,
      [name, slug, description ?? null, JSON.stringify(stat_template)],
    );
    await audit({ entityType: 'sport', entityId: rows[0].id, actorId: req.user.id, toState: 'created' });
    res.status(201).json(created(rows[0]));
  }),
);

export default router;