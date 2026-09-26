import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ingestSensor} from '../src/sensor-ingest.js';

const topic='smartbilling/v1/devices/esp32-test/readings',payload=(extra={})=>Buffer.from(JSON.stringify({schema_version:1,boot_id:randomUUID(),sequence_no:1,channel_no:7,counter_epoch:0,measured_at:'2026-09-24T00:00:00Z',energy_kwh:'1.000000000',...extra}));
function database({device=null,existing=[],meters=[],known=false}={}){const rejected=[],quality=[];const db={release(){},async query(sql,args){if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return{rows:[],rowCount:0};if(sql.includes('pg_advisory'))return{rows:[],rowCount:0};if(sql.includes('INSERT INTO mqtt_rejections')){rejected.push(args[0]);return{rows:[],rowCount:1};}if(sql.includes('INSERT INTO device_quality_events')){quality.push(args[3]);return{rows:[],rowCount:1};}if(sql.includes('FROM devices WHERE'))return{rows:device?[{property_id:'p',...device}]:[],rowCount:device?1:0};if(sql.includes('SELECT id FROM meters'))return{rows:meters.length?[{id:meters[0].id}]:[],rowCount:meters.length?1:0};if(sql.includes('FROM meter_readings'))return{rows:existing,rowCount:existing.length};if(sql.includes('SELECT id,source FROM meters'))return{rows:meters,rowCount:meters.length};if(sql.includes('SELECT 1 FROM meters'))return{rows:known?[{}]:[],rowCount:known?1:0};throw new Error(`query tak terduga: ${sql}`);}};return{rejected,quality,pool:{query:(...a)=>db.query(...a),connect:async()=>db}};}
test('ingest memberi reason jelas untuk device, channel, timestamp, dan sequence duplikat',async()=>{
 let f=database();assert.deepEqual(await ingestSensor(f.pool,topic,payload(),{qos:1}),{status:'rejected',reason:'unregistered_device_uid'});assert.deepEqual(f.rejected,['unregistered_device_uid']);
 f=database({device:{id:'d',status:'active'}});assert.equal((await ingestSensor(f.pool,topic,payload(),{qos:1})).reason,'unregistered_channel');
 f=database({device:{id:'d',status:'active'},known:true});assert.equal((await ingestSensor(f.pool,topic,payload(),{qos:1})).reason,'no_installation_at_timestamp');
 f=database();assert.equal((await ingestSensor(f.pool,topic,payload({measured_at:'tanpa-zona'}),{qos:1})).reason,'invalid_timestamp');
 const boot=randomUUID(),bytes=payload({boot_id:boot}),row={boot_id:boot,sequence_no:'1',counter_epoch:0,measured_at:new Date('2026-09-24T00:00:00Z'),energy_kwh:'1.000000000',voltage_v:null,current_a:null,power_w:null,frequency_hz:null,power_factor:null};f=database({device:{id:'d',status:'active'},existing:[row]});assert.deepEqual(await ingestSensor(f.pool,topic,bytes,{qos:1}),{status:'duplicate',reason:'duplicate_sequence'});assert.deepEqual(f.rejected,[]);
});
