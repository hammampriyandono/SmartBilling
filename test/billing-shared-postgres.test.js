import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {createPool,requireDevelopment} from '../src/connections.js';
import {billingApi} from '../src/billing-api.js';
import {apiError} from '../src/monitoring-api.js';
import {sharedRule} from '../src/billing-shared.js';

test('PostgreSQL shared: estimasi, final, pembulatan, scope tenant, guard dan revisi immutable', {skip:process.env.INTEGRATION_DB!=='1'},async()=>{
 requireDevelopment();const pool=createPool({timeout:15000}),db=await pool.connect();let server;
 try{
  await db.query('BEGIN');
  const owner=randomUUID(),foreign=randomUUID(),users=[randomUUID(),randomUUID()],property=randomUUID(),rooms=[randomUUID(),randomUUID()],device=randomUUID(),meters=[randomUUID(),randomUUID(),randomUUID()],occupancies=[randomUUID(),randomUUID()],boot=randomUUID();
  for(const [id,role,name] of [[owner,'owner','Fixture owner'],[foreign,'owner','Foreign owner'],[users[0],'tenant','Own tenant'],[users[1],'tenant','PRIVATE_OTHER_TENANT']])await db.query("INSERT INTO users(id,name,email,password_hash,role,is_active) VALUES($1,$2,$3,'unused',$4,true)",[id,name,`${id}@shared.invalid`,role]);
  await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'Shared fixture','Asia/Jakarta')",[property,owner]);
  for(let j=0;j<2;j++){
   await db.query("INSERT INTO rooms(id,property_id,code,name,active_from,source) VALUES($1,$2,$3,$4,'2026-01-01Z','manual')",[rooms[j],property,`S${j}`,j?'PRIVATE_OTHER_ROOM':'Own room']);
   await db.query("INSERT INTO property_tenants(id,property_id,user_id,status) VALUES($1,$2,$3,'active')",[randomUUID(),property,users[j]]);
   await db.query("INSERT INTO occupancies(id,user_id,room_id,starts_at,source) VALUES($1,$2,$3,'2026-01-01Z','manual')",[occupancies[j],users[j],rooms[j]]);
  }
  await db.query("INSERT INTO devices(id,property_id,device_uid,status,source) VALUES($1,$2,$3,'active','manual')",[device,property,`shared-${device}`]);
  const start=Date.parse('2026-10-01T00:00:00Z'),stamp=ms=>new Date(start+ms).toISOString();
  for(let j=0;j<3;j++){
   const asset=randomUUID();await db.query("INSERT INTO meter_assets(id,property_id,label,source) VALUES($1,$2,'Shared fixture meter','manual')",[asset,property]);
   await db.query("INSERT INTO meters(id,property_id,meter_asset_id,device_id,room_id,kind,channel_no,installed_at,source) VALUES($1,$2,$3,$4,$5,$6,$7,'2026-01-01Z','manual')",[meters[j],property,asset,device,j?rooms[j-1]:null,j?'room':'main',j+1]);
   for(let i=0;i<3;i++)await db.query("INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,quality,data_source) VALUES($1,$2,$3,0,$4,$5,'valid','production')",[meters[j],boot,i,stamp(i*60000+100+j),String(100+i*(j?0.025:0.075))]);
  }
  const external=randomUUID();
  await db.query("INSERT INTO communal_loads(id,property_id,name,load_type) VALUES($1,$2,'External fixture','attributable')",[external,property]);
  await db.query("INSERT INTO meters(id,property_id,device_id,kind,channel_no,communal_load_id,installed_at,main_meter_coverage) VALUES($1,$2,$3,'communal',4,$4,'2026-01-01Z','outside')",[randomUUID(),property,device,external]);
  // No samples for this independent supply: it must not block the main bill.
  await db.query("INSERT INTO tariff_schedules(id,property_id,valid_from,energy_rate_rp_kwh,source_reference,source,created_by) VALUES($1,$2,'2026-01-01Z','1444.70','Synthetic fixture','manual',$3)",[randomUUID(),property,owner]);
  let acting={id:owner,role:'owner'},sequence=0;
  const adapter={query:(...a)=>db.query(...a),connect:async()=>{const point=`request_${++sequence}`;return {query:(sql,args)=>db.query(sql==='BEGIN'?`SAVEPOINT ${point}`:sql==='COMMIT'?`RELEASE SAVEPOINT ${point}`:sql==='ROLLBACK'?`ROLLBACK TO SAVEPOINT ${point}`:sql,args),release(){}};}};
  const app=express();app.use((req,_res,next)=>{req.user=acting;next();});app.use('/api',billingApi(adapter,{csrf:(_req,_res,next)=>next(),idempotencySecret:'shared-fixture-idempotency-secret-123456'}));app.use(apiError);
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  async function call(path,body){const r=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','Idempotency-Key':randomUUID()}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,...await r.json()};}
  let response=await call('/owner/billing-periods',{property_id:property,starts_at:stamp(0),ends_at:stamp(121000),reason:'Shared fixture'});assert.equal(response.status,201);let period=response.data;assert.equal(period.policy_snapshot.shared_allocation,sharedRule);
  period=(await call(`/owner/billing-periods/${period.id}/recalculate`,{row_version:period.row_version,reason:'Shared fixture calculate'})).data;
  assert.equal(period.shared_summary.complete,true);assert.equal(period.shared_summary.energy_kwh,'0.050000000');assert.equal(period.preview_total_cost_rp,'217');
  const detail=(await call(`/owner/billing-periods/${period.id}`)).data;assert.deepEqual(detail.room_bills.map(r=>r.total_cost_rp).sort(),['108','109']);assert.equal(detail.bill_shares.reduce((s,b)=>s+BigInt(b.shared_cost_rp),0n),72n);
  const live=(await call(`/owner/billing-periods/${period.id}/observed-usage?data_view=observation`)).data;assert.equal(live.cost_estimate.estimated_cost_rp,'216');
  acting={id:users[0],role:'tenant'};const own=(await call(`/billing-estimates/${period.id}?data_view=observation`)).data;assert.equal(own.estimated_cost_rp,'108');assert.equal(own.shared_energy_kwh,'0.025000000');assert.ok(!JSON.stringify(own).includes('PRIVATE_'));assert.ok(!JSON.stringify(own).includes(occupancies[1]));assert.ok(!JSON.stringify(own).includes(meters[0]));assert.equal((await call(`/owner/billing-periods/${period.id}`)).status,403);
  acting={id:foreign,role:'owner'};assert.equal((await call(`/owner/billing-periods/${period.id}`)).status,404);
  acting={id:owner,role:'owner'};
  await db.query('SAVEPOINT bad_final');
  await assert.rejects(db.query("UPDATE billing_periods SET status='finalized',total_cost_rp=217,finalized_at=now(),finalized_by=$2,shared_summary=jsonb_set(shared_summary,'{energy_kwh}','\"999\"'::jsonb) WHERE id=$1",[period.id,owner]),/shared billing energy invariant/);await db.query('ROLLBACK TO SAVEPOINT bad_final');
  response=await call(`/owner/billing-periods/${period.id}/finalize`,{row_version:period.row_version,reason:'Finalize synthetic fixture'});assert.equal(response.status,200);period=response.data;assert.equal(period.total_cost_rp,'217');
  const report=await call(`/owner/reports/billing?period_id=${period.id}`);assert.equal(report.summary.energy_kwh,'0.150000000');assert.equal(report.summary.total_cost_rp,'217');
  acting={id:users[0],role:'tenant'};const final=await call(`/billing-periods/${period.id}`);assert.equal(final.data[0].shared_energy_kwh,'0.025000000');assert.equal(final.data[0].total_cost_rp,detail.bill_shares.find(s=>s.occupancy_id===occupancies[0]).total_cost_rp);assert.ok(!JSON.stringify(final).includes('shared_summary'));assert.ok(!JSON.stringify(final).includes('PRIVATE_'));assert.ok(!JSON.stringify(final).includes(occupancies[1]));
  await db.query('SAVEPOINT immutable');await assert.rejects(db.query('UPDATE bill_shares SET shared_cost_rp=1 WHERE room_bill_id=$1',[detail.room_bills[0].id]),/immutable/);await db.query('ROLLBACK TO SAVEPOINT immutable');
  acting={id:owner,role:'owner'};
  let correction=(await call(`/owner/billing-periods/${period.id}/corrections`,{reason:'Synthetic correction'})).data;
  correction=(await call(`/owner/billing-periods/${correction.id}/recalculate`,{row_version:correction.row_version,reason:'Recalculate correction'})).data;assert.equal(correction.preview_total_cost_rp,'217');
  const corrected=(await call(`/owner/billing-periods/${correction.id}`)).data;
  assert.deepEqual(corrected.bill_shares.map(s=>s.total_cost_rp).sort(),['108','109']);assert.equal(corrected.bill_shares.reduce((sum,s)=>sum+BigInt(s.rounding_adjustment_rp),0n),1n);
  assert.equal((await call(`/owner/billing-periods/${correction.id}/finalize`,{row_version:correction.row_version,reason:'Finalize correction fixture'})).status,200);
  const old=(await db.query('SELECT status,total_cost_rp,shared_summary FROM billing_periods WHERE id=$1',[period.id])).rows[0];assert.equal(old.status,'superseded');assert.equal(old.total_cost_rp,'217');assert.deepEqual(old.shared_summary,period.shared_summary);
 }finally{if(server)await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});await db.query('ROLLBACK').catch(()=>{});db.release();await pool.end();}
});
