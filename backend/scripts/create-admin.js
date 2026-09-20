import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

/**
 * Bootstrap the very first Admin account (spec §4.1): an Admin can only be
 * created by an existing Admin, so the very first one is created via this
 * operator script against the database directly.
 *
 * Usage: npm run create-admin -- <email> <password>
 */
const [, , email, password] = process.argv;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env first.');
  process.exit(1);
}
if (!email || !password) {
  console.error('Usage: npm run create-admin -- you@example.com <password>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount > 0) {
    console.error('A user with this email already exists.');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await client.query(
    `INSERT INTO users (id, email, password_hash, role, email_verified_at, is_seed)
     VALUES ($1, $2, $3, 'admin', now(), false)`,
    [randomUUID(), email.toLowerCase(), passwordHash],
  );
  console.log('Admin account created:', email);
} catch (err) {
  console.error('Failed to create admin:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}