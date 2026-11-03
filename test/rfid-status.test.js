import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {parseRfidStatus,receiveRfidStatus,rfidConnection,rfidDiagnosticsApi} from '../src/rfid-status.js';
import {receiveTap} from '../src/rfid-ingest.js';
import {createPool} from '../src/connections.js';
import {apiError} from '../src/monitoring-api.js';
const topic='smartbilling/v1/devices/rfid-check/rfid/status';
const status=()=>({schema_version:1,boot_id:randomUUID(),connected:true,reader_state:'unavailable',ntp_synced:true,pending_tap:false,uptime_ms:10});
const wire=p=>Buffer.from(JSON.stringify(p));
test('RFID status: strict payload, real device namespace, QoS1; no UID or secret fields',()=>{
 const p=status();assert.equal(parseRfidStatus(topic,wire(p),{qos:1}).device_uid,'rfid-check');
 for(const bad of [{...p,card_uid:'AABBCCDD'},{...p,connected:1},{...p,reader_state:'working'},{...p,boot_id:'bad'},{...p,uptime_ms:-1},[],null])assert.throws(()=>parseRfidStatus(topic,wire(bad),{qos:1}));
 assert.throws(()=>parseRfidStatus(topic,wire(p),{qos:0}));
 assert.throws(()=>parseRfidStatus(topic.replace('/v1/','/sim/v1/'),wire(p),{qos:1}));
});
test('RFID status: retained online cannot refresh liveness; absent/stale/offline remain explicit',async()=>{
 const pool={query(){throw new Error('must not write');}};
 assert.equal((await receiveRfidStatus(pool,topic,wire(status()),{qos:1,retain:true})).status,'ignored');
 const now=Date.now();assert.equal(rfidConnection({},now),'never_seen');
 assert.equal(rfidConnection({received_at:new Date(now-1000),connected:true},now),'online');
 assert.equal(rfidConnection({received_at:new Date(now-46000),connected:true},now),'offline');
 assert.equal(rfidConnection({received_at:new Date(now),connected:false},now),'offline');
});
test('PostgreSQL RFID commissioning: ESP without reader, unregistered tap, dedup and owner isolation',{
 skip:process.env.INTEGRATION_DB!=='1',
},async()=>{
 const pool=createPool(),db=await pool.connect();let server;
 try{
  await db.query('BEGIN');const owner=randomUUID(),other=randomUUID(),pid=randomUUID(),did=randomUUID(),uid=`rfid-${did}`;
  for(const id of [owner,other])await db.query("INSERT INTO users(id,name,email,password_hash,role,is_active) VALUES($1,'RFID TEST',$2,'unused','owner',true)",[id,`${id}@test.invalid`]);
  await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'RFID TEST','Asia/Jakarta')",[pid,owner]);
  await db.query("INSERT INTO devices(id,property_id,device_uid,status,source) VALUES($1,$2,$3,'active','manual')",[did,pid,uid]);
  const st=topic.replace('rfid-check',uid),p=status();
  assert.equal((await receiveRfidStatus(db,st,wire(p),{qos:1})).status,'stored');
  assert.equal((await receiveRfidStatus(db,topic,wire(p),{qos:1})).status,'rejected');
  let savepoint=0;
  const adapter={query:(...a)=>db.query(...a),connect:async()=>{const name=`rfid_status_${++savepoint}`;return{release(){},query:(sql,args)=>db.query(sql==='BEGIN'?`SAVEPOINT ${name}`:sql==='COMMIT'?`RELEASE SAVEPOINT ${name}`:sql==='ROLLBACK'?`ROLLBACK TO SAVEPOINT ${name}`:sql,args)};}};
  const tap={schema_version:1,boot_id:p.boot_id,sequence_no:0,previous_event:null,reader_channel:0,card_uid:'AABBCCDD',occurred_at:new Date(Date.now()-1000).toISOString()};
  for(let i=0;i<2;i++)assert.equal((await receiveTap(adapter,st.replace('/status','/taps'),wire(tap),{qos:1})).response.reason,'unknown_reader');
  assert.equal((await db.query('SELECT count(*)::int n FROM device_events WHERE device_id=$1',[did])).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM usage_sessions WHERE start_event_id IN (SELECT id FROM device_events WHERE device_id=$1)',[did])).rows[0].n,0);
  let user={id:owner,role:'owner'};const app=express();app.use((req,_res,next)=>{req.user=user;next();});app.use('/api',rfidDiagnosticsApi(db));app.use(apiError);
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api/owner/rfid-devices`;
  let response=await fetch(url),data=(await response.json()).data;assert.equal(response.status,200);assert.equal(data.length,1);assert.equal(data[0].reader_state,'unavailable');assert.equal(data[0].connection,'online');assert.equal(data[0].last_card_uid,tap.card_uid);assert.equal(data[0].card_registered,false);
  user={id:other,role:'owner'};assert.deepEqual((await(await fetch(url)).json()).data,[]);
  user={id:owner,role:'tenant'};assert.equal((await fetch(url)).status,403);
  user=null;assert.equal((await fetch(url)).status,401);
  await receiveRfidStatus(db,st,wire({...p,connected:false,reader_state:'unknown'}),{qos:1,retain:true});
  await receiveRfidStatus(db,st,wire(p),{qos:1,retain:true});
  assert.equal((await db.query('SELECT connected FROM rfid_device_status WHERE device_id=$1',[did])).rows[0].connected,false);
  await assert.rejects(()=>db.query("UPDATE rfid_device_status SET reader_state='made_up' WHERE device_id=$1",[did]),{code:'23514'});
 }finally{
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  await db.query('ROLLBACK');db.release();await pool.end();
 }
});
