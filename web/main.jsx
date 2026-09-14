import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { allPages, getJson, shiftDate, todayIn, validRange, chartRows, decimal } from './data.js';
import './style.css';

const statuses = { complete: 'Lengkap', partial: 'Parsial', no_data: 'Tanpa data' };
const reasons = { missing_start_boundary: 'Batas awal tidak tersedia', missing_end_boundary: 'Batas akhir tidak tersedia', gap: 'Jeda pembacaan', counter_reset: 'Counter direset', no_data: 'Belum ada sampel', invalid_quality: 'Kualitas tidak valid', counter_decreased: 'Counter menurun', ambiguous_timestamp: 'Waktu pengukuran ambigu' };
const formatTime = (value, zone) => value ? new Intl.DateTimeFormat('id-ID', { timeZone: zone, dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value)) : 'Belum tersedia';
function ErrorNotice({ text, retry }) { return text && <div className="error" role="alert">{text} {retry && <button onClick={retry}>Coba lagi</button>}</div>; }

function App() {
  const [catalog, setCatalog] = useState({ rooms: [], meters: [] });
  const [catalogError, setCatalogError] = useState(''), [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogVersion, setCatalogVersion] = useState(0), [meterId, setMeterId] = useState('');
  const [refresh, setRefresh] = useState(0), [zone, setZone] = useState('Asia/Jakarta');
  const [range, setRange] = useState(() => ({ from: shiftDate(todayIn('Asia/Jakarta'), -6), to: todayIn('Asia/Jakarta') }));
  const [draft, setDraft] = useState(range), [rangeError, setRangeError] = useState('');
  const [latest, setLatest] = useState({ loading: true, data: null }), [health, setHealth] = useState(null);
  const [history, setHistory] = useState({ loading: true, data: null, progress: '' });
  const [revision, setRevision] = useState(0), [now, setNow] = useState(Date.now());
  const lastIdentity = useRef(null);
  const selected = catalog.meters.find(m => m.id === meterId);
  const roomFor = (meter) => catalog.rooms.find(r => r.id === meter?.room_id);
  const labelFor = (meter) => meter.kind === 'room' ? (roomFor(meter)?.name || roomFor(meter)?.code || 'Meter kamar') : meter.kind === 'main' ? 'Meter utama' : 'Meter komunal';

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true); setCatalogError('');
    Promise.all([allPages('/api/rooms', 'next_after', controller.signal), allPages('/api/meters', 'next_after', controller.signal)])
      .then(([rooms, meters]) => {
        if (controller.signal.aborted) return;
        setCatalog({ rooms: rooms.rows, meters: meters.rows });
        setMeterId(current => meters.rows.some(m => m.id === current) ? current : (meters.rows.find(m => m.kind === 'room') || meters.rows[0])?.id || '');
      }).catch(error => { if (!controller.signal.aborted) setCatalogError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [catalogVersion]);

  useEffect(() => {
    const controller = new AbortController(); let running = false;
    lastIdentity.current = null; setLatest(old => old.meterId === meterId ? old : { loading: true, data: null, meterId });
    async function poll() {
      if (document.hidden || running || controller.signal.aborted) return;
      running = true;
      const results = await Promise.allSettled([
        getJson('/health/ready', controller.signal),
        meterId ? getJson(`/api/meters/${meterId}/latest`, controller.signal) : Promise.resolve({ data: null }),
      ]);
      if (!controller.signal.aborted) {
        setNow(Date.now());
        setHealth(results[0].status === 'fulfilled' ? results[0].value : { status: 'unavailable' });
        if (results[1].status === 'fulfilled') {
          const data = results[1].value.data, identity = data ? `${data.id}:${data.measured_at}` : 'empty';
          if (lastIdentity.current !== null && lastIdentity.current !== identity) setRevision(r => r + 1);
          lastIdentity.current = identity;
          setLatest({ data, loading: false, updated: Date.now(), meterId });
        } else setLatest(old => ({ ...old, loading: false, error: results[1].reason.message }));
      }
      running = false;
    }
    poll(); const timer = setInterval(poll, 5000);
    document.addEventListener('visibilitychange', poll);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', poll); };
  }, [meterId, refresh]);

  useEffect(() => {
    if (!meterId) return;
    const controller = new AbortController();
    const key = `${meterId}:${range.from}:${range.to}`;
    setHistory(old => ({ loading: true, data: old.key === key ? old.data : null, updated: old.key === key ? old.updated : null, key, progress: '' }));
    (async () => {
      const daily = await getJson(`/api/meters/${meterId}/daily?from=${range.from}&to=${shiftDate(range.to, 1)}`, controller.signal);
      if (controller.signal.aborted) return;
      setZone(daily.meta.timezone);
      const start = daily.data[0].starts_at, end = daily.data.at(-1).ends_at;
      const result = await allPages(`/api/meters/${meterId}/readings?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`, 'next_cursor', controller.signal,
        (count, pages) => { if (!controller.signal.aborted) setHistory(old => ({ ...old, progress: `${count.toLocaleString('id-ID')} sampel · ${pages} halaman` })); });
      if (!controller.signal.aborted) setHistory({ loading: false, key, updated: Date.now(), data: { daily, rows: result.rows, pages: result.pages, start, end } });
    })().catch(error => { if (!controller.signal.aborted) setHistory(old => ({ ...old, loading: false, error: `Histori belum berhasil dimuat lengkap. ${error.message}` })); });
    return () => controller.abort();
  }, [meterId, range, revision, refresh]);

  function chooseMeter(id) { if (id === meterId) return; setLatest({ loading: true, data: null }); setHistory({ loading: true, data: null }); setMeterId(id); }
  function chooseRange(next) { setDraft(next); setRangeError(''); setRange(next); }
  const currentLatest = latest.meterId === meterId ? latest : { loading: true, data: null };
  const reading = currentLatest.data;
  const age = reading ? Math.floor((now - Date.parse(reading.measured_at)) / 60000) : null;
  const currentKey = `${meterId}:${range.from}:${range.to}`;
  const result = history.key === currentKey ? history.data : null;
  const threshold = result?.daily.meta.max_gap_seconds || 120;
  const stale = age !== null && age * 60 > threshold;
  const graph = result ? chartRows(result.rows, threshold) : [];
  const refreshAll = () => { setRefresh(v => v + 1); setCatalogVersion(v => v + 1); };

  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brand-icon">ϟ</span>SmartBilling<span className="brand-dot">.</span></a>
      <p className="side-caption">CAPSTONE A05</p>
      <div className="nav-active"><span>▦</span> Monitoring listrik</div>
      <div className="side-heading">TITIK PENGUKURAN <span>{catalog.meters.length}</span></div>
      {catalogLoading && !catalog.meters.length && <p className="side-note">Memuat meter…</p>}
      {catalog.meters.map(m => <button className={`meter-button ${meterId === m.id ? 'selected' : ''}`} key={m.id} onClick={() => chooseMeter(m.id)} aria-pressed={meterId === m.id}>
        <span className="meter-mark">{m.kind === 'room' ? '▤' : '◈'}</span><span><strong>{labelFor(m)}</strong><small>Channel {m.channel_no} · …{m.id.slice(-4)}</small></span><span className="meter-arrow">›</span>
      </button>)}
      <div className="side-footer"><span className="mini-dot"/> LINGKUNGAN LOKAL<p>Monitoring pengembangan.<br/>Belum terhubung ke perangkat nyata.</p></div>
    </aside>
    <main>
      <header className="topbar"><span>Workspace <span className="slash">/</span> Monitoring</span><span className="simulation-badge">◉ Data simulasi</span></header>
      <section className="page-heading"><div><p className="eyebrow">MONITORING ENERGI</p><h1>Listrik, dalam pengamatan.</h1><p>Pantau pembacaan dan pahami kelengkapan histori setiap meter.</p></div><button className="refresh-button" onClick={refreshAll}>↻ Perbarui data</button></section>
      <ErrorNotice text={catalogError} retry={refreshAll}/>
      {catalog.rooms.length > 0 && <details className="room-directory"><summary>Daftar kamar · {catalog.rooms.length} kamar / {catalog.meters.length} meter</summary><ul>{catalog.rooms.map(room => <li key={room.id}><strong>{room.name || room.code}</strong> · {room.code}<span>{catalog.meters.filter(m => m.room_id === room.id).length ? catalog.meters.filter(m => m.room_id === room.id).map(m => <button key={m.id} onClick={() => chooseMeter(m.id)}>Pilih channel {m.channel_no} · …{m.id.slice(-4)}</button>) : 'Belum ada meter terpetakan'}</span></li>)}</ul></details>}
      <div className="connection-strip"><span><i className={health?.status === 'ready' ? 'dot good' : 'dot'}/>{!health ? 'Memeriksa backend…' : health.status === 'ready' ? 'Backend terhubung' : 'Backend tidak siap / tidak terjangkau'}</span><span>Polling 5 detik</span><span>Refresh API terakhir: {currentLatest.updated ? formatTime(currentLatest.updated, zone) : 'Belum berhasil'}</span></div>
      {!catalogLoading && !catalogError && !catalog.meters.length ? <div className="empty panel"><h2>Belum ada meter</h2><p>Mapping meter belum tersedia pada API.</p></div> : <>
        <div className="meter-title"><div><h2>{selected ? labelFor(selected) : 'Memuat titik pengukuran…'}</h2><p>{roomFor(selected)?.code || (selected ? `Channel ${selected.channel_no}` : '—')} <span>·</span> {meterId || 'Menunggu API'}</p></div><label className="meter-select">Pilih meter<select value={meterId} onChange={e => chooseMeter(e.target.value)} disabled={!catalog.meters.length}>{catalog.meters.map(m => <option key={m.id} value={m.id}>{labelFor(m)} · channel {m.channel_no}</option>)}</select></label></div>
        <ErrorNotice text={currentLatest.error ? `Pembaruan gagal. Nilai sebelumnya mungkin usang. ${currentLatest.error}` : ''} retry={refreshAll}/>
        <div className="reading-note"><span className={`pill ${stale ? 'amber' : ''}`}>{currentLatest.loading ? 'Memuat pembacaan' : !reading ? 'Belum ada pembacaan' : stale ? 'Pembacaan lama' : age < 0 ? 'Waktu sensor di masa depan' : 'Pembacaan simulasi terbaru'}</span><span>{reading ? `Diukur ${formatTime(reading.measured_at, zone)} · ${age < 0 ? 'periksa clock' : `${age.toLocaleString('id-ID')} menit lalu`}` : 'Koneksi backend tidak menandakan sensor sedang mengirim.'}</span></div>
        <section className="metrics" aria-label="Pembacaan terbaru">{[['Tegangan','voltage_v','V','↗'],['Arus','current_a','A','≈'],['Daya','power_w','W','ϟ'],['Energi kumulatif','energy_kwh','kWh','∑']].map(([label, field, unit, icon]) => <article className="metric" key={field}><div className="metric-label">{label}<span>{icon}</span></div><div className={`metric-value ${reading?.[field] == null ? 'unavailable' : ''}`} title={reading?.[field] ?? undefined}>{currentLatest.loading ? 'Memuat…' : decimal(reading?.[field])}{reading?.[field] != null && <small>{unit}</small>}</div><p>{field === 'energy_kwh' ? 'Counter meter · bukan konsumsi harian' : 'Nilai pada waktu pengukuran terakhir'}</p></article>)}</section>
        <p className="received">Diterima backend: {formatTime(reading?.received_at, zone)} <span>· Zona waktu: {zone}</span></p>
        <section className="panel history-panel"><div className="panel-heading"><div><p className="eyebrow">RIWAYAT PEMBACAAN</p><h2>Profil daya</h2></div><span className="legend"><i/> Daya (W)</span></div>
          <form className="filters" onSubmit={e => { e.preventDefault(); if (!validRange(draft.from, draft.to)) setRangeError('Pilih rentang tanggal valid, maksimal 31 hari.'); else chooseRange({ ...draft }); }}>
            <div className="presets"><button type="button" onClick={() => chooseRange({ from: shiftDate(todayIn(zone), -6), to: todayIn(zone) })}>7 hari terakhir</button><button type="button" onClick={() => chooseRange({ from: '2026-09-12', to: '2026-09-12' })}>Dataset 12 Sep</button></div>
            <label>Dari<input aria-label="Tanggal mulai" type="date" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} required/></label><label>Sampai<input aria-label="Tanggal akhir" type="date" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} required/></label><button className="apply">Terapkan</button>
          </form>
          <ErrorNotice text={rangeError}/><ErrorNotice text={history.error} retry={refreshAll}/>
          <div className="history-info"><span>{range.from} — {range.to} · {zone}</span><span aria-live="polite">{history.loading ? `Memuat seluruh histori… ${history.progress || ''}` : result ? `${result.rows.length.toLocaleString('id-ID')} sampel · ${result.pages} halaman selesai` : 'Belum tersedia'}</span></div>
          {result && <div className="chart" role="img" aria-label={`Grafik daya, ${result.rows.length} sampel, rentang ${range.from} sampai ${range.to}`}><ResponsiveContainer width="100%" height="100%"><LineChart data={graph} margin={{ top: 20, right: 18, bottom: 8, left: 0 }}><CartesianGrid vertical={false} stroke="#e9eeeb"/><XAxis dataKey="time" type="number" domain={[Date.parse(result.start), Date.parse(result.end)]} scale="time" ticks={range.from === range.to ? Array.from({ length: 7 }, (_, i) => Date.parse(result.start) + i * (Date.parse(result.end) - Date.parse(result.start)) / 6) : [...result.daily.data.map(day => Date.parse(day.starts_at)), Date.parse(result.end)]} tickFormatter={v => new Intl.DateTimeFormat('id-ID',{ timeZone: zone, ...(range.from === range.to ? { hour:'2-digit', minute:'2-digit' } : { day:'2-digit', month:'short' }) }).format(v)} tick={{ fontSize: 11 }} minTickGap={45}/><YAxis tick={{ fontSize: 11 }} width={45} domain={[0,'auto']}/><Tooltip labelFormatter={v => formatTime(v,zone)} formatter={(value, name, item) => [item.payload.original ?? value, 'Daya (W)']}/><Line type="linear" dataKey="power" stroke="#20866a" strokeWidth={2} dot={false} activeDot={{ r:4 }} connectNulls={false} isAnimationActive={false}/></LineChart></ResponsiveContainer>{!result.rows.some(r => r.power_w !== null) && <div className="chart-empty">Belum ada pembacaan daya pada rentang ini.</div>}</div>}
          {!result && <div className="empty chart-placeholder">{history.loading ? 'Mengambil histori dari PostgreSQL melalui API…' : 'Histori belum tersedia.'}</div>}
          <div className="panel-foot">Garis terputus menandakan data tidak tersedia atau jeda pembacaan. Tidak ada interpolasi.<span>{history.updated ? `Dimuat ${formatTime(history.updated,zone)}` : ''}</span></div>
        </section>
        <section className="panel daily-panel"><div className="panel-heading"><div><p className="eyebrow">KONSUMSI HARIAN</p><h2>Energi dengan konteks.</h2></div><span className="subtle">Dihitung backend dari selisih counter</span></div>
          {result ? <div className="table-scroll"><table><thead><tr><th>Tanggal</th><th>Total (kWh)</th><th>Subtotal valid (kWh)</th><th>Cakupan</th><th>Status</th></tr></thead><tbody>{result.daily.data.map(day => <tr key={day.date}><td>{new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(day.date))}</td><td title={day.consumption_kwh ?? ''}>{decimal(day.consumption_kwh,9)}</td><td title={day.observed_consumption_kwh ?? ''}>{decimal(day.observed_consumption_kwh,9)}</td><td><div className="coverage"><span style={{ width: `${100 * day.coverage_seconds / day.expected_seconds}%` }}/></div><small>{decimal(100 * day.coverage_seconds / day.expected_seconds,1)}% · {day.sample_count} sampel</small></td><td><span className={`pill ${day.status === 'complete' ? 'green' : day.status === 'partial' ? 'amber' : ''}`}>{statuses[day.status] || day.status}</span>{day.reasons.length > 0 && <small className="reason">{day.reasons.map(r => reasons[r] || r.replaceAll('_',' ')).join(' · ')}</small>}</td></tr>)}</tbody></table></div> : <div className="empty">{history.loading ? 'Memuat konsumsi harian…' : 'Konsumsi harian belum tersedia.'}</div>}
          <div className="panel-foot">Total hanya tersedia untuk hari lengkap. Subtotal valid bukan estimasi total harian; tidak tersedia bukan nol.</div>
        </section>
      </>}
      <footer className="footer">SmartBilling <span>Capstone A05 · Pengembangan lokal</span><span>Data simulasi, bukan pengamatan hardware.</span></footer>
    </main>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
