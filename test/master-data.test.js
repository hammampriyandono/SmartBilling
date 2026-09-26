import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {createPool,requireDevelopment} from '../src/connections.js';
import {masterApi} from '../src/master-api.js';
import {apiError} from '../src/monitoring-api.js';

test('routing master: guard owner hanya mencakup namespace /api/owner',async()=>{
 const app=express(),pool={query:()=>{throw new Error('route non-owner tidak boleh menyentuh master DB');}};
 app.use((req,_res,next)=>{req.user={id:randomUUID(),role:'tenant'};next();});
 app.use('/api',masterApi(pool,{csrf:(_q,_s,n)=>n(),idempotencySecret:'test-secret-long-enough-for-hmac-0123456789'}));
 for(const path of ['/rooms','/meters','/facilities','/usage-sessions'])app.get(`/api${path}`,(_req,res)=>res.json({route:path}));
 app.use(apiError);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const path of ['/rooms','/meters','/facilities','/usage-sessions']){
   const response=await fetch(`${base}/api${path}`);assert.equal(response.status,200,path);assert.equal((await response.json()).route,path);
  }
  for(const [path,method] of [['/api/owner','GET'],['/api/owner/rooms','GET'],['/api/owner/rooms','POST']]){
   const response=await fetch(base+path,{method});assert.equal(response.status,403,`${method} ${path}`);assert.equal((await response.json()).error,'owner_required');
  }
 }finally{await new Promise(r=>{server.closeAllConnections();server.close(r);});}
});

