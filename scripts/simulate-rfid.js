import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createPool,createMqtt,requireDevelopment} from '../src/connections.js';
import {connect,publish,waitFor} from '../src/simulation.js';
import {demoRfid as d} from '../src/rfid-demo.js';
import {sha256,sameReading,parseSensor} from '../src/sensor-message.js';
import {parseTap} from '../src/rfid-message.js';
requireDevelopment();
const mode=process.argv[2]||'demo';if(!['demo','tap','replay'].includes(mode)||process.argv.length>3)throw new Error('Pemakaian: simulate-rfid.js demo|tap|replay');
const pool=createPool(),db=await pool.connect(),stop=new AbortController(),boot=randomUUID();let mqtt,locked=false,shutdownTimer,state;
const shutdown=()=>{stop.abort();mqtt?.end(true);shutdownTimer??=setTimeout(()=>process.exit(0),8000);};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
const deadline=setTimeout(shutdown,240000);
try {
 locked=(await db.query('SELECT pg_try_advisory_lock(5050302) AS ok')).rows[0].ok;if(!locked)throw new Error('Simulator RFID lain masih berjalan');
 const stream=(await db.query('SELECT * FROM rfid_stream_state WHERE device_id=$1',[d.device])).rows[0];if(!stream)throw new Error('Jalankan provision-rfid terlebih dahulu');
 state=(await db.query('SELECT checkpoint FROM dev_checks.rfid_simulator WHERE device_id=$1',[d.device])).rows[0]?.checkpoint;
 if(!state && (stream.head_event_id || (await db.query('SELECT 1 FROM meter_readings WHERE meter_id=$1 LIMIT 1',[d.meter])).rowCount))throw new Error('Checkpoint hilang; counter/chain tidak direset');
 state??={lastEvent:null,lastReading:null,remainder:'0',pending:null};
 const save=()=>db.query('INSERT INTO dev_checks.rfid_simulator(device_id,checkpoint) VALUES($1,$2) ON CONFLICT(device_id) DO UPDATE SET checkpoint=$2,updated_at=now()',[d.device,state]);
 mqtt=createMqtt(`rfid-simulator-${randomUUID()}`);await connect(mqtt);
 async function sendPending(){if(!state.pending)return;const p=state.pending;
  for(let attempt=0;attempt<3;attempt++){
   stop.signal.throwIfAborted();
   try{await publish(mqtt,p.topic,JSON.stringify(p.payload));await waitFor(async()=>{
    stop.signal.throwIfAborted();
    const table=p.kind==='tap'?'device_events':'meter_readings',field=p.kind==='tap'?'device_id':'meter_id';
    const row=(await db.query(`SELECT * FROM ${table} WHERE ${field}=$1 AND boot_id=$2 AND sequence_no=$3`,[p.kind==='tap'?d.device:d.meter,p.payload.boot_id,p.payload.sequence_no])).rows[0];
    if(!row)return false;
    if(p.kind==='tap' ? row.payload_sha256!==sha256(JSON.stringify(parseTap(p.topic,Buffer.from(JSON.stringify(p.payload)),{qos:1}).payload))
      : !sameReading(row,parseSensor(p.topic,Buffer.from(JSON.stringify(p.payload)),{qos:1}).reading))throw new Error('Isi pesan tersimpan konflik; checkpoint tidak dimajukan');
    if(p.kind==='tap'&&row.processing_status==='waiting_predecessor')return false;
    if(p.kind==='tap'&&row.processing_status!=='processed')throw new Error(`Tap ditolak: ${row.reason}`);
    return true;
   },10000);break;}catch(e){if(attempt===2||stop.signal.aborted)throw e;}
  }
  if(p.kind==='tap')state.lastEvent=p.payload;else state.lastReading=p.payload;
  state.pending=null;await save();console.info(`TERSIMPAN SIMULASI ${p.kind} ${p.payload.occurred_at||p.payload.measured_at}`);
 }
 if(state.pending){await sendPending();console.info('Pending lama direplay; jalankan lagi untuk aksi baru.');}
 else if(mode==='replay'){
  if(!state.lastEvent)throw new Error('Belum ada tap untuk replay');state.pending={kind:'tap',topic:`smartbilling/sim/v1/devices/${d.deviceUid}/rfid/taps`,payload:state.lastEvent};await save();await sendPending();
 }else{
  if(mode==='demo'&&(await db.query('SELECT 1 FROM usage_sessions WHERE communal_load_id=$1 AND ended_at IS NULL',[d.facility])).rowCount)throw new Error('Sesi masih terbuka; gunakan tap untuk menutup, bukan demo baru');
  let tapSeq=0,sensorSeq=0;
  async function tap(time){const previous=state.lastEvent?{boot_id:state.lastEvent.boot_id,sequence_no:state.lastEvent.sequence_no}:null;
   state.pending={kind:'tap',topic:`smartbilling/sim/v1/devices/${d.deviceUid}/rfid/taps`,payload:{schema_version:1,boot_id:boot,sequence_no:tapSeq++,previous_event:previous,reader_channel:0,card_uid:d.uid,occurred_at:time}};await save();await sendPending();}
  async function reading(time,power){let energy=0n,remainder=BigInt(state.remainder);
   if(state.lastReading){const prev=state.lastReading,elapsed=Date.parse(time)-Date.parse(prev.measured_at);if(elapsed<=0)throw new Error('Clock mundur');
    const n=BigInt(prev.power_w)*BigInt(elapsed)*5n+remainder;energy=BigInt(prev.energy_kwh.replace('.',''))+n/18n;remainder=n%18n;}
   state.remainder=String(remainder);state.pending={kind:'reading',topic:`smartbilling/sim/v1/devices/${d.deviceUid}/readings`,payload:{schema_version:1,boot_id:boot,sequence_no:sensorSeq++,channel_no:0,counter_epoch:0,measured_at:time,energy_kwh:`${energy/1000000000n}.${String(energy%1000000000n).padStart(9,'0')}`,power_w:power,voltage_v:220}};await save();await sendPending();}
  if(mode==='tap')await tap(new Date().toISOString());
  else{const start=Date.now();for(let i=0;i<3;i++){if(i)await delay(Math.max(0,start+i*60000-Date.now()),undefined,{signal:stop.signal});stop.signal.throwIfAborted();const time=new Date().toISOString();await reading(time,[600,900,300][i]);if(i===0||i===2)await tap(time);}console.info('Demo selesai: dua tap, tiga pembacaan; energi direkonsiliasi backend.');}
 }
}catch(e){if(!stop.signal.aborted){console.error('Simulator RFID berhenti:',e.code||e.message);process.exitCode=1;}}
finally{clearTimeout(deadline);if(mqtt)await mqtt.endAsync(true).catch(()=>{});if(locked)await db.query('SELECT pg_advisory_unlock(5050302)').catch(()=>{});db.release();await pool.end();clearTimeout(shutdownTimer);console.info('Checkpoint disimpan; tidak ada penutupan sesi otomatis.');}
