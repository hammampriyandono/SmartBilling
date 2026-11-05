import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createPool} from '../src/connections.js';
import {runtimeEnvironment} from '../src/runtime-config.js';
import {hashPassword} from '../src/password.js';
import {uuid} from '../src/http-input.js';

// Explicit operator utility; never called by startup, seed or migration.
// Password is accepted only through a private file, never a CLI argument/log.
let pool,db;
try {
  runtimeEnvironment();
  const mode=process.argv[2],email=process.env.VIEWER_EMAIL?.trim().toLowerCase();
  if(!['create','revoke'].includes(mode)||!email||email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw Error('invalid_viewer_input');
  let ownerId,expiresAt,passwordHash;
  if(mode==='create') {
    ownerId=uuid(process.env.VIEWER_OWNER_ID);
    const date=new Date(process.env.VIEWER_EXPIRES_AT);
    if(!Number.isFinite(+date)||+date<=Date.now())throw Error('future_expiry_required');
    expiresAt=date.toISOString();
    if(!process.env.VIEWER_PASSWORD_FILE)throw Error('viewer_password_file_required');
    passwordHash=await hashPassword((await readFile(process.env.VIEWER_PASSWORD_FILE,'utf8')).trim());
  }
  pool=createPool({timeout:10000});db=await pool.connect();await db.query('BEGIN');
  if(mode==='create') {
    const owner=(await db.query("SELECT id FROM users WHERE id=$1 AND role='owner' AND is_active FOR SHARE",[ownerId])).rows[0];
    if(!owner)throw Error('active_owner_required');
    const id=randomUUID();
    await db.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Pengunjung expo',$2,$3,'viewer')",[id,email,passwordHash]);
    await db.query('INSERT INTO owner_viewers(user_id,owner_id,expires_at) VALUES($1,$2,$3)',[id,ownerId,expiresAt]);
  }else {
    const changed=await db.query(`UPDATE owner_viewers v SET revoked_at=COALESCE(v.revoked_at,now())
      FROM users u WHERE u.id=v.user_id AND u.role='viewer' AND u.email=$1 RETURNING v.user_id`,[email]);
    if(!changed.rowCount)throw Error('viewer_not_found');
    await db.query('DELETE FROM auth_sessions WHERE sess->>\'userId\'=$1',[changed.rows[0].user_id]);
  }
  await db.query('COMMIT');
  console.info(JSON.stringify({status:mode==='create'?'viewer_created':'viewer_revoked',...(expiresAt?{expires_at:expiresAt}:{}),password:'tidak dicetak'}));
}catch {
  if(db)await db.query('ROLLBACK').catch(()=>{});
  console.error('Persiapan akun expo gagal; periksa mode, konfigurasi privat, owner, expiry, dan email unik.');process.exitCode=1;
}finally{db?.release();await pool?.end();}
