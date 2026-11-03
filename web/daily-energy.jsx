import React from 'react';
import {BarChart, Bar, LabelList, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip} from 'recharts';
import {decimal} from './data.js';

const shortDate = new Intl.DateTimeFormat('id-ID', {day:'numeric', month:'short', timeZone:'UTC'});
const formatDate = value => shortDate.format(new Date(value));
const zeroLabel = value => value === 0 ? '0' : '';
const statuses = {complete:'Lengkap', partial:'Parsial', no_data:'Tanpa data'};
const reasons = {
  missing_start_boundary:'Batas awal tidak tersedia', missing_end_boundary:'Batas akhir tidak tersedia',
  gap:'Jeda pembacaan', counter_reset:'Counter direset', no_data:'Belum ada sampel',
  invalid_quality:'Kualitas tidak valid', counter_decreased:'Counter menurun',
  ambiguous_timestamp:'Waktu pengukuran ambigu', access_limited:'Dibatasi masa tinggal',
};
const fullDate = new Intl.DateTimeFormat('id-ID', {dateStyle:'medium', timeZone:'UTC'});

export function DailyEnergyChart({days}) {
  const rows = days.map(day => ({
    date: day.date,
    total: day.status === 'complete' && day.consumption_kwh != null ? Number(day.consumption_kwh) : null,
    subtotal: day.status === 'partial' && day.observed_consumption_kwh != null ? Number(day.observed_consumption_kwh) : null,
  }));
  if (!rows.some(row => row.total !== null || row.subtotal !== null)) return <div className="empty chart-placeholder">Belum ada konsumsi terukur pada rentang ini.</div>;
  return <div className="chart" role="img" aria-label="Grafik konsumsi harian dalam kWh. Nilai lengkap dan subtotal parsial tersedia di rincian harian.">
    <ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{top:20,right:16,bottom:8,left:0}} barCategoryGap="32%">
      <CartesianGrid vertical={false} stroke="var(--sb-line)"/><XAxis dataKey="date" tickFormatter={formatDate} minTickGap={22} tick={{fontSize:11}}/>
      <YAxis width={48} tick={{fontSize:11}}/><Tooltip itemStyle={{color:'var(--sb-ink)'}} labelFormatter={formatDate} formatter={(v, name) => [`${decimal(v,9)} kWh`, name]}/>
      <Bar dataKey="total" name="Total lengkap" stackId="daily" fill="var(--sb-chart-total)" maxBarSize={34} radius={[4,4,0,0]} isAnimationActive={false}>
        <LabelList dataKey="total" formatter={zeroLabel} position="top" fontSize={10}/>
      </Bar>
      <Bar dataKey="subtotal" name="Subtotal parsial" stackId="daily" fill="var(--sb-chart-partial)" stroke="var(--sb-warn)" strokeWidth={0.75} maxBarSize={34} radius={[4,4,0,0]} isAnimationActive={false}>
        <LabelList dataKey="subtotal" formatter={zeroLabel} position="top" fontSize={10} fill="var(--sb-warn)"/>
      </Bar>
    </BarChart></ResponsiveContainer>
  </div>;
}

export function DailyEnergyDetails({daily, loading}) {
  return <details className="panel daily-panel"><summary>Rincian konsumsi per hari</summary>
    {daily?.meta.access_limited && <p className="daily-access">Data hanya mencakup masa tinggal Anda. {daily.data.length === 0 && 'Tidak ada masa tinggal yang dapat diakses pada rentang ini.'}</p>}
    {daily ? <div className="table-scroll"><table className="billing-table">
      <thead><tr><th>Tanggal</th><th>Total (kWh)</th><th>Subtotal valid (kWh)</th><th>Cakupan</th><th>Status</th></tr></thead>
      <tbody>{daily.data.map(day => {
        const coverage = 100 * day.coverage_seconds / day.expected_seconds;
        return <tr key={day.date}>
          <td data-label="Tanggal">{fullDate.format(new Date(day.date))}</td>
          <td data-label="Total (kWh)" title={day.consumption_kwh ?? ''}>{decimal(day.consumption_kwh,9)}</td>
          <td data-label="Subtotal valid (kWh)" title={day.observed_consumption_kwh ?? ''}>{decimal(day.observed_consumption_kwh,9)}</td>
          <td data-label="Cakupan"><div className="coverage"><span style={{width:`${coverage}%`}}/></div><small>{decimal(coverage,1)}% · {day.sample_count} sampel</small></td>
          <td data-label="Status"><span className={`pill ${day.status === 'complete' ? 'green' : day.status === 'partial' ? 'amber' : ''}`}>{statuses[day.status] || day.status}</span>
            {day.reasons.length > 0 && <small className="reason">{day.reasons.map(r => reasons[r] || r.replaceAll('_',' ')).join(' · ')}</small>}
          </td>
        </tr>;
      })}</tbody>
    </table></div> : <div className="empty">{loading ? 'Memuat konsumsi harian…' : 'Konsumsi harian belum tersedia.'}</div>}
    <div className="panel-foot">Total harian tersedia saat data lengkap. Untuk hari dengan data parsial, hanya pemakaian yang terukur ditampilkan.</div>
  </details>;
}
