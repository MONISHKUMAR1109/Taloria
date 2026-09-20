import pool from '../config/db.js';

/**
 * Every state transition writes a row to audit_logs.
 * Best-effort: never throws into the request path.
 */
export async function audit({
  entityType,
  entityId = null,
  fromState = null,
  toState = null,
  actorId = null,
  details = null,
}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (entity_type, entity_id, from_state, to_state, actor_id, details, is_seed)
       VALUES ($1, $2, $3, $4, $5, $6, false)`,
      [entityType, entityId, fromState, toState, actorId, details ?? null],
    );
  } catch (err) {
    console.error('[audit] failed to write audit_log', err.message);
  }
}

export default audit;