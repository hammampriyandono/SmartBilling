import React, {useState} from 'react';
import {estimateRate, kwh, periodTime, reasonLabel} from './billing-data.js';
import {policyFormBody, policyFormValues} from './billing-policy-data.js';

export function CalculationRules({period}) {
  const policy = period.policy_snapshot || {};
  return <div className="billing-rules">
    <strong>Aturan pembacaan periode</strong>
    <p>Jeda maksimum: {policy.production_max_gap_seconds == null ? 'belum ditetapkan' : `${policy.production_max_gap_seconds} detik`}. Batas: {policy.boundary_method === 'inside' ? `sampel di dalam periode, toleransi ${policy.boundary_tolerance_seconds} detik per sisi` : 'harus tepat pada waktu awal dan akhir'}.</p>
    {policy.boundary_method === 'inside' && <p>Energi memakai selisih counter antara sampel terpilih. Bagian waktu di tepi periode tidak diperkirakan. Waktu ukur tiap meter dapat berbeda; selisih meter utama dan kamar perlu dibaca bersama bukti waktunya.</p>}
    {policy.preview_tariff && <p className="billing-review"><strong>Pratinjau uji · tarif asumsi {estimateRate(policy.preview_tariff.energy_rate_rp_kwh)}.</strong> {policy.preview_tariff.source_reference}. Hasil ini tidak dapat difinalisasi dan tidak menjadi tagihan tenant.</p>}
  </div>;
}

export function MeterEvidence({segments = [], title = 'Bukti pembacaan meter'}) {
  return <section className="billing-evidence"><h3>{title}</h3>{!segments.length ? <p>Belum ada bukti pembacaan. Hitung ulang periode untuk memuatnya.</p> : segments.map(segment => {
    const evidence = segment.calculation_evidence || {};
    return <article key={segment.id}>
      <strong>{segment.meter_kind === 'main' ? 'Meter utama' : segment.meter_kind === 'communal' ? 'Meter fasilitas' : 'Meter kamar'}</strong>
      <dl><dt>Counter awal</dt><dd>{kwh(segment.start_energy_kwh)}<small>{periodTime(evidence.measured_starts_at)}</small></dd>
        <dt>Counter akhir</dt><dd>{kwh(segment.end_energy_kwh)}<small>{periodTime(evidence.measured_ends_at)}</small></dd>
        <dt>Selisih counter</dt><dd>{kwh(segment.consumption_kwh)}</dd>
        <dt>Sampel tersimpan</dt><dd>{evidence.sample_count ?? 'Belum tersedia'}</dd>
        <dt>Waktu tepi yang tidak dihitung</dt><dd>{evidence.start_offset_seconds == null ? 'Belum tersedia' : `Awal ${evidence.start_offset_seconds} detik · akhir ${evidence.end_offset_seconds} detik`}</dd>
      </dl>{segment.reason && <p className="billing-review">{reasonLabel(segment.reason)}</p>}
    </article>;
  })}</section>;
}

export function BillingPeriodForm({form, property, busy, close, submit}) {
  const period = form.period, editing = Boolean(period);
  const [values, setValues] = useState({...policyFormValues(period), starts_at: '', ends_at: '', reason: ''});
  const [error, setError] = useState('');
  const change = (key, value) => setValues(current => ({...current, [key]: value}));
  const number = (key, label, max, min = 0) => <label>{label}<input required type="number" step="1" min={min} max={max} value={values[key]} onChange={event => change(key, event.target.value)}/></label>;
  function save(event) {
    event.preventDefault(); setError('');
    try {
      const body = {...policyFormBody(values), reason: values.reason};
      if (editing) submit(`/api/owner/billing-periods/${period.id}/policy`, {...body, row_version: period.row_version});
      else {
        const start = new Date(values.starts_at), end = new Date(values.ends_at);
        if (!(end > start)) throw new Error('invalid_period');
        submit('/api/owner/billing-periods', {...body, property_id: property, starts_at: start.toISOString(), ends_at: end.toISOString()});
      }
    } catch (error) {
      setError(error.message === 'invalid_period' ? 'Akhir periode harus setelah awal periode.' : error.message === 'invalid_preview_tariff' ? 'Isi tarif asumsi positif dan sumbernya.' : 'Periksa batas jeda dan toleransi. Toleransi maksimal 300 detik dan tidak melebihi jeda maksimum.');
    }
  }
  return <div className="billing-modal" role="dialog" aria-modal="true" aria-labelledby="period-form-title"><form onSubmit={save}>
    <div><h2 id="period-form-title">{editing ? 'Atur perhitungan periode' : 'Buat periode tagihan'}</h2><button type="button" onClick={close}>Tutup</button></div>
    {editing ? <p>{periodTime(period.starts_at)} — {periodTime(period.ends_at)}. Menyimpan aturan mengosongkan hasil pratinjau lama. Jalankan Hitung ulang setelahnya.</p> : <>
      <label>Awal periode<input required type="datetime-local" step="1" value={values.starts_at} onChange={event => change('starts_at', event.target.value)}/></label>
      <label>Akhir periode<input required type="datetime-local" step="1" value={values.ends_at} onChange={event => change('ends_at', event.target.value)}/></label>
    </>}
    {number('production_max_gap_seconds', 'Jeda maksimum antarsampel (detik)', 3600, 1)}
    <label>Pemilihan batas<select value={values.boundary_method} onChange={event => change('boundary_method', event.target.value)}><option value="inside">Sampel terdekat di dalam periode</option><option value="exact">Sampel tepat pada awal dan akhir</option></select></label>
    {values.boundary_method === 'inside' && number('boundary_tolerance_seconds', 'Toleransi awal dan akhir (detik)', Math.min(300, Number(values.production_max_gap_seconds)))}
    <p>Tidak ada interpolasi atau pengisian data kosong. Jeda di atas ambang, kualitas invalid, dan counter reset tetap perlu ditinjau.</p>
    <label className="billing-checkbox"><input type="checkbox" checked={values.use_preview} onChange={event => change('use_preview', event.target.checked)}/> Gunakan tarif khusus pratinjau uji</label>
    {values.use_preview ? <>
      <p className="billing-review">Tarif asumsi hanya berlaku untuk periode ini. Tidak mengubah jadwal tarif dan tidak dapat difinalisasi.</p>
      <label>Tarif asumsi Rp/kWh<input type="number" required min="0.000000000001" step="0.000000000001" value={values.rate} onChange={event => change('rate', event.target.value)}/></label>
      <label>Sumber/asumsi tarif<input required maxLength="240" value={values.reference} onChange={event => change('reference', event.target.value)}/></label>
    </> : <p>Perhitungan memakai satu jadwal tarif aktif yang mencakup seluruh periode. Tambahkan tarif operasional bila belum ada.</p>}
    <label>Alasan pencatatan<input required maxLength="500" value={values.reason} onChange={event => change('reason', event.target.value)}/></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button disabled={busy}>{busy ? 'Menyimpan…' : editing ? 'Simpan aturan' : 'Simpan periode'}</button>
  </form></div>;
}
