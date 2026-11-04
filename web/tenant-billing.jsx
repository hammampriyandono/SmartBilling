import {IllustratedHeading} from './illustrated-heading.jsx';
import React,{useEffect,useState} from 'react';
import {billableEnergy,billingGet,estimateRate,wh,paymentLabel,periodDate,periodTime,rupiah,tenantBillRows} from './billing-data.js';
import './tenant-bill-details.css';

import {TenantRunningBilling} from './tenant-running-billing.jsx';
import {useTestData} from './data-view.jsx';
import {visibleRecords,viewPath} from '../src/display-policy.js';
const roomName=(rooms,id)=>rooms.find(r=>r.id===id)?.name||rooms.find(r=>r.id===id)?.code||`Kamar …${id.slice(-8)}`;
async function loadTenantBills(user,signal,showTestData){const [periods,rooms]=await Promise.all([billingGet(viewPath('/api/billing-periods',showTestData),signal,user.id),billingGet('/api/rooms?limit=1000',signal,user.id)]),finals=visibleRecords(periods.data,showTestData).filter(p=>p.status==='finalized'),loaded=await Promise.all(finals.map(p=>billingGet(`/api/billing-periods/${p.id}`,signal,user.id)));return{periods:finals,rooms:visibleRecords(rooms.data,showTestData),rows:tenantBillRows(finals,Object.fromEntries(loaded.map((x,i)=>[finals[i].id,x.data])))};}

export function TenantLatestCard({user,onOpen}){const showTestData=useTestData();const [refresh,setRefresh]=useState(0);const [state,setState]=useState({loading:true,latest:null,rooms:[],error:''});useEffect(()=>{const c=new AbortController();loadTenantBills(user,c.signal,showTestData).then(x=>setState({loading:false,latest:x.rows[0]||null,rooms:x.rooms,error:''})).catch(e=>{if(!c.signal.aborted)setState({loading:false,latest:null,rooms:[],error:e.message});});return()=>c.abort();},[user.id,showTestData,refresh]);const x=state.latest;return <><TenantRunningBilling user={user} showTestData={showTestData} onPeriodsChanged={()=>setRefresh(value=>value+1)}/><section className="tenant-latest panel" aria-labelledby="latest-bill-title"><div className="panel-heading"><div><p className="eyebrow">TAGIHAN TENANT</p><h2 id="latest-bill-title">Tagihan Terbaru</h2></div>{x&&<span className="pill green">Final</span>}</div>{state.loading?<p className="empty">Memuat tagihan terbaru…</p>:state.error?<p className="error" role="alert">{state.error}</p>:!x?<div className="empty"><strong>Belum ada tagihan final.</strong><p>Tagihan akan muncul setelah owner menghitung dan memfinalisasi periode.</p><button onClick={onOpen}>Buka Tagihan Saya</button></div>:<div className="tenant-latest-body"><dl><div><dt>Periode</dt><dd>{periodDate(x.period_starts_at)} — {periodDate(x.period_ends_at)}</dd></div><div><dt>Kamar</dt><dd>{roomName(state.rooms,x.room_id)}</dd></div><div><dt>Total tagihan</dt><dd>{rupiah(x.total_cost_rp)}</dd></div><div><dt>Status tagihan</dt><dd>Final</dd></div><div><dt>Status pembayaran</dt><dd><span className={`pill ${x.payment_status==='paid'?'green':'amber'}`}>{paymentLabel(x.payment_status)}</span></dd></div></dl><button onClick={onOpen}>Lihat Tagihan</button></div>}</section></>}

