import pg from 'pg';
import env from './env.js';

// The pool is created lazily so utility modules stay importable without a
// live database (tests, scripts). server.js fails early when the URL is
// missing, and any query against a misconfigured pool surfaces a real error.
const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  // Idle-client errors must not crash the process; log and move on.
  console.error('[db] idle client error', err.message);
});

export default pool;