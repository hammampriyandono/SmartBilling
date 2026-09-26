import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { randomBytes, scryptSync } from 'node:crypto';
import { createPool,requireDevelopment } from '../src/connections.js';
requireDevelopment();
const [role,file,...extra]=process.argv.slice(2);
if(!['owner','tenant'].includes(role)||!file||extra.length) throw new Error('Pemakaian: node scripts/provision.js owner|tenant /path/password-file');
const account=role==='owner' ? {id:'00000000-0000-4000-8000-000000000001',email:'owner@simulation.local',legacyEmail:'owner@simulation.invalid',name:'Owner simulasi'}
  : {id:'00000000-0000-4000-8000-000000000201',email:'tenant@simulation.local',legacyEmail:'tenant@simulation.invalid',name:'Tenant simulasi'};
const periods=role==='tenant' ? [
  {room:'00000000-0000-4000-8000-000000000003',start:'2026-09-12T06:00:00+07:00',end:'2026-09-12T18:00:00+07:00'},
  {room:'00000000-0000-4000-8000-000000000103',start:'2026-09-15T00:00:00+07:00',end:null},
] : [];
const pool=createPool({timeout:10000}); let db;
try {
  const password=(await readFile(file,'utf8')).trim();
  if(!password||Buffer.byteLength(password)>1024)throw new Error('Password lokal kosong atau terlalu panjang');
  // Only this local-only script accepts short simulation passwords. It is guarded
  // by requireDevelopment() and stores the same scrypt-v1 format as the app.
  const salt=randomBytes(16).toString('hex'),hash=`scrypt-v1:131072:8:1:${salt}:${scryptSync(password,salt,64,{N:131072,r:8,p:1,maxmem:160*1024*1024}).toString('hex')}`;
  db=await pool.connect(); await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(505009)');
  const matches=(await db.query('SELECT * FROM users WHERE id=$1 OR email=ANY($2::text[]) FOR UPDATE',[account.id,[account.email,account.legacyEmail]])).rows;
  if(matches.length>1)throw new Error('Identitas akun simulasi duplikat; tidak ada perubahan');
  const existing=matches[0];
  if(existing&&(existing.role!==role||![account.email,account.legacyEmail].includes(existing.email)))throw new Error('Identitas akun simulasi konflik');
  let userId=existing?.id;
  if(existing){
    await db.query('UPDATE users SET email=$2,password_hash=$3,is_active=true,row_version=row_version+1,updated_at=now() WHERE id=$1',[existing.id,account.email,hash]);
  }else{
    userId=account.id;
    await db.query('INSERT INTO users(id,name,email,password_hash,role,is_active) VALUES($1,$2,$3,$4,$5,true)',[userId,account.name,account.email,hash,role]);
  }
  for(const period of periods) {
    const h=createHash('sha256').update(`${userId}:${period.room}:${period.start}`).digest('hex');
    const id=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
    await db.query('INSERT INTO occupancies(id,user_id,room_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[id,userId,period.room,period.start,period.end]);
    const row=(await db.query('SELECT * FROM occupancies WHERE id=$1',[id])).rows[0];
    if(row.user_id!==userId || row.room_id!==period.room || +new Date(row.starts_at)!==+new Date(period.start)
      || (row.ends_at?+new Date(row.ends_at):null)!==(period.end?+new Date(period.end):null)) throw new Error('Occupancy demo konflik; tidak ditimpa');
  }
  await db.query('COMMIT');
  console.info(JSON.stringify({status:'siap',email:account.email,role,id:userId,occupancies:periods.length,password:'tidak dicetak; gunakan berkas lokal/prompt provisioning'}));
} catch(e) {
  if(db) await db.query('ROLLBACK').catch(()=>{});
  console.error('Provisioning dibatalkan:',e.code||e.message); process.exitCode=1;
} finally {db?.release();await pool.end();}
