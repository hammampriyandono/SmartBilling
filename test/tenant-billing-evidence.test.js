import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {createPool,requireDevelopment} from '../src/connections.js';
import {calculatePeriod} from '../src/billing-service.js';
import {billingApi} from '../src/billing-api.js';
import {apiError} from '../src/monitoring-api.js';

test('bukti tagihan final tenant: snapshot historis, pergantian meter, scope kamar dan field terbatas',
 {skip:process.env.INTEGRATION_DB!=='1'},async()=>{
 requireDevelopment();const pool=createPool({timeout:20000}),db=await pool.connect();let server;
 try{
  await db.query('BEGIN');
  const owner=randomUUID(),tenantA=randomUUID(),tenantB=randomUUID(),stranger=randomUUID(),property=randomUUID();
  const roomA=randomUUID(),roomB=randomUUID(),start='2026-10-01T00:00:00+07:00',mid='2026-10-15T00:00:00+07:00',end='2026-11-01T00:00:00+07:00';
  for(const [id,role] of [[owner,'owner'],[tenantA,'tenant'],[tenantB,'tenant'],[stranger,'tenant']])
   await db.query("INSERT INTO users(id,name,email,password_hash,role,is_active) VALUES($1,'Evidence fixture',$2,'unused',$3,true)",[id,`${id}@evidence.invalid`,role]);
  await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'BILL EVIDENCE FIXTURE','Asia/Jakarta')",[property,owner]);
  for(const [room,tenant,code] of [[roomA,tenantA,'A'],[roomB,tenantB,'B']]){
   await db.query("INSERT INTO rooms(id,property_id,code,name,active_from,source) VALUES($1,$2,$3,$3,'2026-01-01Z','manual')",[room,property,code]);
   await db.query("INSERT INTO property_tenants(id,property_id,user_id,status) VALUES($1,$2,$3,'active')",[randomUUID(),property,tenant]);
   await db.query("INSERT INTO occupancies(id,user_id,room_id,starts_at,source) VALUES($1,$2,$3,'2026-01-01Z','manual')",[randomUUID(),tenant,room]);
  }
  const installed=[];
  for(const [room,from,to,readingStart,readingEnd,lo,hi] of [
   [roomA,'2026-01-01Z',mid,start,new Date(+new Date(mid)-1000).toISOString(),'0.100000000','0.150000000'],
   [roomA,mid,null,mid,end,'0.001000000','0.006000000'],
   [roomB,'2026-01-01Z',null,start,end,'1000.000000000','1009.000000000'],
  ]){
   const device=randomUUID(),asset=randomUUID(),meter=randomUUID(),boot=randomUUID();
   await db.query("INSERT INTO devices(id,property_id,device_uid,status,source) VALUES($1,$2,$3,'active','manual')",[device,property,`evidence-${device}`]);
   await db.query("INSERT INTO meter_assets(id,property_id,label,source) VALUES($1,$2,'Fixture asset','manual')",[asset,property]);
   await db.query("INSERT INTO meters(id,property_id,meter_asset_id,device_id,room_id,kind,channel_no,installed_at,retired_at,source) VALUES($1,$2,$3,$4,$5,'room',1,$6,$7,'manual')",[meter,property,asset,device,room,from,to]);
   await db.query("INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,quality,data_source) VALUES($1,$2,0,0,$3,$4,'valid','production'),($1,$2,1,0,$5,$6,'valid','production')",[meter,boot,readingStart,lo,readingEnd,hi]);
   installed.push({meter,room,boot});
  }
  await db.query("INSERT INTO tariff_schedules(id,property_id,valid_from,valid_until,energy_rate_rp_kwh,source_reference,source,created_by) VALUES($1,$2,$3,$4,'1444.70','Synthetic test tariff','manual',$5)",[randomUUID(),property,start,end,owner]);
  const id=randomUUID(),policy={production_max_gap_seconds:3000000,boundary_method:'inside',boundary_tolerance_seconds:60,shared_allocation:'none'};
  await db.query("INSERT INTO billing_periods(id,property_id,starts_at,ends_at,revision_no,revision_kind,source,calculation_version,policy_snapshot,created_by) VALUES($1,$2,$3,$4,1,'initial','production','billing-v2',$5,$6)",[id,property,start,end,policy,owner]);
  const calculated=await calculatePeriod(db,id);assert.equal(calculated.status,'draft');
  await db.query("UPDATE billing_periods SET status='finalized',total_cost_rp=(SELECT sum(total_cost_rp) FROM room_bills WHERE billing_period_id=$1),finalized_at=now(),finalized_by=$2 WHERE id=$1",[id,owner]);
  const snapshot=(await db.query('SELECT * FROM billing_meter_segments WHERE billing_period_id=$1 ORDER BY id',[id])).rows;
  const current=installed.find(x=>x.room===roomA&&x!==installed[0]);
  await db.query("INSERT INTO meter_readings(meter_id,boot_id,sequence_no,counter_epoch,measured_at,energy_kwh,quality,data_source) VALUES($1,$2,2,0,'2026-11-02Z','999.000000000','valid','production')",[current.meter,current.boot]);
  let acting={id:tenantA,role:'tenant'};
  const app=express();app.use((req,_res,next)=>{req.user=acting;next();});
  app.use('/api',billingApi({query:(...args)=>db.query(...args)},{csrf:(_q,_s,n)=>n(),idempotencySecret:'evidence-fixture-secret-0123456789'}));app.use(apiError);
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const get=path=>fetch(`http://127.0.0.1:${server.address().port}`+path);
  let response=await get(`/api/billing-periods/${id}`);assert.equal(response.status,200);
  const a=(await response.json()).data;assert.equal(a.length,1);assert.equal(a[0].room_id,roomA);
  assert.equal(a[0].meter_segments.length,2);
  assert.deepEqual(a[0].meter_segments.map(s=>[s.start_energy_kwh,s.end_energy_kwh]),[['0.100000000','0.150000000'],['0.001000000','0.006000000']]);
  assert.ok(a[0].meter_segments.every(s=>s.quality==='valid'&&s.measured_starts_at&&s.measured_ends_at));
  assert.equal(JSON.stringify(a).includes('1000.000000000'),false);assert.equal(JSON.stringify(a).includes('999.000000000'),false);
  const permitted=['segment_starts_at','segment_ends_at','start_energy_kwh','end_energy_kwh','consumption_kwh','quality','measured_starts_at','measured_ends_at'];
  for(const segment of a[0].meter_segments)assert.deepEqual(Object.keys(segment).sort(),permitted.toSorted());
  const attempted=(await(await get(`/api/billing-periods/${id}?room_id=${roomB}`)).json()).data;
  assert.deepEqual(attempted,a);
  acting={id:tenantB,role:'tenant'};response=await get(`/api/billing-periods/${id}`);assert.equal(response.status,200);
  const b=(await response.json()).data;assert.equal(b.length,1);assert.equal(b[0].room_id,roomB);assert.equal(b[0].meter_segments.length,1);assert.equal(b[0].meter_segments[0].start_energy_kwh,'1000.000000000');
  acting={id:stranger,role:'tenant'};assert.equal((await get(`/api/billing-periods/${id}`)).status,404);
  assert.deepEqual((await db.query('SELECT * FROM billing_meter_segments WHERE billing_period_id=$1 ORDER BY id',[id])).rows,snapshot);
 }finally{if(server)await new Promise(r=>{server.closeAllConnections();server.close(r);});await db.query('ROLLBACK').catch(()=>{});db.release();await pool.end();}
});
