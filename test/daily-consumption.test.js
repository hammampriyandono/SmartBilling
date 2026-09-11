import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyConsumption } from '../src/daily-consumption.js';
const day = { date: '2026-09-11', starts_at: '2026-09-10T17:00:00Z', ends_at: '2026-09-11T17:00:00Z' };
function reading(seconds, energy = '1.000000001', epoch = 0) {
  return { measured_at: new Date(Date.parse(day.starts_at) + seconds * 1000), energy_kwh: energy, counter_epoch: epoch, quality: 'valid' };
}
const calculate = (rows) => dailyConsumption([day], rows, 120)[0];
test('hari lengkap memakai delta presisi desimal, termasuk counter nol konsumsi', () => {
  const rows = Array.from({ length: 1441 }, (_, i) => reading(i * 60, i === 1440 ? '1.000000002' : '1.000000001'));
  const result = calculate(rows);
  assert.equal(result.status, 'complete');
  assert.equal(result.consumption_kwh, '0.000000001');
  assert.equal(result.coverage_seconds, 86400);
});
test('data kosong, batas hilang dan gap tidak menjadi total nol', () => {
  assert.equal(calculate([]).consumption_kwh, null);
  assert.equal(calculate([]).observed_consumption_kwh, null);
  assert.equal(calculate([reading(0), reading(86400, '10')]).observed_consumption_kwh, null);
  const partial = calculate([reading(60, '1'), reading(120, '2')]);
  assert.equal(partial.consumption_kwh, null);
  assert.equal(partial.observed_consumption_kwh, '1.000000000');
});
test('reset, rebound counter turun dan timestamp ambigu tidak menghasilkan lonjakan palsu', () => {
  const reset = calculate([reading(0, '100'), reading(60, '0', 1), reading(120, '1', 1)]);
  assert.equal(reset.observed_consumption_kwh, '1.000000000');
  assert.ok(reset.reasons.includes('counter_reset'));
  const rebound = calculate([reading(0, '100'), reading(60, '0'), reading(120, '101')]);
  assert.equal(rebound.observed_consumption_kwh, null);
  const ambiguous = calculate([reading(0, '0'), reading(60, '1'), reading(60, '3'), reading(120, '4')]);
  assert.equal(ambiguous.observed_consumption_kwh, null);
});
test('hari DST mengikuti batas yang diberikan dan kualitas invalid memutus interval', () => {
  const shortDay = { date: '2026-03-08', starts_at: '2026-03-08T05:00:00Z', ends_at: '2026-03-09T04:00:00Z' };
  const rows = Array.from({ length: 1381 }, (_, index) => ({
    measured_at: new Date(Date.parse(shortDay.starts_at) + index * 60000),
    energy_kwh: '10.000000000', quality: 'valid', counter_epoch: 0,
  }));
  const complete = dailyConsumption([shortDay], rows, 120)[0];
  assert.equal(complete.expected_seconds, 82800);
  assert.equal(complete.consumption_kwh, '0.000000000');
  rows[10].quality = 'suspect';
  const partial = dailyConsumption([shortDay], rows, 120)[0];
  assert.equal(partial.consumption_kwh, null);
  assert.equal(partial.coverage_seconds, 82680);
});
