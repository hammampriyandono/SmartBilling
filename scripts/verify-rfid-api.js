import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPool,requireDevelopment} from '../src/connections.js';
import {hashPassword} from '../src/password.js';
requireDevelopment();if(process.env.RFID_ISOLATED_TEST!=='1')throw new Error('isolated_verification_required');
const pool=createPool();
try{
 const f=(await pool.query('SELECT checkpoint FROM dev_checks.hardware_rfid_verification')).rows[0].checkpoint;
 const holders=(await pool.query('SELECT user_id FROM rfid_cards WHERE uid=ANY($1::text[]) ORDER BY uid',[[f.cardUid,f.otherUid]])).rows.map(r=>r.user_id);
 const password=(await readFile('/run/secrets/rfid_test_owner_password','utf8')).trim(),hash=await hashPassword(password);
 // Only test fixture accounts, preserve identities. No real user/database touched.
 await pool.query('UPDATE users SET password_hash=$2,is_active=true WHERE id=ANY($1::uuid[])',[[f.owner,...holders],hash]);
 const base='http://127.0.0.1:3000';
 async function login(id){
  const {email}=(await pool.query('SELECT email FROM users WHERE id=$1',[id])).rows[0];let cookie='';
  const request=async(path,options={})=>{const r=await fetch(base+path,{signal:AbortSignal.timeout(15000),...options,headers:{Cookie:cookie,Origin:base,...options.headers}});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;};
  const {csrf}=await(await request('/api/auth/csrf')).json();assert.equal((await request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({email,password})})).status,200);return request;
 }
 const path=`/api/owner/rfid-readiness?device_uid=${f.uid}`;
 assert.equal((await fetch(base+path)).status,401);
 const owner=await login(f.owner),ready=await owner(path);assert.equal(ready.status,200);assert.equal((await ready.json()).data.ready,true);
 const otherOwner=await login('00000000-0000-4000-8000-000000000001');assert.equal((await otherOwner(path)).status,404);
 const from=new Date(f.time-60000).toISOString(),to=new Date(f.time+60000).toISOString();
 const history=`/api/usage-sessions?from=${from}&to=${to}&facility_id=${f.facility}`;
 for(const id of holders){const tenant=await login(id);assert.equal((await tenant(path)).status,403);assert.equal((await tenant('/api/rooms')).status,200);
  const body=await(await tenant(history)).json(),sessions=body.data;
  const ownCard=(await pool.query('SELECT uid FROM rfid_cards WHERE user_id=$1',[id])).rows[0].uid;
  assert.equal(sessions.length,ownCard===f.cardUid?3:0);assert.equal(JSON.stringify(sessions).includes(f.cardUid),false);
  if(sessions.length){assert.equal(body.meta.source,'production');assert.ok(sessions.every(s=>s.data_source==='production'));}
  const {csrf}=await(await tenant('/api/auth/csrf')).json();assert.equal((await tenant('/api/auth/logout',{method:'POST',headers:{'X-CSRF-Token':csrf}})).status,204);assert.equal((await tenant('/api/rooms')).status,401);
 }
 console.info('PASS real HTTP/auth: scoped owner RFID readiness 200/404, tenant 403, own sessions only, monitoring 200, logout/anonymous 401.');
}catch(e){console.error('FAIL isolated RFID API:',e instanceof assert.AssertionError?e.message:e.code||'api_verification_error');process.exitCode=1;}
finally{await pool.end();}
