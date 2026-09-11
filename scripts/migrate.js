import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createPool, requireDevelopment } from '../src/connections.js';

requireDevelopment();
const pool = createPool({ timeout: 30000 });
let connection;
try {
  connection = await pool.connect();
  await connection.query('BEGIN');
  await connection.query('SELECT pg_advisory_xact_lock(505001)');
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  const directory = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
    const sql = await readFile(new URL(name, directory), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await connection.query('SELECT checksum FROM schema_migrations WHERE name = $1', [name]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error('Migration checksum mismatch');
      continue;
    }
    await connection.query(sql);
    await connection.query('INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)', [name, checksum]);
    console.info(`Migration siap: ${name}`);
  }
  await connection.query('COMMIT');
  console.info('Migration selesai. Data existing dipertahankan.');
} catch (error) {
  if (connection) await connection.query('ROLLBACK').catch(() => {});
  console.error('Migration gagal dan transaksi dibatalkan.', error.code || 'migration_error');
  process.exitCode = 1;
} finally {
  connection?.release();
  await pool.end();
}
