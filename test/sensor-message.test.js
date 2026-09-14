import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSensor, Rejection, sameReading } from '../src/sensor-message.js';
import { dataset, demoTopic } from '../src/simulation.js';
const input = dataset('2026-09-12')[0];
const parse = (value) => parseSensor(demoTopic, Buffer.from(JSON.stringify(value))).reading;
test('kontrak sensor: normalisasi energi, identitas, waktu dan null', () => {
  const r = parse({ ...input, energy_kwh: '12.3', power_w: null });
  assert.equal(r.energy_kwh, '12.300000000');
  assert.equal(r.power_w, null);
  assert.ok(sameReading(r, parse({ ...input, energy_kwh: '12.300000000', power_w: undefined })));
  assert.ok(!sameReading(r, parse({ ...input, energy_kwh: '12.300000001', power_w: null })));
});
test('kontrak sensor: invalid ditolak sebelum database', () => {
  for (const value of [null, [], 1, { ...input, schema_version: 2 }, { ...input, sequence_no: -1 },
    { ...input, sequence_no: Number.MAX_SAFE_INTEGER + 1 }, { ...input, energy_kwh: 12 },
    { ...input, energy_kwh: '-1' }, { ...input, energy_kwh: '1.0000000001' },
    { ...input, voltage_v: '220' }, { ...input, power_factor: 1.01 }, { ...input, current_a: -1 },
    { ...input, measured_at: '2026-02-30T00:00:00Z' }, { ...input, unknown: 'field' }]) {
    assert.throws(() => parse(value), Rejection);
  }
  assert.throws(() => parseSensor(demoTopic, Buffer.from('{')), Rejection);
  assert.throws(() => parseSensor(demoTopic, Buffer.alloc(4097)), Rejection);
  assert.throws(() => parseSensor(demoTopic, Buffer.from(JSON.stringify(input)), { retain: true }), Rejection);
  assert.throws(() => parseSensor(demoTopic, Buffer.from(JSON.stringify(input)), { qos: 0 }), Rejection);
  assert.throws(() => parseSensor('rumah/kamar/kamar2/telemetry', Buffer.from(JSON.stringify(input))), Rejection);
});
test('simulator counter berlanjut antarhari; batas bersama memiliki identitas sama', () => {
  const first = dataset('2026-09-11');
  const second = dataset('2026-09-12');
  assert.deepEqual(first.at(-1), second[0]);
  assert.equal(BigInt(second.at(-1).energy_kwh.replace('.', '')) - BigInt(second[0].energy_kwh.replace('.', '')), 1440000000n);
});
