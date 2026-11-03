import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {compareMeterReadings,meterComparison} from '../src/meter-comparison.js';
import {monitoringApi,apiError} from '../src/monitoring-api.js';

const base=Date.parse('2026-10-30T05:00:00Z'),iso=ms=>new Date(base+ms).toISOString();
const row=(ms,energy='1.001000000',extra={})=>({id:String(ms),measured_at:iso(ms),received_at:iso(ms+50),energy_kwh:energy,power_w:'10.000000',voltage_v:'220.0000',current_a:'0.050000',quality:'valid',data_source:'production',counter_epoch:0,...extra});
function fixture(offsets=[20,100,200]){return ['main','room','room'].map((kind,i)=>{const readings=[row(offsets[i]-60000,'1.000000000'),row(offsets[i])];return {id:`meter-${i}`,kind,room_name:kind==='room'?`Kamar ${i}`:null,readings,latest_reading:readings.at(-1)};});}

test('meter di luar utama tidak masuk jumlah cabang atau menghalangi putaran tiga meter',()=>{
 const meters=fixture(),expected=compareMeterReadings(meters,base+3000);
 assert.deepEqual(compareMeterReadings([...meters,{id:'external',kind:'communal',main_meter_coverage:'outside',readings:[]}],base+3000),expected);
 const external={...meters[1],id:'external',kind:'communal',main_meter_coverage:'outside'};
 external.readings=external.readings.map(r=>({...r,power_w:'9999.000000',energy_kwh:'9999.000000000'}));
 assert.deepEqual(compareMeterReadings([...meters,external],base+3000),expected);
});

test('perbandingan satu putaran memakai timestamp asli dan delta counter, bukan jumlah counter mentah',()=>{
 const meters=fixture(),snapshot=JSON.stringify(meters),r=compareMeterReadings(meters,base+3000);
 assert.equal(r.status,'aligned');assert.equal(r.round_at,iso(0));assert.equal(r.spread_ms,180);
 assert.equal(r.meters[0].reading.measured_at,iso(20));assert.equal(r.meters[0].delta_kwh,'0.001000000');
 assert.deepEqual(r.power,{main_w:'10.000000',registered_branches_w:'20.000000',difference_w:'-10.000000'});
 assert.equal(r.energy.main_delta_kwh,'0.001000000');assert.equal(r.energy.registered_branches_delta_kwh,'0.002000000');assert.equal(r.energy.difference_kwh,'-0.001000000');
 assert.equal(JSON.stringify(meters),snapshot);assert.equal(r.interpolation,false);
});

test('sampel lama pada detik berbeda, selisih terlalu besar, future dan duplikasi tidak diklaim selaras',()=>{
 for(const offsets of [[15000,15000,47000],[20,1200,1500]]){
  const r=compareMeterReadings(fixture(offsets),base+50000);assert.equal(r.round_at,null);assert.equal(r.power,null);assert.equal(r.energy,null);assert.ok(r.meters.every(m=>m.reading===null));
 }
 const future=fixture();for(const m of future)m.readings=m.readings.slice(1);assert.equal(compareMeterReadings(future,base+10).round_at,null);
 const duplicate=fixture();duplicate[0].readings.push(row(30));duplicate[0].readings=duplicate[0].readings.filter(r=>Date.parse(r.measured_at)>=base);
 assert.equal(compareMeterReadings(duplicate,base+5000).round_at,null);
});

test('putaran baru menunggu seluruh meter dan hanya menampilkan putaran lengkap sebelumnya',()=>{
 const meters=fixture();meters[0].readings.push(row(60020,'1.002000000'));
 const r=compareMeterReadings(meters,base+61000);assert.equal(r.status,'waiting');assert.equal(r.round_at,iso(0));assert.equal(r.pending_round_at,iso(60000));assert.equal(r.meters[0].reading.measured_at,iso(20));
 assert.equal(compareMeterReadings(meters,base+240000).round_at,null);
});

