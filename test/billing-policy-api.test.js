import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {createPool,requireDevelopment} from '../src/connections.js';
import {billingApi} from '../src/billing-api.js';
import {apiError} from '../src/monitoring-api.js';
import {HttpError} from '../src/http-input.js';
import {defaultCalculationPolicy} from '../src/billing-policy.js';

test('PostgreSQL: aturan billing, bukti batas, tarif uji, idempotensi, scope dan snapshot final', {skip:process.env.INTEGRATION_DB!=='1'}, async()=>{
  requireDevelopment();
  const pool=createPool({timeout:15000}),db=await pool.connect();let server,sequence=0;
  try {
    await db.query('BEGIN');
    const owner=randomUUID(),other=randomUUID(),tenant=randomUUID(),property=randomUUID(),room=randomUUID(),device=randomUUID(),meter=randomUUID(),main=randomUUID();
    for(const [id,role] of [[owner,'owner'],[other,'owner'],[tenant,'tenant']])await db.query("INSERT INTO users(id,name,email,password_hash,role,is_active) VALUES($1,'POLICY TEST',$2,'unused',$3,true)",[id,`${id}@policy.invalid`,role]);
    await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'POLICY TEST','Asia/Jakarta')",[property,owner]);
    await db.query("INSERT INTO rooms(id,property_id,code,name,active_from,source) VALUES($1,$2,'P1','Policy Room','2026-01-01Z','manual')",[room,property]);
    await db.query("INSERT INTO property_tenants(id,property_id,user_id,status) VALUES($1,$2,$3,'active')",[randomUUID(),property,tenant]);
    await db.query("INSERT INTO occupancies(id,user_id,room_id,starts_at,source) VALUES($1,$2,$3,'2026-01-01Z','manual')",[randomUUID(),tenant,room]);
    await db.query("INSERT INTO devices(id,property_id,device_uid,status,source) VALUES($1,$2,$3,'active','manual')",[device,property,`policy-${device}`]);
    for(const [id,kind,channel] of [[meter,'room',1],[main,'main',2]]){
      const asset=randomUUID();
      await db.query("INSERT INTO meter_assets(id,property_id,label,source) VALUES($1,$2,'Policy meter','manual')",[asset,property]);
      await db.query("INSERT INTO meters(id,property_id,meter_asset_id,device_id,room_id,kind,channel_no,installed_at,source) VALUES($1,$2,$3,$4,$5,$6,$7,'2026-01-01Z','manual')",[id,property,asset,device,kind==='room'?room:null,kind,channel]);
      const boot=randomUUID();
      for(const [i,seconds] of [13,73,133,193,253,293].entries())await db.query("INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,quality,data_source) VALUES($1,$2,$3,0,$4,$5,'valid','production')",[id,boot,i,new Date(Date.parse('2026-10-01T00:00:00Z')+seconds*1000),String(10+i*(kind==='main'?0.012:0.006))]);
    }
    const adapter={query:(...args)=>db.query(...args),connect:async()=>{let savepoint;return{release(){},query:async(sql,args)=>{if(sql==='BEGIN'){savepoint=`policy_${++sequence}`;return db.query(`SAVEPOINT ${savepoint}`);}if(sql==='COMMIT')return db.query(`RELEASE SAVEPOINT ${savepoint}`);if(sql==='ROLLBACK')return db.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);return db.query(sql,args);}}}};
    let acting={id:owner,role:'owner'};
    const app=express();app.use((req,_res,next)=>{req.user=acting;next();});
    app.use('/api',billingApi(adapter,{csrf:(req,_res,next)=>req.get('x-csrf-token')==='test-csrf'?next():next(new HttpError(403,'csrf_invalid')),idempotencySecret:'policy-test-secret-012345678901234567890'}));app.use(apiError);
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    async function call(path,body,key=randomUUID(),csrf=true){const response=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json','idempotency-key':key,...(csrf?{'x-csrf-token':'test-csrf'}:{})}:{},body:body?JSON.stringify(body):undefined});return{status:response.status,...await response.json()};}
    const created=await call('/owner/billing-periods',{property_id:property,starts_at:'2026-10-01T00:00:00Z',ends_at:'2026-10-01T00:05:00Z',calculation_policy:{...defaultCalculationPolicy,boundary_method:'exact',boundary_tolerance_seconds:0},reason:'Fixture test'});
    assert.equal(created.status,201);let period=created.data;
    let result=await call(`/owner/billing-periods/${period.id}/recalculate`,{row_version:period.row_version,reason:'Exact boundary review'});
    assert.equal(result.status,200);period=result.data;assert.equal(period.status,'review');
    const path=`/owner/billing-periods/${period.id}/policy`,body={row_version:period.row_version,reason:'Inside tolerance test',calculation_policy:defaultCalculationPolicy,preview_tariff:{energy_rate_rp_kwh:'1444.70',source_reference:'Fixture assumption'}},key=randomUUID();
    assert.equal((await call(path,{...body,calculation_policy:{...defaultCalculationPolicy,boundary_tolerance_seconds:999}})).status,400);
    assert.equal((await call(path,body,randomUUID(),false)).status,403);
    result=await call(path,body,key);assert.equal(result.status,200);period=result.data;
    assert.equal((await call(path,body,key)).data.row_version,period.row_version);
    assert.equal((await call(path,body)).status,409);
    let detail=(await call(`/owner/billing-periods/${period.id}`)).data;
    assert.equal(detail.room_bills.length,0);assert.equal(detail.preview_total_cost_rp,null);
    assert.equal(detail.meter_segments.length,0);
    result=await call(`/owner/billing-periods/${period.id}/recalculate`,{row_version:period.row_version,reason:'Calculate bounded samples'});assert.equal(result.status,200);period=result.data;
    assert.equal(period.source,'production');assert.equal(period.preview_total_cost_rp,'43');assert.equal(period.main_energy_kwh,'0.060000000');
    detail=(await call(`/owner/billing-periods/${period.id}?data_view=observation`)).data;
    assert.equal(detail.room_bills[0].room_energy_kwh,'0.030000000');assert.equal(detail.meter_segments.length,2);
    assert.equal(detail.meter_segments[0].calculation_evidence.start_offset_seconds,13);
    assert.equal(detail.tariff_snapshot.source,'preview_assumption');
    assert.equal((await db.query('SELECT count(*)::int n FROM tariff_schedules WHERE property_id=$1',[property])).rows[0].n,0);
    result=await call(`/owner/billing-periods/${period.id}/finalize`,{row_version:period.row_version,reason:'Assumption must remain preview'});
    assert.equal(result.status,409);assert.equal(result.error,'preview_tariff_not_finalizable');
    acting={id:other,role:'owner'};assert.equal((await call(path,{...body,row_version:period.row_version})).status,404);assert.equal((await call(`/owner/billing-periods/${period.id}`)).status,404);
    acting={id:tenant,role:'tenant'};assert.equal((await call(path,body)).status,403);assert.equal((await call(`/billing-periods/${period.id}`)).status,404);
    acting={id:owner,role:'owner'};
    result=await call(path,{...body,row_version:period.row_version,preview_tariff:null});assert.equal(result.status,200);period=result.data;
    assert.equal((await call(`/owner/billing-periods/${period.id}`)).data.room_bills.length,0);
    assert.equal((await call('/owner/tariff-schedules',{property_id:property,valid_from:'2026-09-01T00:00:00Z',valid_until:null,energy_rate_rp_kwh:'1500',source_reference:'Fixture tariff',source:'manual',reason:'Fixture'})).status,201);
    period=(await call(`/owner/billing-periods/${period.id}/recalculate`,{row_version:period.row_version,reason:'Operational tariff'})).data;
    assert.equal(period.preview_total_cost_rp,'45');
    result=await call(`/owner/billing-periods/${period.id}/finalize`,{row_version:period.row_version,reason:'Fixture finalize'});assert.equal(result.status,200);period=result.data;
    assert.equal((await call(path,{...body,row_version:period.row_version})).status,409);
    assert.ok((await db.query("SELECT 1 FROM audit_logs WHERE entity_id=$1 AND action='update_billing_policy'",[period.id])).rowCount);
  } finally {if(server)await new Promise(resolve=>server.close(resolve));await db.query('ROLLBACK');db.release();await pool.end();}
});
