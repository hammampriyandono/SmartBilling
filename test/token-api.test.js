import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {randomUUID} from 'node:crypto';
import {createPool,requireDevelopment} from '../src/connections.js';import {tokenApi} from '../src/token-api.js';import {billingApi} from '../src/billing-api.js';import {apiError} from '../src/monitoring-api.js';import {HttpError} from '../src/http-input.js';

test('token routing: tenant ditolak tanpa query DB; monitoring tetap dapat diakses',async()=>{
 const app=express(),pool={query(){throw new Error('tenant must not query tokens');}};
 app.use((req,_res,n)=>{req.user={id:randomUUID(),role:'tenant'};n();});app.use('/api',tokenApi(pool,{csrf:(_q,_s,n)=>n(),idempotencySecret:'test-only'}));app.get('/api/rooms',(_req,res)=>res.json({data:[]}));app.use(apiError);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const base=`http://127.0.0.1:${server.address().port}`;for(const [path,method] of [['token-purchases','GET'],['token-purchases','POST'],['token-purchases/'+randomUUID(),'PATCH'],['token-purchases/'+randomUUID()+'/cancel','POST'],['monthly-token-summary','GET'],['token-energy-estimate','GET']])assert.equal((await fetch(`${base}/api/owner/${path}`,{method})).status,403);assert.equal((await fetch(base+'/api/rooms')).status,200);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('PostgreSQL token: bulan/zona waktu, revisi final, pembayaran, koreksi/batal, audit, retry/restart/paralel, ownership',{
 skip:process.env.INTEGRATION_DB!=='1',
},async()=>{
 requireDevelopment();const real=createPool({timeout:15000}),db=await real.connect();let server,sp=0,leased=false,pause=false,entered,releasePause;
 try{
  await db.query('BEGIN');const owner=randomUUID(),other=randomUUID(),tenant=randomUUID(),property=randomUUID(),room=randomUUID(),emptyRoom=randomUUID(),occupancy=randomUUID();
  for(const [id,role] of [[owner,'owner'],[other,'owner'],[tenant,'tenant']])await db.query("INSERT INTO users(id,name,email,password_hash,role,is_active) VALUES($1,'TOKEN FIXTURE',$2,'unused',$3,true)",[id,`${id}@token.invalid`,role]);
  await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'TOKEN FIXTURE','Asia/Jakarta')",[property,owner]);
  await db.query("INSERT INTO rooms(id,property_id,code,name,active_from,source) VALUES($1,$3,'T1','Tenant','2026-01-01Z','manual'),($2,$3,'T2','Empty','2026-01-01Z','manual')",[room,emptyRoom,property]);
  await db.query("INSERT INTO property_tenants(id,property_id,user_id,status) VALUES($1,$2,$3,'active')",[randomUUID(),property,tenant]);
  await db.query("INSERT INTO occupancies(id,user_id,room_id,starts_at,source) VALUES($1,$2,$3,'2026-01-01Z','manual')",[occupancy,tenant,room]);
  // All fixture mutations roll back. The parallel retry uses an independent
  // PostgreSQL transaction while the first HTTP mutation holds the advisory lock.
  const adapter={query:(...a)=>db.query(...a),connect:async()=>{
   if(leased)return real.connect();leased=true;let name;
   return{release(){leased=false;},query:async(sql,args)=>{
    if(sql==='BEGIN'){name=`token_${++sp}`;return db.query(`SAVEPOINT ${name}`);}if(sql==='COMMIT')return db.query(`RELEASE SAVEPOINT ${name}`);if(sql==='ROLLBACK')return db.query(`ROLLBACK TO SAVEPOINT ${name}`);
    if(pause&&sql.startsWith('INSERT INTO token_purchases')){pause=false;entered();await new Promise(r=>{releasePause=r;});}return db.query(sql,args);
   }};
  }};
  let acting={id:owner,role:'owner'},base;const secret='token-test-only-012345678901234567890';
  async function start(){const app=express();app.use((req,_res,next)=>{req.user=acting;next();});const csrf=(req,_res,n)=>req.get('x-csrf-token')==='fixture'?n():n(new HttpError(403,'invalid_csrf'));app.use('/api',tokenApi(adapter,{csrf,idempotencySecret:secret}),billingApi(adapter,{csrf,idempotencySecret:secret}));app.use(apiError);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;}
  const call=(path,method='GET',body,key=randomUUID(),csrf='fixture')=>fetch(base+path,{method,headers:body?{'content-type':'application/json','idempotency-key':key,'x-csrf-token':csrf}:{},body:body?JSON.stringify(body):undefined});await start();
  const endpoint='/api/owner/token-purchases',summary=async(month='2026-10')=>{const res=await call(`/api/owner/monthly-token-summary?property_id=${property}&month=${month}`);assert.equal(res.status,200);return(await res.json()).data;};
  assert.equal((await summary()).tenant_total_rp,null);assert.equal((await summary()).difference_rp,null);assert.equal((await summary()).token_total_rp,'0');
  const body={property_id:property,purchase_date:'2026-10-01',amount_rp:'100000',energy_kwh:'33.570000',note:'Fixture'},key=randomUUID();
  assert.equal((await call(endpoint,'POST',body,'bad')).status,400);assert.equal((await call(endpoint,'POST',body,randomUUID(),'bad')).status,403);
  for(const amount_rp of ['0','1.5','1000000000001',100])assert.equal((await call(endpoint,'POST',{...body,amount_rp})).status,400);
  for(const energy_kwh of ['0','-1','1e3','1.1234567','1000000000',33.57])assert.equal((await call(endpoint,'POST',{...body,energy_kwh})).status,400);
  let response=await call(endpoint,'POST',body,key);assert.equal(response.status,201);let purchase=(await response.json()).data;assert.equal(purchase.energy_kwh,'33.570000');assert.equal((await summary()).energy_total_kwh,'33.570000');
  assert.deepEqual((await(await call(endpoint,'POST',body,key)).json()).data,purchase);assert.equal((await call(endpoint,'POST',{...body,amount_rp:'2'},key)).status,409);
  response=await call(endpoint,'POST',{...body,purchase_date:'2026-10-31',amount_rp:'50000',energy_kwh:null});assert.equal(response.status,201);const second=(await response.json()).data;assert.equal(second.energy_kwh,null);assert.equal((await summary()).energy_total_kwh,null);assert.equal((await summary()).energy_missing_count,1);
  await call(endpoint,'POST',{...body,purchase_date:'2026-09-30',amount_rp:'1'});await call(endpoint,'POST',{...body,purchase_date:'2026-11-01',amount_rp:'2'});
  assert.equal((await summary()).token_total_rp,'150000');assert.equal((await summary('2026-09')).token_total_rp,'1');assert.equal((await summary('2026-11')).token_total_rp,'2');
  const list=`${endpoint}?property_id=${property}&month=2026-10&limit=1`,page=await(await call(list)).json();assert.equal(page.data.length,1);assert.ok(page.next_after);assert.equal((await(await call(list+'&after='+page.next_after)).json()).data.length,1);
  const correct={purchase_date:'2026-10-02',amount_rp:'80000',note:null,row_version:1,reason:'Salah nominal'},correctKey=randomUUID();response=await call(`${endpoint}/${purchase.id}`,'PATCH',correct,correctKey);assert.equal(response.status,200);purchase=(await response.json()).data;assert.equal(purchase.row_version,2);assert.equal(purchase.energy_kwh,'33.570000','old API correction preserves omitted kWh');assert.equal((await summary()).token_total_rp,'130000');assert.deepEqual((await(await call(`${endpoint}/${purchase.id}`,'PATCH',correct,correctKey)).json()).data,purchase);
  assert.equal((await call(`${endpoint}/${purchase.id}`,'PATCH',correct)).status,409);assert.equal((await call(`${endpoint}/${purchase.id}/cancel`,'POST',{row_version:2,reason:''})).status,400);
  const cancel={row_version:1,reason:'Pembelian dibatalkan'},cancelKey=randomUUID();response=await call(`${endpoint}/${second.id}/cancel`,'POST',cancel,cancelKey);assert.equal(response.status,200);assert.equal((await response.json()).data.status,'cancelled');assert.equal((await summary()).token_total_rp,'80000');assert.equal((await summary()).energy_total_kwh,'33.570000');assert.equal((await call(`${endpoint}/${second.id}/cancel`,'POST',{row_version:2,reason:'ulang'})).status,409);assert.equal((await call(`${endpoint}/${second.id}/cancel`,'POST',cancel,correctKey)).status,409);
  assert.equal((await(await call(`${endpoint}/${purchase.id}/revisions`)).json()).data.length,2);assert.equal((await db.query('SELECT count(*)::int n FROM audit_logs WHERE entity_type=$1 AND entity_id=$2',['token_purchase',purchase.id])).rows[0].n,2);
  // Moving a corrected date across month boundaries changes only token totals.
  response=await call(`${endpoint}/${purchase.id}`,'PATCH',{...correct,purchase_date:'2026-09-30',row_version:2,reason:'Koreksi bulan'});assert.equal(response.status,200);assert.equal((await summary()).token_total_rp,'0');assert.equal((await summary()).energy_total_kwh,null);assert.equal((await summary('2026-09')).token_total_rp,'80001');
  response=await call(`${endpoint}/${purchase.id}`,'PATCH',{...correct,row_version:3,reason:'Kembalikan tanggal fixture'});assert.equal(response.status,200);purchase=(await response.json()).data;
  // Equivalent process/router restart with the same durable PostgreSQL records.
  server.closeAllConnections();await new Promise(r=>server.close(r));server=null;await start();assert.deepEqual((await(await call(endpoint,'POST',body,key)).json()).data.id,purchase.id);
  const ready=new Promise(r=>{entered=r;});pause=true;const parallelKey=randomUUID(),parallelBody={...body,amount_rp:'5'};const first=call(endpoint,'POST',parallelBody,parallelKey);await ready;
  response=await call(endpoint,'POST',parallelBody,parallelKey);assert.equal(response.status,409);assert.equal((await response.json()).error,'idempotency_in_progress');releasePause();const parallel=(await(await first).json()).data;assert.equal((await(await call(endpoint,'POST',parallelBody,parallelKey)).json()).data.id,parallel.id);assert.equal((await summary()).token_total_rp,'80005');assert.equal((await summary()).energy_total_kwh,'67.140000');
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');
  async function guarded(sql,args){await db.query('SAVEPOINT guard');try{await db.query(sql,args);assert.fail('immutable');}catch(e){assert.equal(e.code,'P0001');await db.query('ROLLBACK TO SAVEPOINT guard');}await db.query('RELEASE SAVEPOINT guard');}
  await guarded('UPDATE token_purchase_revisions SET amount_rp=1 WHERE purchase_id=$1',[purchase.id]);await guarded('DELETE FROM token_purchases WHERE id=$1',[purchase.id]);
  // Synthetic billing result fixtures are inserted only inside this rollback
  // transaction, passing existing finalize guards; never in the application DB.
  async function bill(start,end,amount,previous=null){const id=randomUUID();await db.query(`INSERT INTO billing_periods(id,property_id,starts_at,ends_at,revision_no,revision_kind,supersedes_period_id,source,calculation_version,policy_snapshot,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'production','fixture','{}',$8)`,[id,property,start,end,previous?2:1,previous?'correction':'initial',previous,owner]);let share;
   for(const [target,oc,cost] of [[room,occupancy,amount],[emptyRoom,null,'999999']]){const rb=randomUUID();await db.query(`INSERT INTO room_bills(id,billing_period_id,room_id,status,room_energy_kwh,attributable_energy_kwh,room_cost_rp,attributable_cost_rp,total_cost_rp,reasons,calculation_evidence) VALUES($1,$2,$3,'finalized',1,0,$4,0,$4,'[]','{}')`,[rb,id,target,cost]);const sid=randomUUID();await db.query(`INSERT INTO bill_shares(id,room_bill_id,occupancy_id,allocation_kind,room_energy_kwh,attributable_energy_kwh,room_cost_rp,attributable_cost_rp,rounding_adjustment_rp,total_cost_rp,allocation_evidence) VALUES($1,$2,$3,$4,1,0,$5,0,0,$5,'{}')`,[sid,rb,oc,oc?'occupancy':'owner_unassigned',cost]);if(oc)share=sid;}
   response=await call(`/api/owner/billing-periods/${id}/finalize`,'POST',{row_version:1,reason:'Fixture final'});assert.equal(response.status,200);return{id,share};
  }
  const periodStart='2026-09-30T17:00:00Z',end='2026-10-31T17:00:00Z';let final=await bill(periodStart,end,'70000');let sums=await summary();assert.equal(sums.tenant_total_rp,'70000');assert.equal(sums.unpaid_total_rp,'70000');assert.equal(sums.paid_total_rp,'0');assert.equal(sums.difference_rp,'10005');assert.equal(sums.starts_at,'2026-09-30T17:00:00.000Z');assert.equal(sums.ends_at,'2026-10-31T17:00:00.000Z');
  response=await call(`/api/owner/bill-shares/${final.share}/mark-paid`,'POST',{row_version:0,reason:'Fixture pembayaran'});assert.equal(response.status,200);assert.equal((await summary()).paid_total_rp,'70000');assert.equal((await summary()).unpaid_total_rp,'0');
  await db.query("UPDATE bill_payment_states SET paid_at='2027-04-01T00:00:00Z' WHERE bill_share_id=$1",[final.share]);assert.equal((await summary()).paid_total_rp,'70000','paid_at di bulan lain bukan filter arus kas');
  response=await call(`/api/owner/bill-shares/${final.share}/unmark-paid`,'POST',{row_version:1,reason:'Pembayaran fixture dibatalkan'});assert.equal(response.status,200);assert.equal((await summary()).unpaid_total_rp,'70000');assert.equal((await summary()).paid_total_rp,'0');
  response=await call(`/api/owner/bill-shares/${final.share}/mark-paid`,'POST',{row_version:2,reason:'Fixture lunas kembali'});assert.equal(response.status,200);
  const correction=await bill(periodStart,end,'90000',final.id);sums=await summary();assert.equal(sums.final_period_count,1);assert.equal(sums.tenant_total_rp,'90000');assert.equal(sums.difference_rp,'-9995');assert.equal(sums.paid_total_rp,'0');assert.equal(sums.unpaid_total_rp,'90000');assert.equal(sums.periods[0].id,correction.id);
  await call(endpoint,'POST',{...body,amount_rp:'9995'});assert.equal((await summary()).difference_rp,'0');
  const cross=await bill('2026-11-15T00:00:00+07:00','2026-12-15T00:00:00+07:00','12000');assert.equal((await summary('2026-11')).tenant_total_rp,null);assert.equal((await summary('2026-12')).difference_rp,null);assert.equal((await summary('2026-11')).cross_month_periods[0].id,cross.id);
  await bill('2026-11-01T00:00:00+07:00','2026-11-14T00:00:00+07:00','3000');sums=await summary('2026-11');assert.equal(sums.availability,'partial');assert.equal(sums.tenant_total_rp,'3000');assert.deepEqual(sums.issues,['cross_month_period_excluded']);
  const draft=randomUUID();await db.query(`INSERT INTO billing_periods(id,property_id,starts_at,ends_at,revision_no,revision_kind,source,calculation_version,policy_snapshot,created_by) VALUES($1,$2,'2027-01-01Z','2027-02-01Z',1,'initial','simulation','fixture','{}',$3)`,[draft,property,owner]);assert.equal((await summary('2027-01')).tenant_total_rp,null);
  await bill('2028-01-01T00:00:00+07:00','2028-02-01T00:00:00+07:00','9007199254740993');assert.equal((await summary('2028-01')).tenant_total_rp,'9007199254740993');assert.equal((await summary('2028-01')).difference_rp,'-9007199254740993');
  // DST changes affect local month duration, not final amounts.
  const dst=randomUUID();await db.query("INSERT INTO properties(id,owner_id,name,timezone) VALUES($1,$2,'DST','America/New_York')",[dst,owner]);const dstData=(await(await call(`/api/owner/monthly-token-summary?property_id=${dst}&month=2026-03`)).json()).data;assert.equal(dstData.starts_at,'2026-03-01T05:00:00.000Z');assert.equal(dstData.ends_at,'2026-04-01T04:00:00.000Z');
  await guarded('UPDATE bill_shares SET total_cost_rp=1 WHERE id=$1',[correction.share]);
  response=await call(`${endpoint}/${purchase.id}`,'PATCH',{...correct,row_version:4,energy_kwh:'20.000001',reason:'Koreksi energi'});assert.equal(response.status,200);assert.equal((await response.json()).data.energy_kwh,'20.000001');
  response=await call(`${endpoint}/${purchase.id}`,'PATCH',{...correct,row_version:5,energy_kwh:null,reason:'Energi belum diketahui'});assert.equal(response.status,200);assert.equal((await response.json()).data.energy_kwh,null);assert.equal((await summary()).energy_total_kwh,null);
  const history=(await(await call(`${endpoint}/${purchase.id}/revisions`)).json()).data;assert.equal(history[0].energy_kwh,'33.570000');assert.equal(history.at(-1).energy_kwh,null);
  // Cancellation must preserve kWh even when bypassing the HTTP adapter.
  await db.query('SAVEPOINT energy_cancel');
  await db.query("UPDATE token_purchases SET row_version=row_version+1,status='cancelled' WHERE id=$1",[parallel.id]);
  await assert.rejects(db.query(`INSERT INTO token_purchase_revisions(purchase_id,row_version,action,status,purchase_date,amount_rp,note,reason,actor_user_id,request_id,energy_kwh) VALUES($1,2,'cancel','cancelled',$2,5,'Fixture','Invalid fixture',$3,$4,1)`,[parallel.id,body.purchase_date,owner,randomUUID()]),e=>e.code==='P0001');
  await db.query('ROLLBACK TO SAVEPOINT energy_cancel');await db.query('RELEASE SAVEPOINT energy_cancel');
  response=await call(`${endpoint}/${parallel.id}/cancel`,'POST',{row_version:1,reason:'Pembatalan fixture'});assert.equal(response.status,200);assert.equal((await response.json()).data.energy_kwh,'33.570000');
  // Stateless preview and persisted estimates use the same backend calculation.
  const assumptions={tariff_rp_per_kwh:'1444.70',tax_percent:'3'};
  const quotePath='/api/owner/token-energy-estimate?'+new URLSearchParams({amount_rp:'50000',...assumptions});
  const quote=(await(await call(quotePath)).json()).data;assert.equal(quote.energy_kwh,'33.57');
  assert.deepEqual((await(await call('/api/owner/token-energy-estimate?amount_rp=50000')).json()).data,quote);
  const automatic={...body,purchase_date:'2029-10-22',amount_rp:'50000',energy_estimate:{}};delete automatic.energy_kwh;
  assert.equal((await call(endpoint,'POST',{...automatic,energy_kwh:'999'})).status,400);
  assert.equal((await call(endpoint,'POST',{...automatic,energy_estimate:{...assumptions,tariff_rp_per_kwh:'0'}})).status,400);
  const autoKey=randomUUID();response=await call(endpoint,'POST',automatic,autoKey);assert.equal(response.status,201);const auto=(await response.json()).data;
  assert.equal(auto.energy_kwh,'33.570000');assert.deepEqual(auto.energy_calculation,quote.energy_calculation);
  assert.deepEqual((await(await call(endpoint,'POST',automatic,autoKey)).json()).data,auto);
  assert.equal((await summary('2029-10')).energy_estimated_count,1);
  const autoCorrect={...correct,purchase_date:'2029-10-22',amount_rp:'100000',row_version:1};
  response=await call(`${endpoint}/${auto.id}`,'PATCH',autoCorrect);assert.equal(response.status,200);assert.equal((await response.json()).data.energy_kwh,'67.140000','nominal correction recalculates saved estimate assumptions');
  response=await call(`${endpoint}/${auto.id}`,'PATCH',{...autoCorrect,row_version:2,energy_kwh:'40'});assert.equal(response.status,200);assert.equal((await response.json()).data.energy_calculation,null);assert.equal((await summary('2029-10')).energy_estimated_count,0);
  response=await call(`${endpoint}/${auto.id}`,'PATCH',{...autoCorrect,row_version:3,energy_estimate:assumptions});assert.equal(response.status,200);
  await db.query('SAVEPOINT estimate_cancel');await db.query("UPDATE token_purchases SET row_version=row_version+1,status='cancelled' WHERE id=$1",[auto.id]);
  await assert.rejects(db.query(`INSERT INTO token_purchase_revisions(purchase_id,row_version,action,status,purchase_date,amount_rp,note,reason,actor_user_id,request_id,energy_kwh) SELECT purchase_id,5,'cancel','cancelled',purchase_date,amount_rp,note,'Invalid fixture',actor_user_id,$2,energy_kwh FROM token_purchase_revisions WHERE purchase_id=$1 AND row_version=4`,[auto.id,randomUUID()]),e=>e.code==='P0001');
  await db.query('ROLLBACK TO SAVEPOINT estimate_cancel');await db.query('RELEASE SAVEPOINT estimate_cancel');
  response=await call(`${endpoint}/${auto.id}/cancel`,'POST',{row_version:4,reason:'Cancel estimated fixture'});assert.equal(response.status,200);assert.deepEqual((await response.json()).data.energy_calculation,quote.energy_calculation);
  assert.equal((await summary('2029-10')).energy_total_kwh,null);assert.equal((await summary('2029-10')).energy_estimated_count,0);
  acting={id:other,role:'owner'};assert.equal((await call(`${endpoint}?property_id=${property}&month=2026-10`)).status,404);assert.equal((await call(endpoint,'POST',body)).status,404);assert.equal((await call(`${endpoint}/${purchase.id}/revisions`)).status,404);assert.equal((await call(`${endpoint}/${purchase.id}`,'PATCH',{...correct,row_version:2})).status,404);assert.equal((await call(`/api/owner/monthly-token-summary?property_id=${property}&month=2026-10`)).status,404);
  acting={id:tenant,role:'tenant'};assert.equal((await call(endpoint)).status,403);assert.equal((await call(endpoint,'POST',body)).status,403);assert.equal((await call(`/api/owner/monthly-token-summary?property_id=${property}&month=2026-10`)).status,403);
 }finally{releasePause?.();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await db.query('ROLLBACK').catch(()=>{});db.release();await real.end();}
});