test('PostgreSQL master: scope owner, audit, version, move atomik, simulation dan histori',{
 skip:process.env.INTEGRATION_DB!=='1',
},async()=>{
 requireDevelopment();const real=createPool({timeout:10000}),db=await real.connect();let server,sp=0;
 try{
  await db.query('BEGIN');
  const owner=randomUUID(),other=randomUUID(),tenant=randomUUID(),property=randomUUID(),property2=randomUUID();
  for(const [id,role] of [[owner,'owner'],[other,'owner'],[tenant,'tenant']])await db.query("INSERT INTO users(id,name,email,password_hash,role,is_active) VALUES($1,'MASTER TEST',$2,'unused',$3,true)",[id,`${id}@test.invalid`,role]);
  await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'MASTER TEST','Asia/Jakarta'),($3,$4,'OTHER','Asia/Jakarta')",[property,owner,property2,other]);
  await db.query("INSERT INTO property_tenants(id,property_id,user_id,status) VALUES($1,$2,$3,'active')",[randomUUID(),property,tenant]);
  const adapter={query:(...a)=>db.query(...a),connect:async()=>{let name;return{release(){},query:async(sql,args)=>{if(sql==='BEGIN'){name=`master_${++sp}`;return db.query(`SAVEPOINT ${name}`);}if(sql==='COMMIT')return db.query(`RELEASE SAVEPOINT ${name}`);if(sql==='ROLLBACK')return db.query(`ROLLBACK TO SAVEPOINT ${name}`);return db.query(sql,args);}}}};
  let acting={id:owner,role:'owner'},base;async function startApi(){const app=express();app.use((req,_res,next)=>{req.user=acting;next();});app.use('/api',masterApi(adapter,{csrf:(_q,_s,n)=>n(),idempotencySecret:'test-secret-long-enough-for-hmac-0123456789'}));app.use(apiError);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;}await startApi();
  const call=(path,method='GET',body,key=randomUUID())=>fetch(base+path,{method,headers:body?{'content-type':'application/json','idempotency-key':key}:{},body:body?JSON.stringify(body):undefined});
  let response=await call('/api/owner/properties');assert.equal(response.status,200);let properties=(await response.json()).data;assert.equal(properties.length,1);assert.equal(properties[0].id,property);assert.equal(properties[0].row_version,1);
  const renameBody={name:'Properti Uji Berganti Nama',row_version:1,reason:'Nama diperjelas'},renameKey=randomUUID();response=await call(`/api/owner/properties/${property}`,'PATCH',renameBody,renameKey);assert.equal(response.status,200);let renamed=(await response.json()).data;assert.equal(renamed.id,property);assert.equal(renamed.name,renameBody.name);assert.equal(renamed.row_version,2);
  assert.deepEqual((await (await call(`/api/owner/properties/${property}`,'PATCH',renameBody,renameKey)).json()).data,renamed);
  assert.equal((await call(`/api/owner/properties/${property}`,'PATCH',{...renameBody,name:'Nama usang'},randomUUID())).status,409);
  const createRoom={property_id:property,code:'A1',name:'Kamar A',active_from:'2026-01-01T00:00:00Z',reason:'uji create'},createKey=randomUUID();
  assert.equal((await call('/api/owner/rooms','POST',createRoom,'bad-key')).status,400);
  response=await call('/api/owner/rooms','POST',createRoom,createKey);assert.equal(response.status,201);let room=(await response.json()).data;
  assert.deepEqual((await (await call('/api/owner/rooms','POST',createRoom,createKey)).json()).data,room);
  assert.equal((await call('/api/owner/rooms','POST',{...createRoom,name:'Beda'},createKey)).status,409);
  assert.equal((await call('/api/owner/facilities','POST',{property_id:property,name:'Lain',load_type:'shared',reason:'uji'},createKey)).status,409);
  response=await call(`/api/owner/rooms/${room.id}`,'PATCH',{name:'Kamar A Baru',row_version:1,reason:'uji rename'});assert.equal(response.status,200);room=(await response.json()).data;assert.equal(room.row_version,2);
  assert.equal((await call(`/api/owner/rooms/${room.id}`,'PATCH',{name:'Tertimpa',row_version:1,reason:'versi lama'})).status,409);
  response=await call('/api/owner/rooms','POST',{property_id:property,code:'A2',name:'Kamar B',active_from:'2026-01-01T00:00:00Z',reason:'tujuan pindah'});const room2=(await response.json()).data;
  response=await call('/api/owner/occupancies','POST',{property_id:property,tenant_id:tenant,room_id:room.id,starts_at:'2026-02-01T00:00:00Z',reason:'mulai tinggal'});assert.equal(response.status,201);const occupancy=(await response.json()).data;
  const moveBody={target_room_id:room2.id,effective_at:'2026-03-01T00:00:00Z',row_version:1,reason:'pindah kamar'},moveKey=randomUUID();
  response=await call(`/api/owner/occupancies/${occupancy.id}/move`,'POST',moveBody,moveKey);assert.equal(response.status,200);const moved=(await response.json()).data;assert.equal(moved.previous.ends_at,'2026-03-01T00:00:00.000Z');assert.equal(moved.current.room_id,room2.id);
  assert.deepEqual((await (await call(`/api/owner/occupancies/${occupancy.id}/move`,'POST',moveBody,moveKey)).json()).data,moved);
  const invitationBody={property_id:property,name:'Tenant Undangan',email:`invite-${randomUUID()}@test.invalid`,expires_at:'2099-01-01T00:00:00Z',reason:'uji undangan'},inviteKey=randomUUID();
  response=await call('/api/owner/tenants/invitations','POST',invitationBody,inviteKey);assert.equal(response.status,201);const invitation=(await response.json()).data;assert.ok(invitation.token);
  assert.deepEqual((await (await call('/api/owner/tenants/invitations','POST',invitationBody,inviteKey)).json()).data,invitation);
  const stored=(await db.query('SELECT token_sha256 FROM tenant_invitations WHERE id=$1',[invitation.id])).rows[0];assert.notEqual(stored.token_sha256,invitation.token);
  assert.equal((await db.query('SELECT response_data::text FROM owner_idempotency WHERE owner_id=$1 AND request_key=$2',[owner,inviteKey])).rows[0].response_data.includes(invitation.token),false);
  assert.equal((await db.query('SELECT count(*)::int n FROM audit_logs WHERE property_id=$1',[property])).rows[0].n,8);
  response=await call('/api/owner/rfid-cards','POST',{property_id:property,tenant_id:tenant,uid:'A1B2C3D4',label:'Uji kartu',registered_at:'2026-03-02T00:00:00Z',reason:'uji kartu'});assert.equal(response.status,201);const card=(await response.json()).data;
  const replaceBody={property_id:property,uid:'B1B2C3D4',label:'Pengganti',effective_at:'2026-04-01T00:00:00Z',row_version:1,reason:'uji ganti'},replaceKey=randomUUID();
  response=await call(`/api/owner/rfid-cards/${card.id}/replace`,'POST',replaceBody,replaceKey);assert.equal(response.status,200);const replaced=(await response.json()).data;
  assert.deepEqual((await (await call(`/api/owner/rfid-cards/${card.id}/replace`,'POST',replaceBody,replaceKey)).json()).data,replaced);
  assert.equal((await db.query('SELECT count(*)::int n FROM rfid_cards WHERE user_id=$1 AND source=$2',[tenant,'manual'])).rows[0].n,2);
  response=await call('/api/owner/devices','POST',{property_id:property,device_uid:`device-${randomUUID()}`,display_name:'Uji device',reason:'uji'});assert.equal(response.status,201);const device=(await response.json()).data;
  response=await call('/api/owner/meter-assets','POST',{property_id:property,label:'Uji meter',reason:'uji'});assert.equal(response.status,201);const asset=(await response.json()).data;
  response=await call('/api/owner/meter-installations','POST',{meter_asset_id:asset.id,device_id:device.id,kind:'room',room_id:room2.id,channel_no:1,installed_at:'2026-02-01T00:00:00Z',reason:'uji pasang'});assert.equal(response.status,201);const meter=(await response.json()).data;
  const meterMoveBody={device_id:device.id,kind:'room',room_id:room.id,channel_no:2,effective_at:'2026-03-01T00:00:00Z',row_version:1,reason:'uji pindah'},meterMoveKey=randomUUID();
  response=await call(`/api/owner/meter-installations/${meter.id}/move`,'POST',meterMoveBody,meterMoveKey);assert.equal(response.status,200);const meterMoved=(await response.json()).data;
  assert.deepEqual((await (await call(`/api/owner/meter-installations/${meter.id}/move`,'POST',meterMoveBody,meterMoveKey)).json()).data,meterMoved);
  assert.equal((await db.query('SELECT count(*)::int n FROM meters WHERE meter_asset_id=$1',[asset.id])).rows[0].n,2);
  await new Promise(r=>{server.closeAllConnections();server.close(r);});server=null;await startApi();
  assert.equal((await (await call('/api/owner/rooms','POST',createRoom,createKey)).json()).data.id,room.id);
  assert.deepEqual((await (await call('/api/owner/tenants/invitations','POST',invitationBody,inviteKey)).json()).data,invitation);
  async function guardedDelete(sql,args){await db.query('SAVEPOINT delete_guard');try{await db.query(sql,args);assert.fail('delete seharusnya ditolak');}catch(e){assert.equal(e.code,'P0001');await db.query('ROLLBACK TO SAVEPOINT delete_guard');}await db.query('RELEASE SAVEPOINT delete_guard');}
  await guardedDelete('DELETE FROM audit_logs WHERE property_id=$1',[property]);
  await guardedDelete('DELETE FROM rooms WHERE id=$1',[room.id]);
  acting={id:other,role:'owner'};assert.deepEqual((await (await call('/api/owner/rooms')).json()).data,[]);const otherProperties=(await (await call('/api/owner/properties')).json()).data;assert.equal(otherProperties.length,1);assert.equal(otherProperties[0].id,property2);assert.equal((await call(`/api/owner/properties/${property}`,'PATCH',{name:'Bocor',row_version:2,reason:'uji'})).status,404);assert.equal((await call(`/api/owner/rooms/${room.id}`,'PATCH',{name:'Bocor',row_version:2,reason:'uji'})).status,404);
  acting={id:tenant,role:'tenant'};assert.equal((await call('/api/owner/rooms')).status,403);assert.equal((await call('/api/owner/properties')).status,403);
 }finally{if(server)await new Promise(r=>{server.closeAllConnections();server.close(r);});await db.query('ROLLBACK');db.release();await real.end();}
});

