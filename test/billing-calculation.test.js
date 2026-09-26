import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {calculateFixtureCase,energyCost,roundHalfUp,largestRemainder} from '../src/billing-calculation.js';
const fixture=JSON.parse(await readFile(new URL('./fixtures/billing-calculation-v1.json',import.meta.url)));
test('billing pure: fixture valid, meter replacement, simulation dan RFID',()=>{
 for(const id of ['room-valid-main-missing','empty-room-owner-unassigned','meter-replacement-complete','single-participant-rfid-valid','simulation-preview-not-final']){
  const c=fixture.cases.find(x=>x.id===id),actual=calculateFixtureCase(c,fixture.temporary_policy);
  for(const key of Object.keys(actual))assert.deepEqual(actual[key],c.expected[key],`${id}.${key}`);
 }
});
test('billing pure: invalid boundary tidak menjadi nol',()=>{
 const c=fixture.cases.find(x=>x.id==='meter-replacement-incomplete'),actual=calculateFixtureCase(c,fixture.temporary_policy);
 assert.equal(actual.room_bill_status,'review');assert.equal(actual.room_energy_kwh,null);assert.equal(actual.room_cost_rp,null);
});
test('billing pure: Rupiah half-up dan largest remainder deterministik',()=>{
 assert.equal(roundHalfUp(energyCost('12.345000000','1500.000000000000')),18518n);
 const c=fixture.cases.find(x=>x.id==='largest-remainder-tie-break');
 assert.deepEqual(largestRemainder(c.input.unrounded_shares,c.input.rounded_total_rp),c.expected.shares);
});
