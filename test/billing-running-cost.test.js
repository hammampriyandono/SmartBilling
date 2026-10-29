import test from 'node:test';
import assert from 'node:assert/strict';
import {runningRoomCosts} from '../src/billing-running-cost.js';

const interval=(start,end,energy)=>({starts_at:`2026-10-01T${start}Z`,ends_at:`2026-10-01T${end}Z`,energy_kwh:energy});
const occupancy=(id,extra={})=>({id,room_id:'r',user_id:id,tenant_name:id,source:'manual',starts_at:'2026-01-01Z',ends_at:null,...extra});
const room=(intervals,energy='1')=>({room_id:'r',observed_consumption_kwh:energy,intervals});
const tariff=(rate,extra={})=>({id:'tariff',source:'manual',source_reference:'Fixture',energy_rate_rp_kwh:rate,valid_from:'2026-01-01Z',valid_until:null,...extra});

test('running cost: default expo dan jadwal properti menggunakan angka presisi di backend',()=>{
 const rooms=[room([interval('01:00:00','01:01:00','1')])];
 let result=runningRoomCosts(rooms,[],[occupancy('tenant')]);
 assert.equal(result.cost_estimate.estimated_cost_rp,'1445');assert.equal(result.rooms[0].allocations[0].estimated_cost_rp,'1445');
 assert.equal(result.cost_estimate.pricing[0].kind,'expo_default');
 result=runningRoomCosts(rooms,[tariff('9007199254740993')],[occupancy('tenant')]);
 assert.equal(result.cost_estimate.estimated_cost_rp,'9007199254740993');
 assert.equal(result.cost_estimate.pricing[0].kind,'tariff_schedule');
});
test('running cost: pergantian tarif mengikuti interval, pembulatan bagian tetap sama dengan kamar',()=>{
 const intervals=[interval('01:00:00','01:01:00','0.005'),interval('01:01:00','01:02:00','0.005')];
 const result=runningRoomCosts([room(intervals,'0.01')],[tariff('100',{valid_until:intervals[0].ends_at}),tariff('200',{id:'next',valid_from:intervals[1].starts_at})],
 [occupancy('a',{ends_at:intervals[0].ends_at}),occupancy('b',{starts_at:intervals[1].starts_at})]);
 assert.equal(result.rooms[0].estimated_cost_rp,'2');assert.equal(result.rooms[0].allocations.reduce((sum,part)=>sum+BigInt(part.estimated_cost_rp),0n),2n);
 assert.equal(result.rooms[0].allocations.reduce((sum,part)=>sum+Number(part.energy_kwh),0),0.01);
});
test('running cost: gap tarif, tarif overlap dan tarif invalid tidak diganti harga expo diam-diam',()=>{
 const rows=[room([interval('01:00:00','01:01:00','1')])];
 for(const tariffs of [[tariff('100',{valid_from:'2026-10-01T01:00:30Z'})],[tariff('100'),tariff('200',{id:'overlap'})],[tariff('0')],[tariff('100',{retired_at:'2026-10-01Z'})]]){
  const result=runningRoomCosts(rows,tariffs,[occupancy('a')]);assert.equal(result.cost_estimate.estimated_cost_rp,null);assert.equal(result.rooms[0].allocations[0].estimated_cost_rp,null);
 }
});
test('running cost: kamar kosong owner, penghuni tumpang tindih/perubahan di tengah interval pending',()=>{
 const rows=[room([interval('01:00:00','01:01:00','1')])];
 assert.equal(runningRoomCosts(rows).rooms[0].allocations[0].kind,'owner_unassigned');
 for(const occupants of [[occupancy('a'),occupancy('b')],[occupancy('a',{starts_at:'2026-10-01T01:00:30Z'})],[occupancy('a',{source:'simulation'})]]){
  const result=runningRoomCosts(rows,[],occupants);assert.equal(result.rooms[0].allocations.length,1);assert.equal(result.rooms[0].allocations[0].kind,'pending');assert.equal(result.rooms[0].allocations[0].tenant_id,null);
 }
});
test('running cost: kosong/null tetap unavailable, nol yang terukur tetap nol',()=>{
 assert.equal(runningRoomCosts([room([],null)]).cost_estimate.estimated_cost_rp,null);
 const result=runningRoomCosts([room([interval('01:00:00','01:01:00','0')],'0')],[],[occupancy('a')]);
 assert.equal(result.cost_estimate.estimated_cost_rp,'0');assert.equal(result.rooms[0].allocations[0].estimated_cost_rp,'0');
});
