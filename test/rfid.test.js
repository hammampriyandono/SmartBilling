import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {parseTap} from '../src/rfid-message.js';
import {sessionEnergy} from '../src/rfid-energy.js';
import {receiveTap,createRfidWorker} from '../src/rfid-ingest.js';
import {rfidApi} from '../src/rfid-api.js';
import {apiError} from '../src/monitoring-api.js';
import {createPool,requireDevelopment} from '../src/connections.js';
import {sha256} from '../src/sensor-message.js';
import {rfidReadiness} from '../src/rfid-readiness.js';

const topic='smartbilling/sim/v1/devices/rfid-test/rfid/taps';
const payload=()=>({schema_version:1,boot_id:randomUUID(),sequence_no:0,previous_event:null,reader_channel:0,card_uid:'AABBCCDD',occurred_at:'2026-09-16T00:00:00.000Z'});
test('RFID: schema ketat, identitas predecessor, QoS dan retained',()=>{
 const p=payload(),parse=(v,packet={qos:1})=>parseTap(topic,Buffer.from(JSON.stringify(v)),packet);
 assert.equal(parse(p).payload.card_uid,p.card_uid);
 for(const v of [{...p,energy:1},{...p,card_uid:'aa'},{...p,sequence_no:1},{...p,occurred_at:'2026-02-30T00:00:00Z'},{...p,previous_event:{boot_id:p.boot_id,sequence_no:0}}])assert.throws(()=>parse(v));
 assert.throws(()=>parse(p,{qos:0}));assert.throws(()=>parse(p,{qos:1,retain:true}));
 assert.throws(()=>parseTap(topic,Buffer.alloc(4097),{qos:1}));
 assert.throws(()=>parseTap(topic,Buffer.from('{'),{qos:1}));
 assert.equal(parse({...p,sequence_no:1,previous_event:{boot_id:p.boot_id,sequence_no:0}}).payload.sequence_no,1);
 assert.equal(parseTap(topic,Buffer.from(JSON.stringify(p)),{qos:1}).data_source,'simulation');
 const physical=parseTap(topic.replace('/sim/','/'),Buffer.from(JSON.stringify(p)),{qos:1});
 assert.equal(physical.data_source,'production');assert.equal(physical.response_topic,topic.replace('/sim/','/').replace(/taps$/,'responses'));
 assert.throws(()=>parse({uid:p.card_uid}));
 assert.throws(()=>parseTap('rfid/tap',Buffer.from(JSON.stringify(p)),{qos:1}));
});
test('RFID: energi batas tepat, gap/reset/ambigu menghasilkan null',()=>{
 const rows=[0,1,2].map(i=>({id:String(i+1),measured_at:new Date(Date.UTC(2026,8,16,0,i)),quality:'valid',counter_epoch:0,energy_kwh:`1.${String(i*10000000).padStart(9,'0')}`}));
 const calc=r=>sessionEnergy(r,rows[0].measured_at,rows[2].measured_at);
 assert.equal(calc(rows).energy_kwh,'0.020000000');
 assert.equal(calc(rows.slice(1)).energy_kwh,null);
 assert.equal(sessionEnergy([rows[0],{...rows[2],measured_at:new Date(+rows[0].measured_at+121000)}],rows[0].measured_at,new Date(+rows[0].measured_at+121000)).energy_reason,'gap');
 assert.equal(calc([rows[0],{...rows[1],counter_epoch:1},rows[2]]).energy_reason,'counter_reset');
 assert.equal(calc([rows[0],rows[0],rows[2]]).energy_reason,'ambiguous_timestamp');
 assert.equal(calc([rows[0],{...rows[1],energy_kwh:'0.500000000'},rows[2]]).energy_reason,'counter_decreased');
 assert.equal(calc([rows[0],{...rows[1],quality:'invalid'},rows[2]]).energy_reason,'invalid_quality');
});

