import { randomBytes, scryptSync } from 'node:crypto';
import { createPool, requireDevelopment } from '../src/connections.js';

requireDevelopment();
const pool = createPool();
let db;
try {
  db = await pool.connect();
  await db.query('BEGIN');
  const salt = randomBytes(16).toString('hex');
  const hash = `scrypt:${salt}:${scryptSync(randomBytes(32), salt, 64).toString('hex')}`;
  // Akun nonaktif dengan password acak yang tidak disimpan. Bukan akun login.
  await db.query(`INSERT INTO users(id,name,email,password_hash,role,is_active) VALUES
    ('00000000-0000-4000-8000-000000000001','Owner simulasi','owner@simulation.invalid',$1,'owner',false)
    ON CONFLICT (id) DO NOTHING`, [hash]);
  await db.query(`INSERT INTO properties(id,owner_id,name,timezone) VALUES
    ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Kost SIMULASI','Asia/Jakarta')
    ON CONFLICT (id) DO NOTHING`);
  await db.query(`INSERT INTO rooms(id,property_id,code,name,active_from) VALUES
    ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','SIM-01','Kamar simulasi','2026-01-01T00:00:00Z')
    ON CONFLICT (id) DO NOTHING`);
  await db.query(`INSERT INTO devices(id,property_id,device_uid,status) VALUES
    ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','sim-device-01','active')
    ON CONFLICT (id) DO NOTHING`);
  await db.query(`INSERT INTO meters(id,property_id,device_id,room_id,kind,channel_no,installed_at) VALUES
    ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003','room',1,'2026-01-01T00:00:00Z')
    ON CONFLICT (id) DO NOTHING`);
  await db.query(`INSERT INTO meters(id,property_id,device_id,kind,channel_no,installed_at) VALUES
    ('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004','main',0,'2026-01-01T00:00:00Z')
    ON CONFLICT (id) DO NOTHING`);
  await db.query(`INSERT INTO communal_loads(id,property_id,name,load_type) VALUES
    ('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000002','Fasilitas SIMULASI','attributable')
    ON CONFLICT (id) DO NOTHING`);
  await db.query(`INSERT INTO meters(id,property_id,device_id,communal_load_id,kind,channel_no,installed_at) VALUES
    ('00000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000007','communal',2,'2026-01-01T00:00:00Z')
    ON CONFLICT (id) DO NOTHING`);
  await db.query('COMMIT');
  console.info('Mapping SIMULASI siap di smartbilling_dev. Tidak menambah pembacaan sensor.');
} catch (error) {
  if (db) await db.query('ROLLBACK').catch(() => {});
  console.error('Seed dibatalkan.', error.code || 'seed_error');
  process.exitCode = 1;
} finally { db?.release(); await pool.end(); }
