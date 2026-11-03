import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPool,requireDevelopment} from '../src/connections.js';
import {meterComparison} from '../src/meter-comparison.js';

test('PostgreSQL perbandingan: scope owner, tiga sampel selaras, presisi dan simulasi terpisah',{
 skip:process.env.INTEGRATION_DB!=='1',
},async()=>{
 requireDevelopment();const pool=createPool(),db=await pool.connect();
 try{
  await db.query('BEGIN');
  const owner=randomUUID(),property=randomUUID(),base=Date.parse('2026-10-30T05:00:00Z');
  await db.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Fixture owner',$2,'fixture-no-login','owner')",[owner,`utc-${owner}@fixture.invalid`]);
  await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'Fixture UTC','Asia/Jakarta')",[property,owner]);
  const meters=[];
  for(let i=0;i<3;i++){
   const room=i?randomUUID():null,device=randomUUID(),asset=randomUUID(),meter=randomUUID(),boot=randomUUID();
   if(room)await db.query("INSERT INTO rooms(id,property_id,code,name,active_from) VALUES($1,$2,$3,$3,'2026-01-01')",[room,property,`KMR-${i}`]);
   await db.query("INSERT INTO devices(id,property_id,device_uid,status) VALUES($1,$2,$3,'active')",[device,property,`utc-${device}`]);
   await db.query("INSERT INTO meter_assets(id,property_id,label) VALUES($1,$2,'Fixture meter')",[asset,property]);
   await db.query("INSERT INTO meters(id,property_id,meter_asset_id,device_id,kind,channel_no,room_id,installed_at) VALUES($1,$2,$3,$4,$5,1,$6,'2026-01-01')",[meter,property,asset,device,i?'room':'main',room]);
   for(let sequence=0;sequence<2;sequence++)await db.query(`INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,power_w,quality,data_source)
    VALUES($1,$2,$3,0,$4,$5,$6,'valid','production')`,[meter,boot,sequence,new Date(base+(sequence-1)*60000+20+i*100).toISOString(),sequence?'99999999999.999999999':'99999999999.999999998',i===0?'10.123456':i===1?'4.000000':'6.123456']);
   meters.push({meter,boot});
  }
  const aligned=await meterComparison(db,{ownerId:owner,propertyId:property,at:new Date(base+5000)});
  const externalDevice=randomUUID(),externalFacility=randomUUID(),externalMeter=randomUUID();
  await db.query("INSERT INTO devices(id,property_id,device_uid,status) VALUES($1,$2,$3,'active')",[externalDevice,property,`external-${externalDevice}`]);
  await db.query("INSERT INTO communal_loads(id,property_id,name,load_type) VALUES($1,$2,'External fixture','attributable')",[externalFacility,property]);
  await db.query("INSERT INTO meters(id,property_id,device_id,kind,channel_no,communal_load_id,installed_at,main_meter_coverage) VALUES($1,$2,$3,'communal',1,$4,'2026-01-01','outside')",[externalMeter,property,externalDevice,externalFacility]);
  assert.equal((await meterComparison(db,{ownerId:owner,propertyId:property,at:new Date(base+5000)})).meters.length,3);
  assert.equal((await db.query('SELECT main_meter_coverage FROM meters WHERE id=$1',[meters[0].meter])).rows[0].main_meter_coverage,'included');
  await db.query('SAVEPOINT coverage_guard');
  await assert.rejects(()=>db.query("UPDATE meters SET main_meter_coverage='included' WHERE id=$1",[externalMeter]),/coverage is immutable/);
  await db.query('ROLLBACK TO SAVEPOINT coverage_guard');
  assert.equal(aligned.status,'aligned');assert.equal(aligned.meters.length,3);assert.equal(aligned.power.difference_w,'0.000000');assert.equal(aligned.energy.main_delta_kwh,'0.000000001');assert.equal(typeof aligned.meters[0].reading.energy_kwh,'string');assert.equal(typeof aligned.meters[0].reading.id,'string');
  assert.equal(await meterComparison(db,{ownerId:randomUUID(),propertyId:property}),null);
  const simulated=randomUUID(),asset=randomUUID(),simRoom=randomUUID();
  await db.query("INSERT INTO rooms(id,property_id,code,name,active_from,source) VALUES($1,$2,'SIM','Simulation','2026-01-01','simulation')",[simRoom,property]);
  await db.query("INSERT INTO devices(id,property_id,device_uid,status,source) VALUES($1,$2,$3,'active','simulation')",[simulated,property,`utc-${simulated}`]);
  await db.query("INSERT INTO meter_assets(id,property_id,label,source) VALUES($1,$2,'Simulation','simulation')",[asset,property]);
  await db.query("INSERT INTO meters(id,property_id,meter_asset_id,device_id,kind,channel_no,room_id,installed_at,source) VALUES($1,$2,$3,$4,'room',1,$5,'2026-01-01','simulation')",[randomUUID(),property,asset,simulated,simRoom]);
  assert.equal((await meterComparison(db,{ownerId:owner,propertyId:property,at:new Date(base+5000)})).meters.length,3);
  await db.query("INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,power_w,quality,data_source) VALUES($1,$2,2,0,$3,'99999999999.999999999',10,'valid','production')",[meters[0].meter,meters[0].boot,new Date(base+300).toISOString()]);
  const ambiguous=await meterComparison(db,{ownerId:owner,propertyId:property,at:new Date(base+5000)});assert.notEqual(ambiguous.round_at,new Date(base).toISOString());
 }finally{await db.query('ROLLBACK');db.release();await pool.end();}
});
