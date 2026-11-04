import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

test('rincian final menampilkan bukti meter, jam WIB, tarif tepat dan pergantian meter tanpa menggabungkan counter',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
 try{
  const {TenantBillDrawer}=await server.ssrLoadModule('/tenant-billing.jsx');
  const share={period_starts_at:'2026-10-30T08:50:00Z',period_ends_at:'2026-10-30T09:00:00Z',room_energy_kwh:'0.010000000',attributable_energy_kwh:'0',shared_energy_kwh:'0',shared_cost_rp:'0',
   tariff_snapshot:{energy_rate_rp_kwh:'1444.700000000000'},rounding_adjustment_rp:'0',total_cost_rp:'14',payment_status:'unpaid',
   meter_segments:[{segment_starts_at:'2026-10-30T08:50:00Z',start_energy_kwh:'0.054000000',end_energy_kwh:'0.064000000',measured_starts_at:'2026-10-30T08:50:00.061Z',measured_ends_at:'2026-10-30T08:59:00.074Z'}]};
  const render=s=>renderToStaticMarkup(React.createElement(TenantBillDrawer,{share:s,name:'Kamar contoh',close(){}})).replace(/<[^>]*>/g,'').replace(/\s+/g,' ');
  const text=render(share);assert.ok(text.includes('54 Wh'));assert.ok(text.includes('64 Wh'));
  assert.ok(text.includes('15.50.00 WIB'));assert.ok(text.includes('16.00.00 WIB'));assert.ok(text.includes('15.59.00 WIB'));
  assert.ok(text.includes('Rp1.444,70 / kWh'));assert.equal(text.includes('1.445'),false);assert.match(text,/Rp\s*14 setelah pembulatan/);
  assert.ok(text.includes('10 Wh ÷ 1.000 × Rp1.444,70 / kWh'));
  assert.ok(text.includes('Alokasi RFID0 Wh'));assert.ok(text.includes('Bagian komunal bersama0 Wh'));
  const small=render({...share,attributable_energy_kwh:'0.000200000',shared_energy_kwh:'0.000050000'});
  assert.ok(small.includes('Alokasi RFID0,2 Wh'));assert.ok(small.includes('Bagian komunal bersama0,05 Wh'));
  const absent=render({...share,meter_segments:[]});assert.equal((absent.match(/Belum tersedia/g)||[]).length,2);
  const zero=render({...share,meter_segments:[{start_energy_kwh:'0.000000000',end_energy_kwh:'0.000000000'}]});assert.equal(zero.includes('Belum tersedia'),false);assert.ok(zero.includes('0 Wh'));
  const replaced=render({...share,meter_segments:[{segment_starts_at:'2026-10-01Z',start_energy_kwh:'100',end_energy_kwh:'112'},{segment_starts_at:'2026-10-15Z',start_energy_kwh:'0.001',end_energy_kwh:'0.006'}]});
  assert.equal((replaced.match(/Segmen 1/g)||[]).length,2);assert.equal((replaced.match(/Segmen 2/g)||[]).length,2);
  assert.ok(replaced.includes('100.000 Wh')&&replaced.includes('1 Wh')&&replaced.includes('112.000 Wh')&&replaced.includes('6 Wh'));
 }finally{await server.close();}
});
