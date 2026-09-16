import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createPool,requireDevelopment } from '../src/connections.js';
import { hashPassword,verifyPassword } from '../src/password.js';
requireDevelopment();
const [role,file,...extra]=process.argv.slice(2);
if(!['owner','tenant'].includes(role)||!file||extra.length) throw new Error('Pemakaian: node scripts/provision.js owner|tenant /path/password-file');
const account=role==='owner' ? {id:'00000000-0000-4000-8000-000000000001',email:'owner@simulation.invalid',name:'Owner simulasi'}
  : {id:'00000000-0000-4000-8000-000000000201',email:'tenant@simulation.invalid',name:'Tenant simulasi'};
const periods=role==='tenant' ? [
  {room:'00000000-0000-4000-8000-000000000003',start:'2026-09-12T06:00:00+07:00',end:'2026-09-12T18:00:00+07:00'},
  {room:'00000000-0000-4000-8000-000000000103',start:'2026-09-15T00:00:00+07:00',end:null},
] : [];
const pool=createPool({timeout:10000}); let db;
try {
  const password=(await readFile(file,'utf8')).trim();
  const hash=await hashPassword(password);
  db=await pool.connect(); await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(505009)');
  const existing=(await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[account.id])).rows[0];
  if(existing && (existing.role!==role || existing.email!==account.email)) throw new Error('Identitas akun demo konflik');
  if(existing?.is_active) {
    if(!await verifyPassword(password,existing.password_hash)) throw new Error('Akun aktif memiliki password berbeda; tidak ditimpa');
  } else if(existing) {
    await db.query('UPDATE users SET password_hash=$2,is_active=true WHERE id=$1',[account.id,hash]);
  } else {
    await db.query('INSERT INTO users(id,name,email,password_hash,role,is_active) VALUES($1,$2,$3,$4,$5,true)',[account.id,account.name,account.email,hash,role]);
  }
  for(const period of periods) {
    const h=createHash('sha256').update(`${account.id}:${period.room}:${period.start}`).digest('hex');
    const id=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
    await db.query('INSERT INTO occupancies(id,user_id,room_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[id,account.id,period.room,period.start,period.end]);
    const row=(await db.query('SELECT * FROM occupancies WHERE id=$1',[id])).rows[0];
    if(row.user_id!==account.id || row.room_id!==period.room || +new Date(row.starts_at)!==+new Date(period.start)
      || (row.ends_at?+new Date(row.ends_at):null)!==(period.end?+new Date(period.end):null)) throw new Error('Occupancy demo konflik; tidak ditimpa');
  }
  await db.query('COMMIT');
  console.info(JSON.stringify({status:'siap',email:account.email,role,id:account.id,occupancies:periods,password:'tidak dicetak; gunakan berkas lokal/prompt provisioning'}));
} catch(e) {
  if(db) await db.query('ROLLBACK').catch(()=>{});
  console.error('Provisioning dibatalkan:',e.code||e.message); process.exitCode=1;
} finally {db?.release();await pool.end();}
