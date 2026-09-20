import pool from '../config/db.js';

/**
 * Best-effort database-backed notification. Delivery is by client polling.
 */
export async function notifyUser(userId, type, title, body = null) {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, is_seed)
       VALUES ($1, $2, $3, $4, false)`,
      [userId, type, title, body],
    );
  } catch (err) {
    console.error('[notifications] failed to insert', err.message);
  }
}

export default notifyUser;