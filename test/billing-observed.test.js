import test from 'node:test';
import assert from 'node:assert/strict';
import {observedPeriodUsage} from '../src/billing-observed.js';

const period={property_id:'property',starts_at:'2026-10-01T00:00:00Z',ends_at:'2026-10-02T00:00:00Z'};
const reading=(id,time,energy,extra={})=>({meter_id:'meter',room_id:'room',room_name:'Kamar 1',room_code:'K1',installed_at:'2026-01-01T00:00:00Z',retired_at:null,source:'manual',id,measured_at:`2026-10-01T${time}Z`,energy_kwh:energy,counter_epoch:0,quality:'valid',data_source:'production',...extra});
const run=rows=>observedPeriodUsage({query:async()=>({rows})},period);

test('billing observed: pemakaian tersimpan bertahan saat offline, gap tidak menghapus interval valid',async()=>{
 const result=await run([reading('1','01:00:00','100'),reading('2','01:01:00','100.2'),reading('3','05:00:00','105'),reading('4','05:01:00','105.3')]);
 assert.equal(result.observed_consumption_kwh,'0.500000000');assert.equal(result.sample_count,4);
 assert.equal(result.rooms[0].status,'partial');assert.ok(result.rooms[0].reasons.includes('gap'));
 assert.equal(result.last_measured_at,'2026-10-01T05:01:00Z');
 assert.equal((await run([reading('1','01:00:00','100'),reading('2','01:01:00','100.2'),reading('3','05:00:00','105'),reading('4','05:01:00','105.3')])).observed_consumption_kwh,result.observed_consumption_kwh);
});
test('billing observed: tidak ada data/satu sampel bukan nol; counter tetap adalah nol yang terukur',async()=>{
 assert.equal((await run([])).observed_consumption_kwh,null);
 assert.equal((await run([reading('1','01:00:00','100')])).observed_consumption_kwh,null);
 assert.equal((await run([reading('1','01:00:00','100'),reading('2','01:01:00','100')])).observed_consumption_kwh,'0.000000000');
});
test('billing observed: reset, penurunan counter, invalid dan waktu ambigu tidak menjadi energi palsu',async()=>{
 for(const changes of [{counter_epoch:1},{energy_kwh:'1'},{quality:'invalid'},{measured_at:'2026-10-01T01:00:00Z'}]){
  const result=await run([reading('1','01:00:00','100'),reading('2','01:01:00','101',changes)]);
  assert.equal(result.observed_consumption_kwh,null);
 }
 const rows=[reading('1','01:00:00','100'),reading('2','01:01:00','100.1'),reading('3','01:00:00','5',{meter_id:'meter2',room_id:'room2',data_source:'simulation'}),reading('4','01:01:00','5.2',{meter_id:'meter2',room_id:'room2',data_source:'simulation'})];
 const result=await run(rows);assert.equal(result.observed_consumption_kwh,'0.300000000');assert.equal(result.rooms[1].data_source,'simulation');
});
