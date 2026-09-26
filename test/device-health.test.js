import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {createPool,requireDevelopment} from '../src/connections.js';
import {deviceHealthApi,deviceStatus} from '../src/device-health-api.js';
import {apiError} from '../src/monitoring-api.js';

test('status kesehatan perangkat membedakan online, terlambat, offline, belum pernah, dan review',()=>{
 const now=Date.parse('2026-09-25T10:00:00Z');
 assert.equal(deviceStatus('2026-09-25T09:59:00Z',now,180,900),'online');
 assert.equal(deviceStatus('2026-09-25T09:55:00Z',now,180,900),'delayed');
 assert.equal(deviceStatus('2026-09-25T09:00:00Z',now,180,900),'offline');
 assert.equal(deviceStatus(null,now,180,900),'never_seen');
 assert.equal(deviceStatus('2026-09-25T09:59:00Z',now,180,900,true),'needs_review');
 assert.equal(deviceStatus('2026-09-25T10:01:00Z',now,180,900),'needs_review');
});

test('PostgreSQL kesehatan perangkat: scope, filter, review, audit dan idempotency',{
 skip:process.env.INTEGRATION_DB!=='1',
},async()=>{
 requireDevelopment();const pool=createPool({timeout:10000}),db=await pool.connect();let server,savepoint=0;
 try{
  await db.query('BEGIN');
  const owner=randomUUID(),other=randomUUID(),tenant=randomUUID(),property=randomUUID(),otherProperty=randomUUID();
  const room=randomUUID(),device=randomUUID(),asset=randomUUID(),meter=randomUUID(),boot=randomUUID();
  for(const [id,role] of [[owner,'owner'],[other,'owner'],[tenant,'tenant']])await db.query("INSERT INTO users(id,name,email,password_hash,role,is_active) VALUES($1,'HEALTH TEST',$2,'unused',$3,true)",[id,`${id}@test.invalid`,role]);
  await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'HEALTH','Asia/Jakarta'),($3,$4,'OTHER','Asia/Jakarta')",[property,owner,otherProperty,other]);
  await db.query("INSERT INTO rooms(id,property_id,code,name,active_from) VALUES($1,$2,'H1','Kamar Health',now()-interval '1 day')",[room,property]);
  await db.query("INSERT INTO devices(id,property_id,device_uid,status,display_name) VALUES($1,$2,$3,'active','ESP Health')",[device,property,`health-${device}`]);
  await db.query("INSERT INTO meter_assets(id,property_id,label) VALUES($1,$2,'Meter Health')",[asset,property]);
  await db.query("INSERT INTO meters(id,property_id,device_id,room_id,kind,channel_no,installed_at,meter_asset_id) VALUES($1,$2,$3,$4,'room',1,now()-interval '1 day',$5)",[meter,property,device,room,asset]);
  await db.query("INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,quality) VALUES($1,$2,1,0,now()-interval '10 minutes',10,'valid'),($1,$2,2,0,now()-interval '1 minute',9,'valid')",[meter,boot]);
  const event=(await db.query("INSERT INTO device_quality_events(property_id,device_id,meter_id,reason,occurred_at,details) VALUES($1,$2,$3,'duplicate_sequence',now()-interval '2 minutes','{}') RETURNING id",[property,device,meter])).rows[0];
  const adapter={query:(...args)=>db.query(...args),connect:async()=>{let name;return{release(){},query:async(sql,args)=>{if(sql==='BEGIN'){name=`health_${++savepoint}`;return db.query(`SAVEPOINT ${name}`);}if(sql==='COMMIT')return db.query(`RELEASE SAVEPOINT ${name}`);if(sql==='ROLLBACK')return db.query(`ROLLBACK TO SAVEPOINT ${name}`);return db.query(sql,args);}}}};
  let acting={id:owner,role:'owner'};const app=express();app.use((req,_res,next)=>{req.user=acting;next();});app.use('/api',deviceHealthApi(adapter,{csrf:(_q,_s,next)=>next(),idempotencySecret:'health-test-secret-0123456789012345',onlineSeconds:180,offlineSeconds:900,maxGapSeconds:120}));app.use(apiError);
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  let response=await fetch(`${base}/api/owner/device-health?device_id=${device}&room_id=${room}&alert_status=active`);assert.equal(response.status,200);let body=await response.json();
  assert.equal(body.data.devices.length,1);assert.equal(body.data.devices[0].status,'needs_review');assert.equal(body.data.devices[0].valid_count,2);assert.ok(body.data.alerts.some(x=>x.reason==='counter_decreased'));assert.ok(body.data.alerts.some(x=>x.reason==='duplicate_sequence'));
  response=await fetch(`${base}/api/owner/device-health?device_status=offline`);assert.equal(response.status,200);assert.equal((await response.json()).data.devices.length,0);
  acting={id:tenant,role:'tenant'};assert.equal((await fetch(`${base}/api/owner/device-health`)).status,403);
  acting={id:other,role:'owner'};response=await fetch(`${base}/api/owner/device-health`);assert.equal(response.status,200);assert.equal((await response.json()).data.devices.length,0);
  acting={id:owner,role:'owner'};const key=randomUUID(),payload={alert_key:`q:${event.id}`,note:'Sudah ditelusuri pada perangkat.',row_version:0},headers={'content-type':'application/json','idempotency-key':key};
  response=await fetch(`${base}/api/owner/device-health/alerts/review`,{method:'POST',headers,body:JSON.stringify(payload)});assert.equal(response.status,200);const reviewed=(await response.json()).data;
  response=await fetch(`${base}/api/owner/device-health/alerts/review`,{method:'POST',headers,body:JSON.stringify(payload)});assert.equal(response.status,200);assert.deepEqual((await response.json()).data,reviewed);
  assert.equal((await db.query('SELECT count(*)::int n FROM device_quality_events WHERE id=$1',[event.id])).rows[0].n,1);
  assert.equal((await db.query("SELECT count(*)::int n FROM audit_logs WHERE property_id=$1 AND action='review_device_alert'",[property])).rows[0].n,1);
  const conflict={...payload,note:'Isi lain'};assert.equal((await fetch(`${base}/api/owner/device-health/alerts/review`,{method:'POST',headers,body:JSON.stringify(conflict)})).status,409);
  response=await fetch(`${base}/api/owner/device-health?alert_status=reviewed`);body=await response.json();assert.equal(body.data.alerts.filter(x=>x.alert_key===`q:${event.id}`).length,1);
 }finally{if(server)await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});await db.query('ROLLBACK');db.release();await pool.end();}
});
