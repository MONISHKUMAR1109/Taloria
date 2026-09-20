import pool from '../config/db.js';
import { badRequest } from '../utils/errors.js';

/**
 * Sport-specific statistics (§12.1): every write to athlete_statistics is
 * validated against the sport's stat_template JSONB before hitting the DB.
 */
export async function loadStatTemplate(sportId) {
  const { rows } = await pool.query('SELECT stat_template FROM sports WHERE id = $1', [sportId]);
  if (rows.length === 0) throw badRequest('VALIDATION_ERROR', 'Unknown sport.');
  return rows[0].stat_template;
}

export function assertStatsMatchTemplate(statValues, template) {
  const allowed = new Map(template.map((f) => [f.key, f.type]));

  const unknown = Object.keys(statValues).filter((k) => !allowed.has(k));
  if (unknown.length > 0) {
    throw badRequest('STAT_TEMPLATE_MISMATCH', `Unknown statistic field(s): ${unknown.join(', ')}.`);
  }

  for (const field of template) {
    if (!(field.key in statValues)) {
      throw badRequest('STAT_TEMPLATE_MISMATCH', `Missing statistic field "${field.key}" (${field.label || field.key}).`);
    }
    const value = statValues[field.key];
    let valid = true;
    if (field.type === 'int') valid = Number.isInteger(value);
    else if (field.type === 'number') valid = typeof value === 'number' && Number.isFinite(value);
    else if (field.type === 'text') valid = typeof value === 'string';
    else if (field.type === 'boolean') valid = typeof value === 'boolean';
    if (!valid) {
      throw badRequest('STAT_TEMPLATE_MISMATCH', `Field "${field.key}" must be a ${field.type}.`);
    }
  }
}