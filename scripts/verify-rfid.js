import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPool,createMqtt,requireDevelopment} from '../src/connections.js';
import {connect,publish,waitFor} from '../src/simulation.js';
import {sha256} from '../src/sensor-message.js';
import {receiveTap} from '../src/rfid-ingest.js';
import {demoRfid as d} from '../src/rfid-demo.js';
import {authenticatedFetch} from './auth-client.js';
requireDevelopment();const pool=createPool();let mqtt;
try {
 const fingerprint=async(table,where='')=>(await pool.query(`SELECT count(*)::int AS count,md5(string_agg(row_to_json(r)::text,'' ORDER BY ${table==='dev_checks.running_simulator'?'meter_id':'id'})) AS fingerprint FROM ${table} r ${where}`)).rows[0];
 const snapshot=async()=>({sessions:await fingerprint('usage_sessions'),events:await fingerprint('device_events'),readings:await fingerprint('meter_readings'),existing:await fingerprint('meter_readings',`WHERE meter_id <> '${d.meter}'`)});
 if(process.argv[2]==='snapshot'){console.info(JSON.stringify(await snapshot()));}
 else {
  const state=(await pool.query('SELECT checkpoint FROM dev_checks.rfid_simulator WHERE device_id=$1',[d.device])).rows[0]?.checkpoint;
  assert.ok(state?.lastEvent,'Jalankan simulator terlebih dahulu');assert.equal(state.pending,null);
  await waitFor(async()=>(await pool.query("SELECT 1 FROM usage_sessions WHERE communal_load_id=$1 AND energy_status='valid'",[d.facility])).rowCount>0);
  const before=await snapshot(),topic=`smartbilling/sim/v1/devices/${d.deviceUid}/rfid/taps`,bytes=Buffer.from(JSON.stringify(state.lastEvent));
  // Real concurrent transactions verify that separate consumers cannot toggle a duplicate.
  await Promise.all(Array.from({length:5},()=>receiveTap(pool,topic,bytes,{qos:1})));
  mqtt=createMqtt(`rfid-verify-${randomUUID()}`);await connect(mqtt);
  await publish(mqtt,topic,bytes);
  async function reject(payload,reason,t=topic,qos=1){const hash=sha256(payload),query='SELECT count(*)::int AS n FROM mqtt_rejections WHERE reason=$1 AND payload_sha256=$2';const args=[`rfid_${reason}`,hash],n=(await pool.query(query,args)).rows[0].n;await mqtt.publishAsync(t,payload,{qos,retain:false});await waitFor(async()=>(await pool.query(query,args)).rows[0].n>n);}
  await reject(JSON.stringify({...state.lastEvent,card_uid:'FFFFFFFF'}),'identity_conflict');
  await reject('{invalid','invalid_json');await reject(bytes,'invalid_qos',topic,0);
  await reject(bytes,'unknown_or_inactive_device','smartbilling/sim/v1/devices/not-provisioned-rfid/rfid/taps');
  assert.deepEqual(await snapshot(),before,'Pesan duplikat/invalid/konflik mengubah data');
  const request=await authenticatedFetch(),range='from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z';
  const response=await request(`/api/usage-sessions?${range}&facility_id=${d.facility}&limit=1`);assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.data.length,1);assert.equal(body.data[0].energy_status,'valid');assert.equal(JSON.stringify(body).includes('card_uid'),false);
  assert.equal((await request(`/api/meters/${d.meter}/latest`)).status,200);
  assert.equal((await request('/health/ready')).status,200);
  console.info('PASS RFID MQTT: duplicate, invalid, identity conflict, unknown device, concurrent replay; data unchanged; owner API available.');
  console.info(JSON.stringify(await snapshot()));
 }
}catch(e){console.error('FAIL RFID verification:',e.code||e.message);process.exitCode=1;}
finally{if(mqtt)await mqtt.endAsync(true);await pool.end();}
