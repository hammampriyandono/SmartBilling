import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {projectTenantEstimate} from '../src/tenant-billing-estimate.js';
import {billingApi} from '../src/billing-api.js';
import {apiError} from '../src/monitoring-api.js';
import {createPool,requireDevelopment} from '../src/connections.js';

test('tenant estimate: allowlist hanya bagian sendiri, bukan total kamar/properti atau identitas penghuni lain',()=>{
 const period={id:'period',starts_at:'2026-01-01Z',ends_at:'2026-02-01Z',revision_no:1,timezone:'Asia/Jakarta',property_id:'PRIVATE_PROPERTY',created_by:'PRIVATE_OWNER'};
 const usage={availability:'available',observed_consumption_kwh:'99999',sample_count:99999,cost_estimate:{estimated_cost_rp:'999999'},rooms:[
  {room_id:'own',sample_count:999,allocations:[{kind:'tenant',occupancy_id:'own-occupancy',tenant_id:'me',tenant_name:'Me',energy_kwh:'1.2',estimated_cost_rp:'1800'},
   {kind:'tenant',occupancy_id:'PRIVATE_OCCUPANCY',tenant_id:'PRIVATE_TENANT',tenant_name:'PRIVATE_NAME',energy_kwh:'88',estimated_cost_rp:'999999'}]},
  {room_id:'PRIVATE_ROOM',allocations:[{kind:'tenant',occupancy_id:'PRIVATE_OTHER',energy_kwh:'999',estimated_cost_rp:'999999'}]}
 ]};
 const result=projectTenantEstimate(period,usage,[{id:'own-occupancy',room_id:'own',room_name:'Kamar Saya'}],[{room_id:'own',sample_count:2,last_measured_at:'2026-01-02Z',data_source:'production'}]);
 assert.equal(result.estimated_cost_rp,'1800');assert.equal(result.energy_kwh,'1.200000000');assert.equal(result.sample_count,2);
 assert.ok(!JSON.stringify(result).includes('PRIVATE_'));assert.equal(result.rooms.length,1);assert.equal(Object.hasOwn(result,'cost_estimate'),false);
 const empty=projectTenantEstimate(period,{availability:'unavailable',rooms:[]},[{id:'own-occupancy',room_id:'own'}],[]);
 assert.equal(empty.estimated_cost_rp,null);assert.equal(empty.energy_kwh,null);assert.equal(empty.rooms[0].reason,'insufficient_readings');
});

