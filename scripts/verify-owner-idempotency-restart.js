import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPool,requireDevelopment} from '../src/connections.js';

requireDevelopment();
const phase=process.argv[2];
assert.ok(['before','after'].includes(phase),'Gunakan before atau after');
const ownerId='00000000-0000-4000-8000-000000000001';
const propertyId='da7a96ec-b738-435e-a617-3a20855edda1';
const key='8c6c26f5-c945-45ac-9d67-e73664ba6235';
const code='IDEMP-RESTART';
const base=process.env.AUTH_TEST_BASE_URL||'http://backend:3000';
const origin=process.env.AUTH_ORIGIN||'http://127.0.0.1:3000';
const pool=createPool();
try {
  const owner=(await pool.query('SELECT id FROM users WHERE id=$1 AND role=$2 AND is_active=true',[ownerId,'owner'])).rows[0];
  assert.ok(owner,'Owner uji harus aktif');
  const existing=(await pool.query('SELECT owner_id,name,timezone FROM properties WHERE id=$1',[propertyId])).rows[0];
  if(phase==='before'&&!existing){
    await pool.query('INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,$3,$4)',[propertyId,ownerId,'UJI IDEMPOTENSI — bukan data pengamatan','Asia/Jakarta']);
  }else{
    assert.equal(existing?.owner_id,ownerId);
    assert.equal(existing?.name,'UJI IDEMPOTENSI — bukan data pengamatan');
  }
  const password=(await readFile(process.env.AUTH_TEST_PASSWORD_FILE,'utf8')).trim();
  let cookie='';
  async function request(path,options={}){
    const response=await fetch(base+path,{signal:AbortSignal.timeout(15000),...options,headers:{Cookie:cookie,Origin:origin,...options.headers}});
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    return response;
  }
  const csrfResponse=await request('/api/auth/csrf');assert.equal(csrfResponse.status,200);
  const {csrf}=await csrfResponse.json();
  const login=await request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({email:'owner@simulation.invalid',password})});
  assert.equal(login.status,200,'Login owner uji gagal');
  const activeCsrfResponse=await request('/api/auth/csrf');assert.equal(activeCsrfResponse.status,200);
  const {csrf:activeCsrf}=await activeCsrfResponse.json();
  const body={property_id:propertyId,code,name:'Kamar uji retry lintas restart',active_from:'2026-09-21T00:00:00Z',reason:'Verifikasi idempotency setelah restart layanan'};
  const prior=(await pool.query('SELECT response_data FROM owner_idempotency WHERE owner_id=$1 AND request_key=$2',[ownerId,key])).rows[0];
  assert.equal(Boolean(prior),phase==='after','Fase uji tidak sesuai dengan record idempotency');
  const response=await request('/api/owner/rooms',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':activeCsrf,'Idempotency-Key':key},body:JSON.stringify(body)});
  assert.equal(response.status,201,'Mutasi/retry harus mengembalikan status awal 201');
  const result=(await response.json()).data;
  assert.equal(result.property_id,propertyId);
  assert.equal(result.code,code);
  if(prior)assert.deepEqual(result,prior.response_data,'Respons setelah restart berbeda dari hasil terkomit');
  const rooms=(await pool.query('SELECT id FROM rooms WHERE property_id=$1 AND code=$2',[propertyId,code])).rows;
  assert.equal(rooms.length,1);
  assert.equal(rooms[0].id,result.id);
  const audits=(await pool.query("SELECT count(*)::int AS count FROM audit_logs WHERE property_id=$1 AND entity_type='room' AND entity_id=$2 AND action='create'",[propertyId,result.id])).rows[0];
  assert.equal(audits.count,1,'Retry tidak boleh membuat audit kedua');
  const persisted=(await pool.query('SELECT response_data FROM owner_idempotency WHERE owner_id=$1 AND request_key=$2',[ownerId,key])).rows[0];
  assert.deepEqual(persisted.response_data,result);
  console.info(`PASS owner idempotency ${phase}: HTTP 201, 1 kamar, 1 audit, respons tersimpan identik.`);
}finally{await pool.end();}
