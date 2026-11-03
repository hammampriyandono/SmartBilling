import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedUsage,sharedRule} from '../src/billing-shared.js';
import {includeSharedCosts} from '../src/billing-observed.js';
import {runningRoomCosts} from '../src/billing-running-cost.js';
import {projectTenantEstimate} from '../src/tenant-billing-estimate.js';

const start=Date.parse('2026-10-01T00:00:00Z'),stamp=ms=>new Date(start+ms).toISOString();
function fixture(){
 const meters=[{id:'main',kind:'main'},{id:'one',kind:'room',room_id:'r1'},{id:'two',kind:'room',room_id:'r2'}].map(m=>({...m,installed_at:stamp(-60000),source:'manual'}));
 const occupancies=[1,2].map(n=>({id:`o${n}`,room_id:`r${n}`,user_id:`u${n}`,tenant_name:`Tenant ${n}`,source:'manual',starts_at:stamp(-60000),ends_at:null}));
 const readings=meters.flatMap((m,j)=>[0,1,2].map(i=>({id:`${m.id}-${i}`,meter_id:m.id,measured_at:stamp(i*60000+100+j),energy_kwh:String(i*(j===0?0.075:0.025)),counter_epoch:0,quality:'valid',data_source:'production'})));
 return {meters,rooms:[{id:'r1'},{id:'r2'}],readings,occupancies,tariffs:[{id:'t',source:'manual',energy_rate_rp_kwh:'2000',valid_from:stamp(-60000),valid_until:null}],period:{id:'period',starts_at:stamp(0),ends_at:stamp(121000),policy_snapshot:{boundary_method:'inside',boundary_tolerance_seconds:60,production_max_gap_seconds:180,shared_allocation:sharedRule}}};
}
test('shared: meter peraga di luar utama tidak mengurangi residual atau menjadi syarat kelengkapan',()=>{
 const f=fixture(),expected=sharedUsage(f);
 f.meters.push({id:'external',kind:'communal',load_type:'attributable',main_meter_coverage:'outside',source:'manual',installed_at:stamp(-60000)});
 assert.deepEqual(sharedUsage(f),expected);
 f.readings.push(...f.readings.filter(r=>r.meter_id==='main').map(r=>({...r,id:'external-'+r.id,meter_id:'external',energy_kwh:String(Number(r.energy_kwh)*100)})));
 assert.deepEqual(sharedUsage(f),expected);
});

test('shared: residual delta dengan baseline berbeda dibagi rata, energi dan rupiah terjaga',()=>{
 const f=fixture();for(const r of f.readings){const baseline=r.meter_id==='main'?100:1000;r.energy_kwh=String(baseline+Number(r.energy_kwh));}
 const s=sharedUsage(f);assert.equal(s.complete,true);assert.equal(s.energy_kwh,'0.050000000');assert.equal(s.estimated_cost_rp,'100');
 assert.deepEqual(s.allocations.map(a=>[a.energy_kwh,a.estimated_cost_rp]),[['0.025000000','50'],['0.025000000','50']]);
 assert.equal(s.runs[0].interval_count,2);
});
test('shared: residu negatif sementara tidak dibuang untuk memperbesar tagihan',()=>{
 const f=fixture(),values={main:['0','0','0.003'],one:['0','0.001','0.001'],two:['0','0','0.001']};
 for(const r of f.readings)r.energy_kwh=values[r.meter_id][+r.id.at(-1)];
 assert.equal(sharedUsage(f).energy_kwh,'0.001000000');
 for(const r of f.readings)if(r.meter_id==='main')r.energy_kwh='0';
 const s=sharedUsage(f);assert.equal(s.status,'review');assert.equal(s.energy_kwh,null);assert.equal(s.estimated_cost_rp,null);assert.ok(s.reasons.includes('negative_property_residual'));
});
test('shared: data kosong, simulasi, putaran ambigu, reset dan offset salah tidak ditagih sebagai nol',()=>{
 for(const mutate of [f=>f.readings=[],f=>f.readings.forEach(r=>{if(r.meter_id==='two')r.data_source='simulation';}),f=>f.readings.push(...f.readings.filter(r=>r.meter_id==='two').map(r=>({...r,id:'duplicate-'+r.id}))),f=>f.readings.forEach(r=>r.counter_epoch=+r.id.at(-1)),f=>f.readings.forEach(r=>{if(r.meter_id==='two')r.measured_at=new Date(Date.parse(r.measured_at)+3000).toISOString();})]){
  const f=fixture();mutate(f);const s=sharedUsage(f);assert.equal(s.energy_kwh,null);assert.equal(s.estimated_cost_rp,null);assert.equal(s.complete,false);
 }
});
test('shared: perubahan penghuni tidak diprorata melewati batas tanpa sampel',()=>{
 const f=fixture();f.occupancies[1].ends_at=stamp(45000);
 const s=sharedUsage(f);assert.equal(s.complete,false);assert.equal(s.energy_kwh,'0.025000000');assert.equal(s.allocations.length,1);assert.equal(s.allocations[0].occupancy_id,'o1');assert.ok(s.reasons.includes('shared_occupancy_boundary'));
 const duplicate=fixture();duplicate.occupancies[1].user_id='u1';assert.equal(sharedUsage(duplicate).energy_kwh,null);
});
test('shared: fasilitas attributable dikurangi, meter shared tidak dihitung dua kali',()=>{
 const f=fixture();for(const [id,type,step] of [['rfid','attributable',0.005],['shared','shared',0.02]]){
  f.meters.push({id,kind:'communal',load_type:type,source:'manual',installed_at:stamp(-60000)});
  for(let i=0;i<3;i++)f.readings.push({id:id+i,meter_id:id,measured_at:stamp(i*60000+103),energy_kwh:String(i*step),counter_epoch:0,quality:'valid',data_source:'production'});
 }
 assert.equal(sharedUsage(f).energy_kwh,'0.040000000');
 f.meters.push({...f.meters[1],id:'replacement'});assert.ok(sharedUsage(f).reasons.includes('shared_mapping_incomplete'));
});
test('shared: estimasi owner dan tenant sama, tenant hanya menerima bagian sendiri',()=>{
 const f=fixture(),shared=sharedUsage(f);
 const rows=f.rooms.map(r=>({room_id:r.id,observed_consumption_kwh:'0.05',intervals:[{starts_at:stamp(100),ends_at:stamp(120103),energy_kwh:'0.05'}]}));
 const usage=includeSharedCosts(runningRoomCosts(rows,f.tariffs,f.occupancies),shared);
 assert.equal(usage.cost_estimate.estimated_cost_rp,'300');assert.equal(usage.rooms[0].estimated_cost_rp,'150');
 const own=projectTenantEstimate(f.period,{...usage,availability:'available'},[{...f.occupancies[0],room_name:'Own'}],[{room_id:'r1',sample_count:3,data_source:'production'}]);
 assert.equal(own.estimated_cost_rp,'150');assert.equal(own.energy_kwh,'0.075000000');assert.equal(own.shared_energy_kwh,'0.025000000');
 assert.ok(!JSON.stringify(own).includes('Tenant 2'));assert.ok(!JSON.stringify(own).includes('o2'));assert.ok(!JSON.stringify(own).includes('main_energy'));
 const missing=projectTenantEstimate(f.period,{...includeSharedCosts(runningRoomCosts(rows,f.tariffs,f.occupancies),{...shared,energy_kwh:null,estimated_cost_rp:null,allocations:[],status:'review'}),availability:'available'},[f.occupancies[0]],[{room_id:'r1',sample_count:3}]);assert.equal(missing.estimated_cost_rp,null);
});