test('PostgreSQL master: request paralel dengan key sama tidak menjalankan mutasi kedua',{
 skip:process.env.INTEGRATION_DB!=='1',
},async()=>{
 requireDevelopment();const pool=createPool({timeout:10000}),blocker=await pool.connect();let server;
 const owner='00000000-0000-4000-8000-000000000001',room='00000000-0000-4000-8000-000000000003',key=randomUUID();
 try{
  await blocker.query('BEGIN');await blocker.query('SELECT 1 FROM rooms WHERE id=$1 FOR UPDATE',[room]);
  const app=express();app.use((req,_res,next)=>{req.user={id:owner,role:'owner'};next();});app.use('/api',masterApi(pool,{csrf:(_q,_s,n)=>n(),idempotencySecret:'test-secret-long-enough-for-hmac-0123456789'}));app.use(apiError);
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${server.address().port}/api/owner/rooms/${room}`,body=JSON.stringify({name:'Tidak berubah',row_version:1,reason:'uji paralel'}),headers={'content-type':'application/json','idempotency-key':key};
  const first=fetch(url,{method:'PATCH',headers,body});
  await new Promise(r=>setTimeout(r,150));
  const second=await Promise.race([fetch(url,{method:'PATCH',headers,body}),new Promise((_r,reject)=>setTimeout(()=>reject(new Error('retry paralel tertahan')),2000))]);
  assert.equal(second.status,409);assert.equal((await second.json()).error,'idempotency_in_progress');
  await blocker.query('ROLLBACK');assert.equal((await first).status,409);
  assert.equal((await pool.query('SELECT count(*)::int n FROM owner_idempotency WHERE owner_id=$1 AND request_key=$2',[owner,key])).rows[0].n,0);
 }finally{await blocker.query('ROLLBACK').catch(()=>{});blocker.release();if(server)await new Promise(r=>{server.closeAllConnections();server.close(r);});await pool.end();}
});