test('PostgreSQL RFID: urutan, replay, konflik, review, constraint dan scope API', {skip:process.env.INTEGRATION_DB!=='1'},async()=>{
 requireDevelopment();const pool=createPool({timeout:10000}),db=await pool.connect();let server;
 try{
  await db.query('BEGIN');
  // Preserve production-like data: all fixtures roll back; nested ingest transactions use savepoints.
  let n=0,savepoint;
  const adapter={query:(...a)=>db.query(...a),connect:async()=>({release(){},query:async(sql,args)=>{
   if(sql==='BEGIN'){savepoint=`rfid_${++n}`;return db.query(`SAVEPOINT ${savepoint}`);}
   if(sql==='COMMIT'){await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');return db.query(`RELEASE SAVEPOINT ${savepoint}`);}
   if(sql==='ROLLBACK')return db.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
   return db.query(sql,args);
  }})};
  const [owner,other,tenant,tenant2,property,room,device,facility,meter,occ,card,reader]=Array.from({length:12},randomUUID);
  for(const [id,role] of [[owner,'owner'],[other,'owner'],[tenant,'tenant'],[tenant2,'tenant']])await db.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'RFID TEST',$2,'unused',$3)",[id,`${id}@test.invalid`,role]);
  await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'RFID TEST','Asia/Jakarta')",[property,owner]);
  await db.query("INSERT INTO rooms(id,property_id,code,name,active_from) VALUES($1,$2,'RFID','RFID TEST','2026-01-01Z')",[room,property]);
  await db.query("INSERT INTO occupancies(id,user_id,room_id,starts_at) VALUES($1,$2,$3,'2026-01-01Z')",[occ,tenant,room]);
  await db.query("INSERT INTO devices(id,property_id,device_uid,status) VALUES($1,$2,$3,'active')",[device,property,device]);
  await db.query("INSERT INTO communal_loads(id,property_id,name,load_type) VALUES($1,$2,'RFID TEST','attributable')",[facility,property]);
  await db.query("INSERT INTO meters(id,property_id,device_id,communal_load_id,kind,channel_no,installed_at) VALUES($1,$2,$3,$4,'communal',0,'2026-01-01Z')",[meter,property,device,facility]);
  await db.query("INSERT INTO rfid_readers(id,property_id,device_id,reader_channel,communal_load_id,active_from) VALUES($1,$2,$3,0,$4,'2026-01-01Z')",[reader,property,device,facility]);
  const uid=randomUUID().replaceAll('-','').slice(0,8).toUpperCase();
  await db.query("INSERT INTO rfid_cards(id,user_id,uid,label,registered_at) VALUES($1,$2,$3,'RFID TEST','2026-01-01Z')",[card,tenant,uid]);
  await db.query('INSERT INTO rfid_stream_state(device_id) VALUES($1)',[device]);
  const base={...payload(),card_uid:uid},t=`smartbilling/v1/devices/${device}/rfid/taps`;
  const event=i=>({...base,sequence_no:i,previous_event:i?{boot_id:base.boot_id,sequence_no:i-1}:null,occurred_at:new Date(Date.parse(base.occurred_at)+i*60000).toISOString()});
  const send=p=>receiveTap(adapter,t,Buffer.from(JSON.stringify(p)),{qos:1});
  const sessions=async()=>(await db.query('SELECT * FROM usage_sessions WHERE communal_load_id=$1 ORDER BY started_at',[facility])).rows;
  const waiting=await send(event(1));assert.equal(waiting.response.status,'pending');assert.equal(waiting.response.consumed,false);assert.equal((await sessions()).length,0);
  let connects=0;
  const interrupted={...adapter,connect:async()=>{if(++connects===2)throw new Error('test interruption after inbox');return adapter.connect();}};
  await assert.rejects(()=>receiveTap(interrupted,t,Buffer.from(JSON.stringify(event(0))),{qos:1}),/test interruption/);
  assert.equal((await sessions()).length,0);
  await createRfidWorker(adapter)();let s=await sessions();assert.equal(s.length,1);assert.equal(s[0].status,'completed');assert.equal(s[0].energy_kwh,null);
  const replay=await send(event(1));assert.equal(replay.response.action,'closed');assert.equal(replay.response.status,'processed');
  assert.equal(replay.response.request_sha256,sha256(JSON.stringify(event(1))));assert.equal(JSON.stringify(replay.response).includes(uid),false);
  assert.deepEqual((await send(event(1))).response,replay.response);
  const conflict=await send({...event(1),card_uid:'FFFFFFFF'});assert.equal(conflict.response.status,'conflict');assert.equal(conflict.response.consumed,false);assert.equal(conflict.response.action,null);assert.equal((await sessions()).length,1);
  assert.equal((await sessions())[0].data_source,'production');
  assert.equal((await db.query("SELECT count(*) FROM mqtt_rejections WHERE reason='rfid_identity_conflict'")).rows[0].count>0,true);
  await send(event(2));s=await sessions();assert.equal(s.length,2);assert.equal(s[1].ended_at,null);
  const otherUid=randomUUID().replaceAll('-','').slice(0,8).toUpperCase();
  await db.query("INSERT INTO occupancies(id,user_id,room_id,starts_at) VALUES($1,$2,$3,'2026-01-01Z')",[randomUUID(),tenant2,room]);
  await db.query("INSERT INTO rfid_cards(id,user_id,uid,label,registered_at) VALUES($1,$2,$3,'RFID TEST','2026-01-01Z')",[randomUUID(),tenant2,otherUid]);
  await send({...event(3),card_uid:otherUid});assert.equal((await sessions())[1].status,'active');
  assert.equal((await db.query('SELECT reason FROM device_events WHERE device_id=$1 AND sequence_no=3',[device])).rows[0].reason,'facility_busy');
  await send({...event(4),card_uid:'FFFFFFFF'});assert.equal((await sessions())[1].status,'active');
  await db.query("UPDATE occupancies SET ends_at='2026-09-16T00:05:00Z' WHERE id=$1",[occ]);
  await send(event(5));assert.equal((await sessions())[1].ended_at,null);assert.equal((await sessions())[1].status,'review');
  const branch={...base,boot_id:randomUUID(),previous_event:{boot_id:base.boot_id,sequence_no:0}};
  await send(branch);assert.equal((await db.query('SELECT reason FROM device_events WHERE device_id=$1 AND boot_id=$2',[device,branch.boot_id])).rows[0].reason,'chain_branch');
  const worker=createRfidWorker(adapter);await worker();assert.equal((await sessions())[1].ended_at,null);
  const readiness=await rfidReadiness(db,{ownerId:owner,deviceUid:device,at:base.occurred_at});assert.equal(readiness.ready,true);assert.equal(readiness.readers[0].meter_installation_id,meter);
  assert.equal(await rfidReadiness(db,{ownerId:other,deviceUid:device}),null);
  const simulationDevice=randomUUID();await db.query("INSERT INTO devices(id,property_id,device_uid,status,source) VALUES($1,$2,$3,'active','simulation')",[simulationDevice,property,simulationDevice]);
  const simulatedTopic=`smartbilling/sim/v1/devices/${simulationDevice}/rfid/taps`,sample=Buffer.from(JSON.stringify(payload()));
  const mismatch=await receiveTap(adapter,simulatedTopic.replace('/sim/','/'),sample,{qos:1});assert.equal(mismatch.response.reason,'source_mismatch');assert.equal(mismatch.response.consumed,false);
  assert.equal((await db.query('SELECT count(*) FROM device_events WHERE device_id=$1',[simulationDevice])).rows[0].count,'0');
  const simulated=await receiveTap(adapter,simulatedTopic,sample,{qos:1});assert.equal(simulated.response.reason,'unknown_reader');
  assert.equal((await db.query('SELECT data_source FROM device_events WHERE device_id=$1',[simulationDevice])).rows[0].data_source,'simulation');
  const mixedStream=await receiveTap(adapter,t.replace('/v1/','/sim/v1/'),Buffer.from(JSON.stringify(event(0))),{qos:1});assert.equal(mixedStream.response.reason,'source_mismatch');
  const realDevice=randomUUID(),simFacility=randomUUID();
  await db.query("INSERT INTO devices(id,property_id,device_uid,status) VALUES($1,$2,$3,'active')",[realDevice,property,realDevice]);
  await db.query("INSERT INTO communal_loads(id,property_id,name,load_type,source) VALUES($1,$2,'Simulated context','attributable','simulation')",[simFacility,property]);
  await db.query("INSERT INTO meters(id,property_id,device_id,communal_load_id,kind,channel_no,installed_at) VALUES($1,$2,$3,$4,'communal',0,'2026-01-01Z')",[randomUUID(),property,realDevice,simFacility]);
  await db.query("INSERT INTO rfid_readers(id,property_id,device_id,communal_load_id,reader_channel,active_from) VALUES($1,$2,$3,$4,0,'2026-01-01Z')",[randomUUID(),property,realDevice,simFacility]);
  const realTopic=`smartbilling/v1/devices/${realDevice}/rfid/taps`,physical={...payload(),card_uid:otherUid};
  const mixed=await receiveTap(adapter,realTopic,Buffer.from(JSON.stringify(physical)),{qos:1});assert.equal(mixed.response.reason,'simulation_context');assert.equal(mixed.response.consumed,true);
  assert.equal((await db.query('SELECT count(*) FROM usage_sessions WHERE communal_load_id=$1',[simFacility])).rows[0].count,'0');
  const badChannel={...physical,sequence_no:1,previous_event:{boot_id:physical.boot_id,sequence_no:0},reader_channel:99};
  assert.equal((await receiveTap(adapter,realTopic,Buffer.from(JSON.stringify(badChannel)),{qos:1})).response.reason,'unknown_reader');
  const sensorBoot=randomUUID();
  for(let i=0;i<2;i++)await db.query("INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,quality) VALUES($1,$2,$3,0,$4,$5,'valid')",[meter,sensorBoot,i,event(i).occurred_at,String(10+i)]);
  await worker();assert.equal((await sessions())[0].energy_kwh,'1.000000000');
  await db.query("INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,quality) VALUES($1,$2,0,0,$3,10,'valid')",[meter,randomUUID(),event(0).occurred_at]);
  await worker();assert.equal((await sessions())[0].energy_kwh,null);assert.equal((await sessions())[0].energy_reason,'ambiguous_timestamp');
  await db.query('SAVEPOINT invalid_parent');await assert.rejects(()=>db.query("UPDATE occupancies SET starts_at='2026-09-15Z' WHERE id=$1",[occ]));await db.query('ROLLBACK TO SAVEPOINT invalid_parent');
  for(const [sql,args] of [
   ["UPDATE communal_loads SET load_type='shared' WHERE id=$1",[facility]],
   ['DELETE FROM session_participants WHERE usage_session_id=$1',[s[0].id]],
   ["UPDATE device_events SET payload='{}' WHERE device_id=$1",[device]],
   ["UPDATE meters SET retired_at='2026-09-16T00:00:30Z' WHERE id=$1",[meter]],
  ]){await db.query('SAVEPOINT history_guard');await assert.rejects(()=>db.query(sql,args));await db.query('ROLLBACK TO SAVEPOINT history_guard');}
  const app=express();app.use((req,_res,next)=>{req.user={id:req.headers['x-test-user']};next();});app.use('/api',rfidApi(db));app.use(apiError);
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}`;
  const get=(path,user)=>fetch(url+path,{headers:{'X-Test-User':user}});
  const path='/api/usage-sessions?from=2026-09-15T00:00:00Z&to=2026-09-17T00:00:00Z&limit=1';
  for(const user of [owner,tenant]){const a=await(await get(path,user)).json();assert.equal(a.data.length,1);assert.equal(a.meta.source,'production');assert.equal(a.data[0].data_source,'production');assert.ok(a.next_cursor);const b=await(await get(path+`&cursor=${a.next_cursor}`,user)).json();assert.equal(b.data.length,1);assert.notEqual(a.data[0].id,b.data[0].id);assert.equal(JSON.stringify(a).includes(uid),false);}
  // The observation view filters before the cursor, preserving real pagination and access scope.
  for(const user of [owner,tenant]){const first=await(await get(path+'&data_view=observation',user)).json();assert.equal(first.data.length,1);assert.ok(first.next_cursor);const next=await(await get(path+'&data_view=observation&cursor='+first.next_cursor,user)).json();assert.equal(next.data.length,1);assert.notEqual(next.data[0].id,first.data[0].id);}
  const allFacilities=await(await get('/api/facilities?limit=100',owner)).json(),observedFacilities=await(await get('/api/facilities?limit=100&data_view=observation',owner)).json();
  assert.ok(allFacilities.data.some(f=>f.source==='simulation'));assert.ok(observedFacilities.data.every(f=>f.source!=='simulation'));assert.ok(observedFacilities.data.some(f=>f.id===facility));
  assert.deepEqual((await(await get(path+'&data_view=observation',other)).json()).data,[]);
  for(const user of [other,tenant2]){assert.deepEqual((await(await get(path,user)).json()).data,[]);assert.equal((await get(`/api/usage-sessions/${s[0].id}`,user)).status,404);}
  assert.equal((await get('/api/usage-sessions?from=bad',owner)).status,400);
 }finally{if(server)await new Promise(r=>server.close(r));await db.query('ROLLBACK');db.release();await pool.end();}
});
