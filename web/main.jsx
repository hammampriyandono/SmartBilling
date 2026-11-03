import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { allPages, getJson, shiftDate, todayIn, validRange, chartRows, decimal } from './data.js';
import './style.css';
import {AuthGate} from './auth.jsx';
import {Sessions} from './sessions.jsx';
import {Administration} from './admin.jsx';
import {Billing,TenantLatestCard} from './billing.jsx';
import {Reports} from './reports.jsx';
import {DeviceHealth} from './device-health.jsx';
import {monitoringCatalog, activeCatalog, preferredMeter, readingSourceLabel, meterChoices} from './monitoring-view.js';
import {MeterPicker} from './meter-picker.jsx';
import {MeterComparison} from './meter-comparison.jsx';
import './monitoring-view.css';
import './billing-layout.css';
import {DataViewContext} from './data-view.jsx';
import {RoomRelayControl} from './room-relay.jsx';
import {WorkspaceHeader} from './workspace-header.jsx';
import {Icon} from './interface-icon.jsx';
import {DailyEnergyChart, DailyEnergyDetails} from './daily-energy.jsx';
import './dashboard.css';
import './motion.css';

const operational=import.meta.env.VITE_DATA_MODE==='operational';
const formatTime = (value, zone) => value ? new Intl.DateTimeFormat('id-ID', { timeZone: zone, dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value)) : 'Belum tersedia';
function ErrorNotice({ text, retry }) { return text && <div className="error" role="alert">{text} {retry && <button onClick={retry}>Coba lagi</button>}</div>; }

