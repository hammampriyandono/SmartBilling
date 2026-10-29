import test from 'node:test';
import assert from 'node:assert/strict';
import {isArchivedTestRecord, monitoringCatalog, activeCatalog, preferredMeter, readingSourceLabel, meterChoices} from './monitoring-view.js';

test('monitoring: simulasi dan fixture manual disembunyikan, kamar manual pengguna dipertahankan', () => {
  const real = {id:'real-room', code:'KMR-01', name:'Kamar 1', source:'manual'};
  const rooms = [real, {id:'sim-room', source:'simulation'}, {id:'6051aefa-df09-4fec-a9bc-1606c5f5f5f9', source:'manual'}];
  const meters = [
    {id:'real', room_id:real.id, kind:'room', source:'manual'},
    {id:'sim', room_id:'sim-room', kind:'room', source:'simulation'},
    {id:'test', room_id:rooms[2].id, kind:'room', source:'manual'},
    {id:'test-main', property_id:'da7a96ec-b738-435e-a617-3a20855edda1', kind:'main', source:'manual'}
  ];
  const catalog={rooms, meters}, visible=monitoringCatalog(catalog);
  assert.deepEqual(visible.rooms,[real]); assert.deepEqual(visible.meters,[meters[0]]);
  assert.equal(catalog.rooms.length,3); assert.equal(catalog.meters.length,4);
  assert.equal(monitoringCatalog(catalog,true),catalog);
});

test('monitoring: nama umum tidak menandai data sebagai uji, arsip pemasangan tetap dapat dibuka', () => {
  assert.equal(isArchivedTestRecord({id:'new',name:'Kost SIMULASI',source:'manual'}),false);
  const catalog={rooms:[],meters:[
    {id:'old',kind:'main',retired_at:'2026-01-01T00:00:00Z'},
    {id:'future',kind:'main',installed_at:'2027-01-01T00:00:00Z'},
    {id:'live',kind:'main',installed_at:'2026-01-01T00:00:00Z'}
  ]};
  assert.deepEqual(monitoringCatalog(catalog,false,Date.parse('2026-10-18')).meters.map(m=>m.id),['live']);
  assert.equal(monitoringCatalog(catalog,true).meters.length,3);
});

test('monitoring: pilihan meter tersembunyi tidak menjadi pilihan efektif atau menampilkan bacaan lama', () => {
  assert.equal(preferredMeter([], 'simulation-meter'),'');
  assert.equal(preferredMeter([{id:'real',kind:'room'}], 'simulation-meter'),'real');
  assert.equal(preferredMeter([{id:'real',kind:'room'}], 'real'),'real');
});

test('monitoring: penanda pembacaan mengikuti data, sumber kosong tidak diklaim hardware', () => {
  assert.match(readingSourceLabel({data_source:'simulation'}),/simulasi/);
  assert.match(readingSourceLabel({data_source:'production'}),/perangkat/);
  assert.match(readingSourceLabel({}),/belum tersedia/);
});

test('operasional: lifecycle meter aktif tanpa menyembunyikan ID fixture di respons katalog',()=>{
  const catalog={rooms:[{id:'6051aefa-df09-4fec-a9bc-1606c5f5f5f9'}],meters:[
    {id:'live',kind:'room',room_id:'6051aefa-df09-4fec-a9bc-1606c5f5f5f9'},
    {id:'retired',kind:'main',retired_at:'2026-01-01T00:00:00Z'},
    {id:'future',kind:'main',installed_at:'2027-01-01T00:00:00Z'}
  ]};
  const active=activeCatalog(catalog,Date.parse('2026-10-18'));
  assert.equal(active.rooms.length,1);assert.deepEqual(active.meters.map(row=>row.id),['live']);
  assert.equal(catalog.meters.length,3);
});

test('pilihan monitoring mencakup meter utama tanpa kamar dan mempertahankan pilihan kamar',()=>{
  const catalog={rooms:[{id:'r2',name:'Kamar 2',code:'KMR-02'},{id:'r1',name:'Kamar 1',code:'KMR-01'}],meters:[
    {id:'k2',kind:'room',room_id:'r2',channel_no:1},{id:'main',kind:'main',room_id:null,communal_load_id:null,channel_no:1},{id:'k1',kind:'room',room_id:'r1',channel_no:1}
  ]};
  const original=structuredClone(catalog),choices=meterChoices(activeCatalog(catalog));
  assert.deepEqual(choices.map(m=>m.id),['main','k1','k2']);
  assert.equal(choices[0].label,'Meter utama');assert.equal(choices[0].room_id,null);
  assert.equal(choices[1].label,'Kamar 1');assert.equal(choices[2].description,'KMR-02');
  assert.equal(preferredMeter(choices,'main'),'main');assert.equal(preferredMeter(choices,'k2'),'k2');
  assert.deepEqual(catalog,original);
});

test('pilihan monitoring tenant hanya berasal dari katalog yang diizinkan API',()=>{
  const choices=meterChoices({rooms:[{id:'own',name:'Kamar 2'}],meters:[{id:'own-meter',kind:'room',room_id:'own'}]});
  assert.equal(choices.length,1);assert.equal(choices[0].label,'Kamar 2');
  assert.ok(choices.every(m=>m.kind==='room'));assert.deepEqual(meterChoices({rooms:[],meters:[]}),[]);
});
