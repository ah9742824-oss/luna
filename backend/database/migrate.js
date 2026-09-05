/**
 * LUNA Cafe / Business Core — database migration runner.
 *
 * Plain Node.js script (does NOT run on Cloudflare Workers). Connects
 * directly to Supabase (not through Hyperdrive — same convention as
 * seed.js) and applies every *.sql file under database/migrations/, in
 * filename order, that has not already been recorded in the
 * `schema_migrations` table. Each migration file runs inside its own
 * transaction (the SQL files themselves also wrap in BEGIN/COMMIT for
 * clarity when run manually, e.g. via psql).
 *
 * Usage:
 *   cd backend
 *   cp .env.example .env   # fill in SUPABASE_DB_URL
 *   npm run migrate
 *
 * Safe to re-run: already-applied migrations are skipped.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`${name} is required. Set it in backend/.env before running migrations.`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_DB_URL = requireEnv('SUPABASE_DB_URL');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(pool) {
  const result = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
  return new Set(result.rows.map((r) => r.name));
}

async function run() {
  const pool = new Pool({ connectionString: SUPABASE_DB_URL });

  try {
    await ensureMigrationsTable(pool);
    const applied = await getAppliedMigrations(pool);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found in database/migrations/.');
      return;
    }

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip   ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`apply  ${file} ...`);
      const client = await pool.connect();
      try {
        // The .sql files already contain their own BEGIN/COMMIT; running
        // them as a single multi-statement query keeps that transaction
        // intact, and pg's simple query protocol supports it.
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        appliedCount += 1;
        console.log(`done   ${file}`);
      } catch (err) {
        console.error(`FAILED ${file}:`, err.message);
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(`\nMigrations complete. ${appliedCount} applied, ${files.length - appliedCount} already up to date.`);
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration run failed:', err);
  process.exit(1);
});
