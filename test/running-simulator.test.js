import test from 'node:test';
import assert from 'node:assert/strict';
import { nextCheckpoint, confirmMessage, runningMeter } from '../src/running-simulator.js';
import { parseSensor, sameReading } from '../src/sensor-message.js';
import { runningTopic } from '../src/running-simulator.js';

const boot1='a0500000-0000-4000-8000-000000000101', boot2='a0500000-0000-4000-8000-000000000102';
test('simulator berjalan: integrasi daya eksak, waktu aktual, restart boot baru tanpa reset energi', () => {
  const first=nextCheckpoint({last:null},boot1,0,Date.parse('2026-09-15T00:00:00Z'));
  assert.equal(first.last.power_w,60); assert.equal(first.last.energy_kwh,'0.000000000');
  const second=nextCheckpoint(first,boot1,1,Date.parse('2026-09-15T00:01:00Z'));
  assert.equal(second.last.energy_kwh,'0.001000000'); assert.equal(second.last.power_w,120);
  const restart=nextCheckpoint(second,boot2,0,Date.parse('2026-09-15T00:04:00Z'));
  assert.equal(restart.last.energy_kwh,'0.007000000'); assert.equal(restart.last.counter_epoch,0);
  assert.notEqual(restart.last.boot_id,second.last.boot_id);
  assert.throws(()=>nextCheckpoint(second,boot2,0,Date.parse('2026-09-15T00:00:00Z')),/Clock/);
  assert.notEqual(runningMeter,'00000000-0000-4000-8000-000000000005');
});
test('simulator berjalan: sisa nano-kWh dipertahankan lintas checkpoint', () => {
  const first=nextCheckpoint({last:null},boot1,0,Date.parse('2026-09-15T00:00:00Z'));
  const second=nextCheckpoint(first,boot1,1,Date.parse(first.last.measured_at)+1);
  assert.equal(second.remainder,'12'); assert.equal(second.last.energy_kwh,'0.000000016');
  const third=nextCheckpoint(second,boot2,0,Date.parse(second.last.measured_at)+1);
  assert.equal(third.last.energy_kwh,'0.000000050'); assert.equal(third.remainder,'0');
});
test('simulator berjalan: replay checkpoint memakai byte identik, konfirmasi membaca isi DB', async () => {
  const pending=nextCheckpoint({last:null},boot1,0,Date.parse('2026-09-15T00:00:00Z'));
  const bytes=JSON.stringify(pending.last), sent=[];
  const client={publishAsync:async (topic,payload)=>{assert.equal(topic,runningTopic); sent.push(payload);}};
  const normalized=parseSensor(runningTopic,Buffer.from(bytes)).reading;
  const db={query:async sql=>sql.startsWith('SELECT') ? {rowCount:1,rows:[normalized]} : {rowCount:1}};
  const confirmed=await confirmMessage(db,client,pending,new AbortController().signal);
  await confirmMessage(db,client,pending,new AbortController().signal);
  assert.deepEqual(sent,[bytes,bytes]); assert.equal(confirmed.pending,false);
  assert.ok(sameReading(normalized,confirmed.last) === false); // raw numeric fields differ; canonical check is required.
  const conflicting={query:async ()=>({rowCount:1,rows:[{...normalized,energy_kwh:'9.000000000'}]})};
  await assert.rejects(confirmMessage(conflicting,client,pending,new AbortController().signal),/Konflik/);
});
