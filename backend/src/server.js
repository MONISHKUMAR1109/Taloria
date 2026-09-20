import app from './app.js';
import env from './config/env.js';
import pool from './config/db.js';

async function boot() {
  if (!env.databaseUrl) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and run `npm run db:setup`.');
    process.exit(1);
  }
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('Cannot connect to the database. Is PostgreSQL running and DATABASE_URL correct?');
    console.error(err.message);
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`TALORIA API listening on http://localhost:${env.port}`);
  });
}

boot().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});