function App({user,tenantBillingCard=null,catalog,catalogError,catalogLoading,meterId,setMeterId,onRefreshCatalog,showTestData,onOpenAdministration}) {
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
      const start = daily.range.from, end = daily.range.to;
      const result = await allPages(`/api/meters/${meterId}/readings?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`, 'next_cursor', controller.signal,
        (count, pages) => { if (!controller.signal.aborted) setHistory(old => ({ ...old, progress: `${count.toLocaleString('id-ID')} pembacaan` })); });
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
  const stale = reading !== null && reading !== undefined && now - Date.parse(reading.measured_at) > threshold * 1000;
  const graph = result ? chartRows(result.rows, threshold) : [];
  const refreshAll = () => { setRefresh(v => v + 1); onRefreshCatalog(); };
  const readingStatus = currentLatest.loading ? 'Memuat pembacaan' : !reading ? 'Belum ada pembacaan' : stale ? 'Pembacaan lama' : age < 0 ? 'Waktu sensor di masa depan' : readingSourceLabel(reading);

  return <main className="monitoring-page">
      <div className="overview-grid">
        <header className="energy-hero">
          <img src="/kost-isometrik.svg" className="hero-building" alt=""/>
          <div className="hero-copy"><p className="eyebrow"><span/> DASHBOARD ENERGI</p><h1>Monitoring listrik</h1>
            <p>Pantau daya dan pemakaian energi {user.role === 'owner' ? 'properti' : 'kamar'} Anda.</p>
            <div className="hero-actions"><button type="button" onClick={refreshAll}><Icon name="refresh" size={15}/>Perbarui data</button>
              <span className="service-status"><i className={health?.status === 'ready' ? 'dot good' : 'dot'}/>{!health ? 'Memeriksa koneksi…' : health.status === 'ready' ? 'Layanan terhubung' : 'Layanan belum terhubung'}</span></div>
          </div>
        </header>
        <MeterPicker choices={meterChoices(catalog)} selectedId={meterId} onSelect={chooseMeter} loading={catalogLoading} error={catalogError}>
          {catalog.rooms.length > 0 && <details className="room-directory"><summary>Daftar kamar · {catalog.rooms.length} kamar</summary><ul>{catalog.rooms.map(room => <li key={room.id}><strong>{room.name || room.code}</strong> · {room.code}<span>{catalog.meters.filter(m => m.room_id === room.id).length ? catalog.meters.filter(m => m.room_id === room.id).map(m => <button key={m.id} onClick={() => chooseMeter(m.id)}>Pilih channel {m.channel_no}</button>) : 'Belum ada meter terpasang'}</span></li>)}</ul></details>}
        </MeterPicker>
      </div>
      {showTestData&&!operational&&<p className="simulation-badge">Simulasi dan arsip ditampilkan</p>}
      <ErrorNotice text={catalogError} retry={refreshAll}/>
      {!selected ? <div className="empty panel observation-empty"><span className="observation-icon"><Icon name="meter" size={26}/></span>
        <h2>{catalogLoading ? 'Memuat titik pengukuran…' : catalogError ? 'Daftar meter belum tersedia' : 'Belum ada meter terpasang'}</h2>
        {!catalogLoading && !catalogError && <><p>{onOpenAdministration ? 'Daftarkan perangkat dan pasangkan meter untuk mulai menampilkan pembacaan.' : 'Belum ada pemasangan meter yang dapat diakses.'}</p>{onOpenAdministration&&<button type="button" className="refresh-button" onClick={onOpenAdministration}>Buka Administrasi</button>}</>}
      </div> : <>
        <div className="reading-heading"><div><p className="eyebrow">PEMBACAAN TERAKHIR</p><h2>{labelFor(selected)} <small>Channel {selected.channel_no}</small></h2>
          {selected.kind === 'main' && <p className="point-description">Seluruh jalur listrik sebelum percabangan kamar.</p>}</div>
          <div className="reading-state">{(selected.source === 'simulation' || reading?.data_source === 'simulation') && <span className="simulation-badge">Simulasi</span>}
            <span className={`pill ${stale || age < 0 ? 'amber' : ''}`}>{readingStatus}</span>
            {reading && <small>Diukur {formatTime(reading.measured_at, zone)}</small>}</div>
        </div>
        <ErrorNotice text={currentLatest.error ? `Pembaruan gagal. Nilai sebelumnya mungkin usang. ${currentLatest.error}` : ''} retry={refreshAll}/>
        <section className="reading-cards" aria-label="Pembacaan terbaru">{[
          ['Daya','power_w','W','power'], ['Energi kumulatif','energy_kwh','kWh','energy'],
          ['Tegangan','voltage_v','V','voltage'], ['Arus','current_a','A','current'],
        ].map(([label, field, unit, icon]) => <article key={field}><div><span className="reading-icon"><Icon name={icon}/></span><h3>{label}</h3></div>
          <p className={reading?.[field] == null ? 'value-missing' : ''} title={reading?.[field] ?? undefined}>{currentLatest.loading ? 'Memuat…' : decimal(reading?.[field])}{reading?.[field] != null && <small>{unit}</small>}</p>
        </article>)}</section>
        <p className="reading-time">{reading?.received_at ? `Diterima ${formatTime(reading.received_at, zone)} · ${zone}` : 'Menunggu data dari meter.'}<span>Diperiksa otomatis tiap 5 detik{currentLatest.updated && ' · ' + formatTime(currentLatest.updated, zone)}</span></p>
        <section className="usage-history" aria-labelledby="history-title">
          <div className="history-tools">
          <header className="history-title"><p className="eyebrow">HISTORI METER</p><h2 id="history-title">Riwayat konsumsi</h2></header>
          <form className="filters" onSubmit={e => { e.preventDefault(); if (!validRange(draft.from, draft.to)) setRangeError('Pilih rentang tanggal valid, maksimal 31 hari.'); else chooseRange({ ...draft }); }}>
            <div className="presets"><button type="button" onClick={() => chooseRange({ from: shiftDate(todayIn(zone), -6), to: todayIn(zone) })}>7 hari terakhir</button><button type="button" onClick={() => chooseRange({ from: todayIn(zone), to: todayIn(zone) })}>Hari ini</button></div>
            <label>Dari<input aria-label="Tanggal mulai" type="date" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} required/></label><label>Sampai<input aria-label="Tanggal akhir" type="date" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} required/></label><button className="apply">Terapkan</button>
          </form></div>
          <ErrorNotice text={rangeError}/><ErrorNotice text={history.error} retry={refreshAll}/>
          <div className="history-info"><span> {range.from} — {range.to} · {zone}</span><span aria-live="polite">{history.loading ? `Memuat riwayat… ${history.progress || ''}` : result ? `${result.rows.length.toLocaleString('id-ID')} pembacaan` : 'Belum tersedia'}</span></div>
          <div className="history-charts">
          <section className="panel history-panel"><div className="panel-heading"><div><p className="eyebrow">DAYA · W</p><h2>Profil daya</h2></div><span className="legend"><i/> Daya</span></div>
          {result && <div className="chart" role="img" aria-label={`Grafik daya, ${result.rows.length} sampel, rentang ${range.from} sampai ${range.to}`}><ResponsiveContainer width="100%" height="100%"><LineChart data={graph} margin={{ top: 20, right: 18, bottom: 8, left: 0 }}><CartesianGrid vertical={false} stroke="var(--sb-line)"/><XAxis dataKey="time" type="number" domain={[Date.parse(result.start), Date.parse(result.end)]} scale="time" ticks={range.from === range.to ? Array.from({ length: 7 }, (_, i) => Date.parse(result.start) + i * (Date.parse(result.end) - Date.parse(result.start)) / 6) : [...result.daily.data.map(day => Date.parse(day.starts_at)), Date.parse(result.end)]} tickFormatter={v => new Intl.DateTimeFormat('id-ID',{ timeZone: zone, ...(range.from === range.to ? { hour:'2-digit', minute:'2-digit' } : { day:'2-digit', month:'short' }) }).format(v)} tick={{ fontSize: 11 }} minTickGap={45}/><YAxis tick={{ fontSize: 11 }} width={45} domain={[0,'auto']}/><Tooltip itemStyle={{color:'var(--sb-ink)'}} labelFormatter={v => formatTime(v,zone)} formatter={(value, name, item) => [item.payload.original ?? value, 'Daya (W)']}/><Line type="linear" dataKey="power" stroke="var(--sb-chart-power)" strokeWidth={2} dot={false} activeDot={{ r:4 }} connectNulls={false} isAnimationActive={false}/></LineChart></ResponsiveContainer>{!result.rows.some(r => r.power_w !== null) && <div className="chart-empty">Belum ada pembacaan daya pada rentang ini.</div>}</div>}
          {!result && <div className="empty chart-placeholder">{history.loading ? 'Memuat riwayat pembacaan…' : 'Histori belum tersedia.'}</div>}
          <div className="panel-foot">Garis terputus menunjukkan jeda atau data yang belum tersedia.<span>{history.updated ? `Dimuat ${formatTime(history.updated,zone)}` : ''}</span></div>
        </section>
        <section className="panel daily-chart-panel"><div className="panel-heading"><div><p className="eyebrow">ENERGI · kWh</p><h2>Pemakaian energi harian</h2></div></div>
          {result ? <DailyEnergyChart days={result.daily.data}/> : <div className="empty chart-placeholder">{history.loading ? 'Memuat konsumsi harian…' : 'Konsumsi harian belum tersedia.'}</div>}
          <div className="panel-foot daily-key"><span>Total lengkap</span><span>Subtotal parsial</span></div>
        </section></div>
        <DailyEnergyDetails daily={result?.daily} loading={history.loading}/>
        </section>
      </>}
      {tenantBillingCard}
      <RoomRelayControl user={user} meter={selected}/>
      {onOpenAdministration && selected && <MeterComparison propertyId={selected.property_id}/>}
      <footer className="footer">SplitzBill <span>Monitoring dan pengelolaan listrik</span></footer>
    </main>;
}
function Workspace({user,onLogout,busy,error}) {
 const [page,setPage]=useState('monitoring');
 const [catalog,setCatalog]=useState({rooms:[],meters:[]}),[catalogLoading,setCatalogLoading]=useState(true),[catalogError,setCatalogError]=useState('');
 const [catalogVersion,setCatalogVersion]=useState(0),[meterId,setMeterId]=useState('');
 const [showTestData,setShowTestData]=useState(operational);
 const scopedCatalog=operational?activeCatalog(catalog):monitoringCatalog(catalog,showTestData);
 // Pembacaan fasilitas komunal berada di Riwayat fasilitas RFID.
 const visibleCatalog={...scopedCatalog,meters:scopedCatalog.meters.filter(m=>m.kind!=='communal')};
 const visibleMeterId=preferredMeter(visibleCatalog.meters,meterId);
 useEffect(()=>{
  if(page!=='monitoring')return;
  const controller=new AbortController();setCatalogLoading(true);setCatalogError('');
  Promise.all([allPages('/api/rooms','next_after',controller.signal),allPages('/api/meters','next_after',controller.signal)])
   .then(([rooms,meters])=>{if(controller.signal.aborted)return;setCatalog({rooms:rooms.rows,meters:meters.rows});setMeterId(current=>meters.rows.some(m=>m.id===current)?current:(meters.rows.find(m=>m.kind==='room')||meters.rows[0])?.id||'');})
   .catch(error=>{if(!controller.signal.aborted)setCatalogError(error.message);})
   .finally(()=>{if(!controller.signal.aborted)setCatalogLoading(false);});
  return()=>controller.abort();
 },[page,catalogVersion]);
 function navigate(key) {
  setPage(key);
  window.scrollTo(0, 0);
 }
 return <div className="app-frame">
  <WorkspaceHeader user={user} page={page} onNavigate={navigate} onLogout={onLogout} busy={busy} error={error}/>
  <div className="app-content">
   {import.meta.env.DEV&&!operational&&<div className="monitoring-view-controls workspace-data-view"><label><input type="checkbox" checked={showTestData} onChange={e=>setShowTestData(e.target.checked)}/> Tampilkan simulasi dan arsip uji</label><span>{showTestData?'Daftar lengkap sesuai akses akun Anda.':'Simulasi dan data uji disembunyikan di semua halaman.'}</span></div>}
   <DataViewContext.Provider value={showTestData}><React.Fragment key={`${page}:${showTestData}`}>
   {page==='admin'?<Administration user={user}/>:page==='health'?<DeviceHealth user={user}/>:page==='reports'?<Reports user={user}/>:page==='billing'?<Billing user={user}/>:page==='sessions'?<Sessions user={user}/>:<App user={user} catalog={visibleCatalog} catalogError={catalogError} catalogLoading={catalogLoading} meterId={visibleMeterId} setMeterId={setMeterId} showTestData={showTestData} onOpenAdministration={user.role==='owner'?()=>navigate('admin'):null} onRefreshCatalog={()=>setCatalogVersion(v=>v+1)} tenantBillingCard={user.role==='tenant'?<TenantLatestCard user={user} onOpen={()=>navigate('billing')}/>:null}/>}
   </React.Fragment></DataViewContext.Provider>
  </div>
 </div>;
}
createRoot(document.getElementById('root')).render(<AuthGate Dashboard={Workspace}/>);