export function TenantBilling({user}){const showTestData=useTestData();const [refresh,setRefresh]=useState(0);const [data,setData]=useState(null),[selected,setSelected]=useState(null),[error,setError]=useState('');useEffect(()=>{const c=new AbortController();loadTenantBills(user,c.signal,showTestData).then(setData).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[user.id,showTestData,refresh]);return <main className="billing-page"><IllustratedHeading eyebrow="TAGIHAN PENGHUNI" title="Tagihan Saya" description="Estimasi biaya berjalan dan tagihan final yang terkait dengan masa tinggal Anda." illustration="/tagihan-isometrik.svg"/><TenantRunningBilling user={user} showTestData={showTestData} onPeriodsChanged={()=>setRefresh(value=>value+1)}/>{error&&<p className="error" role="alert">{error}</p>}<section className="panel"><div className="panel-heading"><div><p className="eyebrow">RIWAYAT FINAL</p><h2>Daftar tagihan</h2></div>{data&&<span>{data.rows.length} tagihan</span>}</div>{!data?<p className="empty">Memuat seluruh tagihan final…</p>:!data.rows.length?<div className="empty"><strong>Belum ada tagihan final.</strong><p>Tagihan akan muncul setelah pemilik menyelesaikan perhitungan dan finalisasi periode.</p></div>:<div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>Periode</th><th>Kamar</th><th>Konsumsi energi</th><th>Tarif</th><th>Total dibayar</th><th>Status tagihan</th><th>Pembayaran</th><th>Detail</th></tr></thead><tbody>{data.rows.map(x=><tr key={x.share_id}><td data-label="Periode">{periodDate(x.period_starts_at)} — {periodDate(x.period_ends_at)}</td><td data-label="Kamar">{roomName(data.rooms,x.room_id)}</td><td data-label="Konsumsi energi">{wh(billableEnergy(x))}</td><td data-label="Tarif">{x.tariff_snapshot?.energy_rate_rp_kwh?estimateRate(x.tariff_snapshot.energy_rate_rp_kwh):'Perlu ditinjau'}</td><td data-label="Total dibayar"><strong>{rupiah(x.total_cost_rp)}</strong></td><td data-label="Status tagihan"><span className="pill green">Final</span></td><td data-label="Pembayaran"><span className={`pill ${x.payment_status==='paid'?'green':'amber'}`}>{paymentLabel(x.payment_status)}</span></td><td data-label="Detail"><button className="billing-detail-button" onClick={()=>setSelected(x)}>Lihat detail</button></td></tr>)}</tbody></table></div>}</section>{selected&&<TenantBillDrawer share={selected} name={roomName(data.rooms,selected.room_id)} close={()=>setSelected(null)}/>}</main>}

function MeterCounter({segments,edge}){
 if(!segments.length)return 'Belum tersedia';
 return segments.map((segment,i)=>{
  const value=segment[`${edge}_energy_kwh`],measured=segment[edge==='start'?'measured_starts_at':'measured_ends_at'];
  return <span className="bill-meter-reading" key={`${segment.segment_starts_at}:${i}`}>
   {segments.length>1&&<small>Segmen {i+1}</small>}
   <span>{value==null?'Belum tersedia':wh(value)}</span>
   {measured&&<small>{periodTime(measured)}</small>}
  </span>;
 });
}

export function TenantBillDrawer({share,name,close}){
 const rate=share.tariff_snapshot?.energy_rate_rp_kwh,energy=billableEnergy(share);
 const segments=Array.isArray(share.meter_segments)?share.meter_segments:[];
 return <div className="billing-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
  <aside className="billing-drawer" role="dialog" aria-modal="true" aria-labelledby="tenant-bill-title">
   <header><div><p className="eyebrow">RINCIAN TAGIHAN FINAL</p><h2 id="tenant-bill-title">{name}</h2></div><button onClick={close}>Tutup</button></header>
   <span className="pill green">Final</span>
   <dl>
    <dt>Periode</dt><dd>{periodTime(share.period_starts_at)} — {periodTime(share.period_ends_at)}</dd>
    <dt>Meter awal</dt><dd><MeterCounter segments={segments} edge="start"/></dd>
    <dt>Meter akhir</dt><dd><MeterCounter segments={segments} edge="end"/></dd>
    <dt>Konsumsi kamar</dt><dd>{wh(share.room_energy_kwh)}</dd>
    <dt>Alokasi RFID</dt><dd>{share.attributable_energy_kwh==null?'Tidak tersedia':`${wh(share.attributable_energy_kwh)} termasuk dalam konsumsi ditagihkan`}</dd>
    {share.shared_energy_kwh!=null&&<><dt>Bagian komunal bersama</dt><dd>{wh(share.shared_energy_kwh)}</dd><dt>Biaya bagian bersama</dt><dd>{rupiah(share.shared_cost_rp)}</dd></>}
    <dt>Konsumsi ditagihkan</dt><dd>{wh(energy)}</dd>
    <dt>Tarif</dt><dd>{rate?estimateRate(rate):'Perlu ditinjau'}</dd>
    <dt>Rumus</dt><dd>{energy==null||!rate?'Perlu ditinjau':`${wh(energy)} ÷ 1.000 × ${estimateRate(rate)} → ${rupiah(share.total_cost_rp)} setelah pembulatan`}</dd>
    <dt>Penyesuaian pembulatan</dt><dd>{rupiah(share.rounding_adjustment_rp)}</dd>
    <dt>Total yang harus dibayar</dt><dd>{rupiah(share.total_cost_rp)}</dd>
    <dt>Status pembayaran</dt><dd><span className={`pill ${share.payment_status==='paid'?'green':'amber'}`}>{paymentLabel(share.payment_status)}</span></dd>
    {share.paid_at&&<><dt>Waktu pembayaran</dt><dd>{new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(share.paid_at))}</dd><dt>Catatan owner</dt><dd>{share.paid_note||'Tidak ada catatan'}</dd></>}
   </dl>
   <p className="panel-foot">1.000 Wh setara dengan 1 kWh; tarif tetap per kWh. Total mengikuti pembulatan per komponen dan penyesuaian. Bagian antar penghuni dapat berbeda Rp1 karena pembulatan. Rincian penggunaan fasilitas tersedia di halaman Sesi fasilitas RFID.</p>
  </aside>
 </div>;
}
