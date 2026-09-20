import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import pg from 'pg';

const url = process.env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL is not set. Copy backend/.env.example to backend/.env first.');
  process.exit(1);
}

const schemaPath = path.resolve(process.cwd(), 'db', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  console.log('Running schema.sql …');
  await client.query(schema);
  console.log('Schema applied successfully.');
} catch (err) {
  console.error('Migration failed:');
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}