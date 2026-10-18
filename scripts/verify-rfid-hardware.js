import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPool,createMqtt,requireDevelopment} from '../src/connections.js';
import {connect,waitFor} from '../src/simulation.js';
import {sha256} from '../src/sensor-message.js';
import {rfidReadiness} from '../src/rfid-readiness.js';
// Committed restart fixtures ONLY in compose.rfid-verification.yaml, never live DB.
requireDevelopment();
if(process.env.RFID_ISOLATED_TEST!=='1'||process.env.PGHOST!=='postgres')throw new Error('isolated_verification_required');
const pool=createPool({timeout:10000});let mqtt;
try {
 let fixture;
 if(process.argv[2]==='prepare'){
  assert.equal((await pool.query('SELECT count(*) FROM users')).rows[0].count,'0','Refusing fixtures in nonempty database');
  const ids=Array.from({length:14},randomUUID),[owner,tenant,otherTenant,property,room,device,facility,meter,occupancy,otherOcc,card,otherCard,reader,asset]=ids;
  const uid=`rfid-hardware-${randomUUID()}`;
  await pool.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Owner fixture',$4,'unused','owner'),($2,'Tenant fixture',$5,'unused','tenant'),($3,'Other fixture',$6,'unused','tenant')",[owner,tenant,otherTenant,`${owner}@test.invalid`,`${tenant}@test.invalid`,`${otherTenant}@test.invalid`]);
  await pool.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'RFID hardware software fixture','Asia/Jakarta')",[property,owner]);
  await pool.query("INSERT INTO rooms(id,property_id,code,name,active_from) VALUES($1,$2,'HW','RFID hardware fixture','2026-01-01Z')",[room,property]);
  await pool.query("INSERT INTO occupancies(id,user_id,room_id,starts_at) VALUES($1,$2,$5,'2026-01-01Z'),($3,$4,$5,'2026-01-01Z')",[occupancy,tenant,otherOcc,otherTenant,room]);
  await pool.query("INSERT INTO devices(id,property_id,device_uid,status) VALUES($1,$2,$3,'active')",[device,property,uid]);
  await pool.query("INSERT INTO communal_loads(id,property_id,name,load_type) VALUES($1,$2,'RFID hardware fixture','attributable')",[facility,property]);
  await pool.query("INSERT INTO meter_assets(id,property_id,label) VALUES($1,$2,'Hardware meter placeholder')",[asset,property]);
  await pool.query("INSERT INTO meters(id,property_id,device_id,communal_load_id,meter_asset_id,kind,channel_no,installed_at) VALUES($1,$2,$3,$4,$5,'communal',0,'2026-01-01Z')",[meter,property,device,facility,asset]);
  await pool.query("INSERT INTO rfid_readers(id,property_id,device_id,communal_load_id,reader_channel,active_from) VALUES($1,$2,$3,$4,0,'2026-01-01Z')",[reader,property,device,facility]);
  // Random card values in an isolated fixture; never print them.
  const cardUid=randomUUID().replaceAll('-','').slice(0,8).toUpperCase(),otherUid=randomUUID().replaceAll('-','').slice(0,8).toUpperCase();
  await pool.query("INSERT INTO rfid_cards(id,user_id,uid,label,registered_at) VALUES($1,$2,$3,'Hardware fixture','2026-01-01Z'),($4,$5,$6,'Other fixture','2026-01-01Z')",[card,tenant,cardUid,otherCard,otherTenant,otherUid]);
  fixture={device,uid,facility,owner,cardUid,otherUid,boot:randomUUID(),time:Date.now()-600000};
  await pool.query('CREATE TABLE dev_checks.hardware_rfid_verification (checkpoint jsonb NOT NULL)');
  await pool.query('INSERT INTO dev_checks.hardware_rfid_verification VALUES($1)',[fixture]);
 }else fixture=(await pool.query('SELECT checkpoint FROM dev_checks.hardware_rfid_verification')).rows[0].checkpoint;
 const f=fixture,topic=`smartbilling/v1/devices/${f.uid}/rfid/taps`,responseTopic=topic.replace(/taps$/,'responses');
 mqtt=createMqtt(`rfid-hardware-verify-${randomUUID()}`);await connect(mqtt);await mqtt.subscribeAsync(responseTopic,{qos:1});
 const messages=[];mqtt.on('message',(t,bytes,packet)=>{if(t===responseTopic){assert.equal(packet.retain,false);assert.equal(packet.qos,1);messages.push(JSON.parse(bytes));}});
 const event=i=>({schema_version:1,boot_id:f.boot,sequence_no:i,previous_event:i?{boot_id:f.boot,sequence_no:i-1}:null,reader_channel:0,card_uid:f.cardUid,occurred_at:new Date(f.time+i*1000).toISOString()});
 async function send(p,expected){const wire=JSON.stringify(p),hash=sha256(wire),prior=messages.length;await mqtt.publishAsync(topic,wire,{qos:1,retain:false});await waitFor(()=>messages.slice(prior).some(r=>r.request_sha256===hash&&r.status===expected));const r=messages.slice(prior).find(r=>r.request_sha256===hash&&r.status===expected);assert.equal(r.device_uid,f.uid);assert.equal(r.boot_id,p.boot_id);assert.equal(r.sequence_no,p.sequence_no);assert.equal(JSON.stringify(r).includes(p.card_uid),false);return r;}
 const sessions=async()=>(await pool.query('SELECT * FROM usage_sessions WHERE communal_load_id=$1 ORDER BY started_at',[f.facility])).rows;
 if(['prepare','exercise'].includes(process.argv[2])){
  assert.equal((await rfidReadiness(pool,{ownerId:f.owner,deviceUid:f.uid})).ready,true);
  assert.equal(await rfidReadiness(pool,{ownerId:randomUUID(),deviceUid:f.uid}),null);
  const opening=await send(event(0),'processed');assert.equal(opening.action,'opened');assert.equal(opening.consumed,true);
  assert.equal((await sessions())[0].data_source,'production');
  assert.deepEqual(await send(event(0),'processed'),opening);
  await Promise.all([send(event(0),'processed'),send(event(0),'processed')]);assert.equal((await sessions()).length,1);
  const conflicting=await send({...event(0),card_uid:f.otherUid},'conflict');assert.equal(conflicting.consumed,false);assert.equal(conflicting.action,null);
  const foreign=await send({...event(1),card_uid:'FFFFFFFF'},'rejected');assert.equal(foreign.reason,'invalid_card_or_account');assert.equal(foreign.consumed,true);
  const busy=await send({...event(2),card_uid:f.otherUid},'rejected');assert.equal(busy.reason,'facility_busy');assert.equal((await sessions())[0].ended_at,null);
  assert.equal((await send(event(3),'processed')).action,'closed');
  assert.equal((await sessions()).length,1);assert.equal((await sessions())[0].energy_kwh,null);
  const pending=await send(event(5),'pending');assert.equal(pending.consumed,false);
  // Malformed UID-only legacy payload is recorded, not converted into an event.
  await mqtt.publishAsync(topic,JSON.stringify({uid:'FFFFFFFF'}),{qos:1,retain:false});
  await waitFor(async()=>(await pool.query("SELECT 1 FROM mqtt_rejections WHERE reason='rfid_invalid_fields'")).rowCount>0);
  console.info('PASS isolated MQTT: registration, production provenance, open/close, parallel replay, conflict, foreign/busy cards, pending and invalid legacy payload; no energy readings invented.');
 }else{
  const before=(await pool.query('SELECT count(*) FROM device_events')).rows[0].count;
  assert.equal((await send(event(3),'processed')).action,'closed');assert.equal((await pool.query('SELECT count(*) FROM device_events')).rows[0].count,before);
  // Pending survives backend restart; missing predecessor unlocks ordered close.
  assert.equal((await send(event(4),'processed')).action,'opened');
  assert.equal((await send(event(5),'processed')).action,'closed');
  const next={...event(6),boot_id:randomUUID(),sequence_no:0,previous_event:{boot_id:f.boot,sequence_no:5}};
  assert.equal((await send(next,'processed')).action,'opened');
  const s=await sessions();assert.equal(s.length,3);assert.equal(s[1].status,'completed');assert.equal(s[2].status,'active');assert.ok(s.every(x=>x.energy_kwh===null&&x.data_source==='production'));
  console.info('PASS restart: final replay unchanged, durable pending predecessor continues, firmware boot transition preserves stream; 3 sessions, all energy null.');
 }
}catch(e){console.error('FAIL isolated RFID:',e.code||e.message);process.exitCode=1;}
finally{if(mqtt)await mqtt.endAsync(true);await pool.end();}