test('missing/null, nol sah, counter reset dan jeda antarputaran dibedakan',()=>{
 const meters=fixture();meters[0].readings[1].power_w=null;meters[1].readings[1].power_w='0';meters[2].readings[1].counter_epoch=1;
 let r=compareMeterReadings(meters,base+5000);assert.equal(r.power.main_w,null);assert.equal(r.power.registered_branches_w,'10.000000');assert.equal(r.meters[1].reading.power_w,'0');assert.equal(r.energy.registered_branches_delta_kwh,null);assert.equal(r.meters[2].delta_kwh,null);
 for(const m of meters)m.readings=m.readings.slice(1);r=compareMeterReadings(meters,base+5000);assert.ok(r.meters.every(m=>m.delta_kwh===null));
 const invalid=fixture();invalid[0].readings.forEach(r=>r.quality='invalid');assert.equal(compareMeterReadings(invalid,base+5000).round_at,null);
 const sim=fixture();sim[0].readings.forEach(r=>r.data_source='simulation');assert.equal(compareMeterReadings(sim,base+5000).round_at,null);
 assert.equal(compareMeterReadings(fixture().slice(1),base+5000).status,'incomplete_mapping');
});

test('daya dan energi mempertahankan presisi besar serta counter yang menurun tidak menjadi energi negatif',()=>{
 const meters=fixture();meters[0].readings[1].power_w='999999999999.123456';meters[0].readings[1].energy_kwh='99999999999.999999999';meters[0].readings[0].energy_kwh='99999999999.999999998';
 const r=compareMeterReadings(meters,base+5000);assert.equal(r.power.main_w,'999999999999.123456');assert.equal(r.power.difference_w,'999999999979.123456');assert.equal(r.meters[0].delta_kwh,'0.000000001');
 meters[0].readings[1].energy_kwh='0';assert.equal(compareMeterReadings(meters,base+5000).meters[0].delta_kwh,null);
});

test('query perbandingan hanya membaca properti owner, menjaga desimal sebagai string dan tanpa mutasi',async()=>{
 const queries=[],db={async query(sql,args){queries.push({sql,args});return {rows:queries.length===1?[{id:'p',timezone:'Asia/Jakarta'}]:fixture()};}};
 const result=await meterComparison(db,{ownerId:'owner',propertyId:'p',at:new Date(base+5000)});assert.equal(result.status,'aligned');assert.equal(queries.length,2);
 assert.deepEqual(queries[0].args,['p','owner']);assert.deepEqual(queries[1].args.slice(0,2),['p','owner']);assert.match(queries[1].sql,/energy_kwh::text/);assert.match(queries[1].sql,/p.owner_id=\$2/);assert.ok(queries.every(q=>!/^\s*(INSERT|UPDATE|DELETE)/i.test(q.sql)));
 assert.equal(await meterComparison({query:async()=>({rows:[]})},{ownerId:'other',propertyId:'p'}),null);
});

test('API perbandingan: anonymous401 tenant403 properti asing404 dan filter tak dikenal400',async t=>{
 let role=null,owned=true,calls=0;const id='10000000-0000-4000-8000-000000000001';
 const db={async query(sql){calls++;return {rows:sql.startsWith('SELECT id,timezone')?(owned?[{id,timezone:'Asia/Jakarta'}]:[]):fixture()};}};
 const app=express();app.use((req,_res,next)=>{if(role)req.user={id,role};next();});app.use('/api',monitoringApi(db));app.use(apiError);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const path=`http://127.0.0.1:${server.address().port}/api/owner/meter-comparison?property_id=${id}`,get=(url=path)=>fetch(url);
 assert.equal((await get()).status,401);role='tenant';assert.equal((await get()).status,403);assert.equal(calls,0);
 role='owner';assert.equal((await get(path+'&user_id=other')).status,400);assert.equal((await get(path.replace(id,'invalid'))).status,400);
 owned=false;assert.equal((await get()).status,404);owned=true;assert.equal((await get()).status,200);
});
