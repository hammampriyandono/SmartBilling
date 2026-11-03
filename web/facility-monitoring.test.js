import test from 'node:test';
import assert from 'node:assert/strict';
import {facilityMeters,facilityReadingState,loadFacilityMonitoring} from './facility-monitoring-data.js';

const now=Date.parse('2026-10-31T01:00:00Z');
const facilities=[{id:'fan',property_id:'p',name:'Peraga kipas',is_active:true,source:'manual'},
 {id:'washer',property_id:'p',name:'Mesin cuci',is_active:true,source:'manual'},
 {id:'inactive',property_id:'p',name:'Nonaktif',is_active:false}];
const meter=(id,extra={})=>({id,kind:'communal',property_id:'p',communal_load_id:'fan',channel_no:1,installed_at:'2026-10-30T00:00:00Z',retired_at:null,source:'manual',...extra});
const reading={quality:'valid',data_source:'production',measured_at:new Date(now).toISOString(),power_w:'0.000000',current_a:'0.000000',energy_kwh:'0.002000000'};
const signal=()=>new AbortController().signal;

test('meter fasilitas mengikuti mapping aktif: bukan meter kamar/utama, perangkat lama, atau properti lain',()=>{
 const rows=[meter('active',{main_meter_coverage:'outside'}),meter('retired',{retired_at:new Date(now).toISOString()}),
  meter('future',{installed_at:new Date(now+1).toISOString()}),meter('other-property',{property_id:'other'}),
  meter('main',{kind:'main'}),meter('room',{kind:'room'}),meter('unmapped',{communal_load_id:null}),
  meter('inactive',{communal_load_id:'inactive'}),meter('washer',{communal_load_id:'washer',channel_no:2})];
 assert.deepEqual(facilityMeters(rows,facilities,{now}).map(m=>m.id),['washer','active']);
 assert.deepEqual(facilityMeters(rows,facilities,{now,facilityId:'fan'}).map(m=>m.id),['active']);
 assert.equal(facilityMeters(rows,facilities,{now,facilityId:'unknown'}).length,0);
});

test('katalog dipaginasi lengkap; kegagalan satu meter tidak menghilangkan pembacaan fasilitas lain',async()=>{
 const calls=[];
 const request=async path=>{
  calls.push(path);const url=new URL(path,'http://localhost');
  assert.equal(url.searchParams.get('data_view'),'observation');
  if(url.pathname==='/api/meters')return url.searchParams.has('after')?{data:[meter('bad',{communal_load_id:'washer'})],next_after:null}:{data:[meter('ok'),meter('main',{kind:'main'})],next_after:'next'};
  if(url.pathname==='/api/facilities')return {data:facilities,next_after:null};
  if(url.pathname==='/api/meters/ok/latest')return {data:reading};
  if(url.pathname==='/api/meters/bad/latest')throw new Error('HTTP 503');
  throw new Error('Unexpected request');
 };
 const rows=await loadFacilityMonitoring(signal(),{request,now});
 assert.equal(calls.filter(p=>p.startsWith('/api/meters?')).length,2);
 assert.equal(calls.some(p=>p.includes('/main/latest')),false);
 assert.equal(rows.find(r=>r.meter.id==='ok').reading.current_a,'0.000000');
 assert.equal(rows.find(r=>r.meter.id==='bad').reading,null);
 assert.equal(rows.find(r=>r.meter.id==='bad').error,'HTTP 503');
});

test('null tetap tidak tersedia dan counter/nilai nol asli tidak diganti atau dihitung ulang',async()=>{
 const request=async path=>path.startsWith('/api/facilities')?{data:facilities}:path.includes('/latest')?{data:null}:{data:[meter('new')],next_after:null};
 const rows=await loadFacilityMonitoring(signal(),{request,now});
 assert.equal(rows[0].reading,null);assert.equal(rows[0].error,'');
 assert.equal(facilityReadingState(null,now).label,'Belum ada pembacaan');
 assert.equal(facilityReadingState(reading,now).label,'Pembacaan perangkat terbaru');
 assert.equal(reading.energy_kwh,'0.002000000');
});

test('simulasi tersembunyi pada mode pengamatan, termasuk latest dari instalasi manual',async()=>{
 assert.equal(facilityMeters([meter('sim',{source:'simulation'})],facilities,{now}).length,0);
 const request=async path=>path.startsWith('/api/facilities')?{data:facilities}:path.includes('/latest')?{data:{...reading,data_source:'simulation'}}:{data:[meter('manual')],next_after:null};
 assert.equal((await loadFacilityMonitoring(signal(),{request,now}))[0].reading,null);
 const rows=await loadFacilityMonitoring(signal(),{request,now,showTestData:true});
 assert.equal(facilityReadingState(rows[0].reading,now).label,'Pembacaan simulasi terbaru');
 assert.notEqual(facilityReadingState(rows[0].reading,now).tone,'green');
});

test('status membedakan sampel lama, kualitas invalid dan clock sensor; nol tidak menentukan status',()=>{
 assert.equal(facilityReadingState(reading,now+120000).tone,'green');
 assert.equal(facilityReadingState(reading,now+120001).label,'Pembacaan lama');
 assert.equal(facilityReadingState({...reading,quality:'invalid'},now).tone,'amber');
 assert.equal(facilityReadingState(reading,now-6000).label,'Waktu pengukuran perlu diperiksa');
 assert.equal(facilityReadingState({...reading,measured_at:'invalid'},now).tone,'amber');
});

test('katalog gagal/terpotong dan permintaan dibatalkan tidak dilaporkan sebagai daftar kosong yang berhasil',async()=>{
 await assert.rejects(loadFacilityMonitoring(signal(),{request:async()=>{throw new Error('offline');},now}),/offline/);
 await assert.rejects(loadFacilityMonitoring(signal(),{request:async path=>path.startsWith('/api/meters')?{data:[],next_after:'same'}:{data:[]},now}),/belum dapat dimuat lengkap/);
 const controller=new AbortController();
 await assert.rejects(loadFacilityMonitoring(controller.signal,{now,request:async path=>{
  if(path.includes('/latest')){controller.abort();throw new Error('aborted');}
  return path.startsWith('/api/meters')?{data:[meter('a')]}:{data:facilities};
 }}),/aborted/);
});