test('PostgreSQL tenant live estimate: scope masa tinggal/kamar, kesamaan owner, pembaruan dan finalisasi',{
 skip:process.env.INTEGRATION_DB!=='1',
},async()=>{
 requireDevelopment();const pool=createPool({timeout:15000}),db=await pool.connect();let server;
 try{
  await db.query('BEGIN');
  const owner=randomUUID(),tenant=randomUUID(),neighbor=randomUUID(),otherRoomTenant=randomUUID(),foreignOwner=randomUUID();
  const property=randomUUID(),foreignProperty=randomUUID(),room=randomUUID(),otherRoom=randomUUID(),device=randomUUID(),meter=randomUUID(),otherMeter=randomUUID(),period=randomUUID(),foreignPeriod=randomUUID();
  const ownOccupancy=randomUUID(),boot=randomUUID();
  for(const [id,role,name] of [[owner,'owner','Owner'],[tenant,'tenant','Own tenant'],[neighbor,'tenant','PRIVATE_NEIGHBOR'],[otherRoomTenant,'tenant','PRIVATE_OTHER_TENANT'],[foreignOwner,'owner','PRIVATE_OWNER']])await db.query("INSERT INTO users(id,name,email,password_hash,role,is_active) VALUES($1,$2,$3,'unused',$4,true)",[id,name,`${id}@estimate.invalid`,role]);
  for(const [id,who] of [[property,owner],[foreignProperty,foreignOwner]])await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'Estimate fixture','Asia/Jakarta')",[id,who]);
  for(const [id,code,name] of [[room,'E1','Own room'],[otherRoom,'E2','PRIVATE_OTHER_ROOM']])await db.query("INSERT INTO rooms(id,property_id,code,name,active_from,source) VALUES($1,$2,$3,$4,'2026-01-01Z','manual')",[id,property,code,name]);
  for(const id of [tenant,neighbor,otherRoomTenant])await db.query("INSERT INTO property_tenants(id,property_id,user_id,status) VALUES($1,$2,$3,'active')",[randomUUID(),property,id]);
  const at=minute=>`2026-01-01T00:${String(minute).padStart(2,'0')}:00Z`;
  for(const [id,user,target,start,end] of [[randomUUID(),neighbor,room,at(0),at(2)],[ownOccupancy,tenant,room,at(2),at(4)],[randomUUID(),neighbor,room,at(4),null],[randomUUID(),otherRoomTenant,otherRoom,at(0),null]])await db.query("INSERT INTO occupancies(id,user_id,room_id,starts_at,ends_at,source) VALUES($1,$2,$3,$4,$5,'manual')",[id,user,target,start,end]);
  await db.query("INSERT INTO devices(id,property_id,device_uid,status,source) VALUES($1,$2,$3,'active','manual')",[device,property,`tenant-estimate-${device}`]);
  for(const [id,target,channel] of [[meter,room,1],[otherMeter,otherRoom,2]]){const asset=randomUUID();await db.query("INSERT INTO meter_assets(id,property_id,label,source) VALUES($1,$2,'Fixture','manual')",[asset,property]);await db.query("INSERT INTO meters(id,property_id,meter_asset_id,device_id,room_id,kind,channel_no,installed_at,source) VALUES($1,$2,$3,$4,$5,'room',$6,'2026-01-01Z','manual')",[id,property,asset,device,target,channel]);}
  for(let minute=0;minute<4;minute++)await db.query("INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,quality,data_source) VALUES($1,$2,$3,0,$4,$5,'valid','production')",[meter,boot,minute,at(minute),`100.${minute}`]);
  for(let minute=0;minute<2;minute++)await db.query("INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,quality,data_source) VALUES($1,$2,$3,0,$4,$5,'valid','production')",[otherMeter,randomUUID(),minute,at(minute),String(900+minute*50)]);
  for(const [id,target,who] of [[period,property,owner],[foreignPeriod,foreignProperty,foreignOwner]])await db.query("INSERT INTO billing_periods(id,property_id,starts_at,ends_at,revision_no,revision_kind,source,calculation_version,policy_snapshot,created_by) VALUES($1,$2,$3,$4,1,'initial','production','fixture','{}',$5)",[id,target,at(0),at(10),who]);
  const futurePeriod=randomUUID();await db.query("INSERT INTO occupancies(id,user_id,room_id,starts_at,source) VALUES($1,$2,$3,'2028-01-01Z','manual')",[randomUUID(),tenant,room]);
  await db.query("INSERT INTO billing_periods(id,property_id,starts_at,ends_at,revision_no,revision_kind,source,calculation_version,policy_snapshot,created_by) VALUES($1,$2,'2028-01-01Z','2028-02-01Z',1,'initial','production','fixture','{}',$3)",[futurePeriod,property,owner]);
  await db.query("INSERT INTO tariff_schedules(id,property_id,valid_from,energy_rate_rp_kwh,source_reference,source,created_by) VALUES($1,$2,$3,'1500','Fixture','manual',$4)",[randomUUID(),property,at(0),owner]);
  const snapshot=(await db.query('SELECT id,status,row_version,total_cost_rp FROM billing_periods ORDER BY id')).rows;
  let acting={id:tenant,role:'tenant'};const app=express();app.use((req,_res,next)=>{req.user=acting;next();});app.use('/api',billingApi({query:(...args)=>db.query(...args)},{csrf:(_r,_s,next)=>next(),idempotencySecret:'test'}));app.use(apiError);
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const request=path=>fetch(base+'/api'+path),read=async path=>{const response=await request(path);assert.equal(response.status,200);return(await response.json()).data;};
  const list=await read('/billing-estimates?data_view=observation');assert.equal(list.length,1);assert.equal(list[0].id,period);assert.equal(Object.hasOwn(list[0],'property_id'),false);
  let estimate=await read(`/billing-estimates/${period}?data_view=observation`);assert.equal(estimate.estimated_cost_rp,'150');assert.equal(estimate.sample_count,2);assert.equal(estimate.last_measured_at,new Date(at(3)).toISOString());
  assert.ok(!JSON.stringify(estimate).includes('PRIVATE_'));assert.ok(!JSON.stringify(estimate).includes(otherRoom));
  assert.equal((await request(`/billing-estimates/${foreignPeriod}`)).status,404);assert.equal((await request(`/billing-estimates/${period}?user_id=${neighbor}`)).status,400);assert.equal((await request(`/owner/billing-periods/${period}/observed-usage`)).status,403);
  assert.equal((await request(`/billing-estimates/${futurePeriod}`)).status,404,'future occupancy must not open early access');
  for(let minute=4;minute<6;minute++)await db.query("INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,quality,data_source) VALUES($1,$2,$3,0,$4,$5,'valid','production')",[meter,boot,minute,at(minute),`100.${minute}`]);
  estimate=await read(`/billing-estimates/${period}`);assert.equal(estimate.estimated_cost_rp,'300');assert.equal(estimate.energy_kwh,'0.200000000');assert.equal(estimate.sample_count,2);assert.equal(estimate.last_measured_at,new Date(at(3)).toISOString(),'no last-seen leak after occupancy');
  acting={id:owner,role:'owner'};assert.equal((await request('/billing-estimates')).status,403);const observed=await read(`/owner/billing-periods/${period}/observed-usage`);const ownerPart=observed.rooms.find(row=>row.room_id===room).allocations.find(part=>part.occupancy_id===ownOccupancy);assert.equal(ownerPart.estimated_cost_rp,estimate.estimated_cost_rp);
  acting={id:otherRoomTenant,role:'tenant'};const otherEstimate=await read(`/billing-estimates/${period}`);assert.equal(otherEstimate.rooms.length,1);assert.equal(otherEstimate.rooms[0].room_id,otherRoom);assert.equal(otherEstimate.estimated_cost_rp,'75000');assert.ok(!JSON.stringify(otherEstimate).includes('Own room'));
  assert.deepEqual((await db.query('SELECT id,status,row_version,total_cost_rp FROM billing_periods ORDER BY id')).rows,snapshot,'GET must not alter billing snapshots');
  acting={id:tenant,role:'tenant'};await db.query("UPDATE billing_periods SET status='review' WHERE id=$1",[period]);assert.equal((await read('/billing-estimates')).length,1);
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await db.query('ROLLBACK').catch(()=>{});db.release();await pool.end();}
});
