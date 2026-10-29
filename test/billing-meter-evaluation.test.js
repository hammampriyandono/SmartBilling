import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateReadings} from '../src/billing-meter-evaluation.js';
import {calculationPolicy, defaultCalculationPolicy, previewTariff} from '../src/billing-policy.js';
const start = '2026-10-28T08:00:00Z', end = '2026-10-28T08:02:00Z';
const row = (seconds, energy, extra = {}) => ({id: String(seconds), measured_at: new Date(Date.parse(start) + seconds * 1000).toISOString(), energy_kwh: energy, counter_epoch: 0, quality: 'valid', ...extra});
const evaluate = rows => evaluateReadings(rows, start, end, defaultCalculationPolicy);

test('billing batas dalam periode: waktu ESP berbeda, delta presisi dan bukti sampel aktual', () => {
  const result = evaluate([row(-5,'9'),row(13,'10.000000001'),row(73,'10.001000002'),row(115,'10.003000003'),row(125,'90')]);
  assert.equal(result.status,'valid'); assert.equal(result.energy_kwh,'0.003000002');
  assert.equal(result.evidence.start_offset_seconds,13); assert.equal(result.evidence.end_offset_seconds,5);
  assert.equal(result.start_reading_id,'13'); assert.equal(result.end_reading_id,'115');
  assert.equal(result.evidence.sample_count,3);
  assert.equal(evaluate([row(17,'1'),row(77,'1.01')]).status,'valid');
});

test('billing data kosong, satu sampel, batas hilang dan interval nol tetap dibedakan', () => {
  assert.equal(evaluate([]).reason,'no_data');
  assert.equal(evaluate([row(60,'1')]).reason,'insufficient_samples');
  assert.equal(evaluate([row(61,'1'),row(119,'2')]).reason,'missing_start_boundary');
  assert.equal(evaluate([row(1,'1'),row(59,'2')]).reason,'missing_end_boundary');
  assert.equal(evaluate([row(5,'1'),row(115,'1')]).energy_kwh,'0.000000000');
  assert.equal(evaluateReadings([row(0,'1'),row(120,'2')],start,end,{}).reason,'gap_policy_unset');
  assert.equal(evaluateReadings([row(1,'1'),row(120,'2')],start,end,{...defaultCalculationPolicy,boundary_method:'exact'}).reason,'missing_start_boundary');
});

test('billing toleransi tidak menghapus gap, reset, penurunan, duplikasi atau kualitas invalid', () => {
  for (const [rows,reason,policy] of [
    [[row(5,'1'),row(115,'2')],'gap',{...defaultCalculationPolicy,production_max_gap_seconds:60}],
    [[row(5,'1'),row(65,'0', {counter_epoch:1}),row(115,'1')],'counter_reset'],
    [[row(5,'1'),row(65,'0.5'),row(115,'2')],'counter_decreased'],
    [[row(5,'1'),row(65,'1.5'),row(65,'1.5'),row(115,'2')],'ambiguous_timestamp'],
    [[row(5,'1'),row(65,'1.5',{quality:'invalid'}),row(115,'2')],'invalid_quality'],
  ]) {
    const result = evaluateReadings(rows,start,end,policy||defaultCalculationPolicy);
    assert.equal(result.reason,reason);assert.equal(result.energy_kwh,null);
  }
});

test('validasi kebijakan dan tarif pratinjau membatasi perubahan eksplisit', () => {
  assert.deepEqual(calculationPolicy(),defaultCalculationPolicy);
  for(const change of [{production_max_gap_seconds:null},{production_max_gap_seconds:3601},{boundary_tolerance_seconds:181},{boundary_method:'outside'},{boundary_method:'exact',boundary_tolerance_seconds:1},{extra:true}])assert.throws(()=>calculationPolicy({...defaultCalculationPolicy,...change}),/invalid_calculation_policy/);
  assert.deepEqual(previewTariff({energy_rate_rp_kwh:'1444.70',source_reference:' Asumsi uji '}),{energy_rate_rp_kwh:'1444.70',source_reference:'Asumsi uji'});
  for(const value of [{energy_rate_rp_kwh:'0',source_reference:'x'},{energy_rate_rp_kwh:'Infinity',source_reference:'x'},{energy_rate_rp_kwh:'1',source_reference:''}])assert.throws(()=>previewTariff(value),/invalid_preview_tariff/);
});
