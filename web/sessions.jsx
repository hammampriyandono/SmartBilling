import React,{useEffect,useState} from 'react';
import {getJson,decimal,shiftDate,todayIn} from './data.js';
import {facilityPages,sessionRange,energyReason,reviewReason,sessionDate} from './sessions-data.js';
const labels={active:'Sedang digunakan',completed:'Selesai',review:'Perlu ditinjau',available:'Tersedia',busy:'Sedang digunakan'};
const tone=s=>s==='review'?'amber':s==='completed'||s==='available'?'green':'';
const initialRange=()=>({from:shiftDate(todayIn('Asia/Jakarta'),-6),to:todayIn('Asia/Jakarta')});
export function Sessions({user}) {
 const tenant=user.role==='tenant';
 const [draft,setDraft]=useState(initialRange),[range,setRange]=useState(initialRange);
 const [facility,setFacility]=useState(''),[status,setStatus]=useState(''),[size,setSize]=useState(10);
 const [cursors,setCursors]=useState([null]),[result,setResult]=useState(null),[facilities,setFacilities]=useState(null);
 const [error,setError]=useState(''),[validation,setValidation]=useState(''),[busy,setBusy]=useState(true),[updated,setUpdated]=useState(null),[refresh,setRefresh]=useState(0);
 const cursor=cursors.at(-1);
 useEffect(()=>{
  const controller=new AbortController();let running=false;
  setResult(null);setUpdated(null);setError('');setBusy(true);
  async function poll(){
   if(running||controller.signal.aborted||document.hidden)return;running=true;setBusy(true);
   try{
    const query=new URLSearchParams({...sessionRange(range),limit:String(size)});
    if(facility)query.set('facility_id',facility);if(status)query.set('status',status);if(cursor)query.set('cursor',cursor);
    const [f,s]=await Promise.all([facilityPages(controller.signal),getJson(`/api/usage-sessions?${query}`,controller.signal)]);
    if(!controller.signal.aborted){setFacilities(f);setResult(s);setUpdated(new Date().toISOString());setError('');}
   }catch(e){if(!controller.signal.aborted)setError(e.message);}
   finally{running=false;if(!controller.signal.aborted)setBusy(false);}
  }
  poll();const timer=setInterval(poll,5000);document.addEventListener('visibilitychange',poll);
  return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',poll);};
 },[range,facility,status,size,cursor,refresh]);
 function filter(set,value){set(value);setCursors([null]);}
 function apply(next){try{sessionRange(next);setValidation('');setDraft(next);setRange({...next});setCursors([null]);}catch(e){setValidation(e.message);}}
 return <main className="rfid-page">
  <header className="page-heading"><div><p className="eyebrow">SMARTBILLING / FASILITAS BERSAMA</p><h1>Riwayat fasilitas RFID</h1><p>{tenant?'Lihat fasilitas di tempat tinggal Anda dan riwayat penggunaan Anda sendiri.':'Pantau ketersediaan fasilitas dan riwayat penggunaan di properti Anda.'}</p></div><span className="simulation-badge">Data simulasi · RFID</span></header>
  <section aria-labelledby="facility-heading"><div className="rfid-section-heading"><h2 id="facility-heading">Fasilitas {tenant?'di tempat tinggal Anda':'milik Anda'}</h2><button className="refresh-button" onClick={()=>setRefresh(v=>v+1)} disabled={busy}>↻ {busy?'Memperbarui…':'Perbarui data'}</button></div>
   <p className="rfid-description">{tenant?'Daftar mengikuti occupancy aktif Anda. Status digunakan tidak berarti fasilitas sedang Anda gunakan.':'Status diperoleh dari backend. Sesi yang perlu ditinjau tetap terbuka sampai ditangani melalui alur yang sah.'}</p>
   {facilities===null?<p className="empty">{busy?'Memuat fasilitas…':'Daftar fasilitas belum tersedia.'}</p>:facilities.length===0?<p className="empty">{tenant?'Belum ada fasilitas yang dapat diakses pada masa tinggal aktif Anda.':'Belum ada fasilitas pada properti Anda.'}</p>:<div className="facility-grid">{facilities.map(f=><button key={f.id} className={`facility-card ${facility===f.id?'selected':''}`} aria-pressed={facility===f.id} onClick={()=>filter(setFacility,facility===f.id?'':f.id)}><span className="facility-icon" aria-hidden="true">⌁</span><strong>{f.name}</strong><span className={`pill ${tone(f.availability)}`}>{f.is_active?labels[f.availability]||'Status belum diketahui':'Nonaktif'}</span><small>{facility===f.id?'Filter aktif · klik untuk semua':'Lihat riwayat sesi'}</small></button>)}</div>}
  </section>
  <section className="panel" aria-labelledby="sessions-heading"><div className="panel-heading"><div><p className="eyebrow">TAP MASUK → TAP KELUAR</p><h2 id="sessions-heading">{tenant?'Riwayat penggunaan saya':'Riwayat penggunaan'}</h2></div><span className="subtle">Tidak ada penutupan otomatis</span></div>
   <form className="rfid-filters" onSubmit={e=>{e.preventDefault();apply(draft);}}>
    <label>Fasilitas<select value={facility} onChange={e=>filter(setFacility,e.target.value)}><option value="">{tenant?'Semua sesi saya':'Semua fasilitas'}</option>{facilities?.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
    <label>Status sesi<select value={status} onChange={e=>filter(setStatus,e.target.value)}><option value="">Semua status</option>{['active','completed','review'].map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label>
    <label>Dari (WIB)<input type="date" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})} required/></label>
    <label>Sampai (WIB)<input type="date" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})} required/></label>
    <button className="apply">Terapkan tanggal</button><button type="button" onClick={()=>apply(initialRange())}>7 hari terakhir</button>
   </form>
   {validation&&<p className="error" role="alert">{validation}</p>}
   {error&&<p className="error" role="alert">{error} {result?'Data terakhir mungkin belum diperbarui.':''} <button onClick={()=>setRefresh(v=>v+1)}>Coba lagi</button></p>}
   <div className="rfid-history-info"><span>{range.from} — {range.to} · WIB · tanggal akhir termasuk</span><span>Polling 5 detik · Pembaruan terakhir: {sessionDate(updated)}</span></div>
   {!result?<p className="empty" role="status">{busy?'Memuat riwayat sesi…':'Riwayat belum tersedia. Coba lagi setelah layanan pulih.'}</p>:!result.data.length?<p className="empty" role="status">Tidak ada sesi {tenant?'milik Anda ':''}pada rentang dan filter ini.</p>:<div className="rfid-table-wrap"><table className="rfid-table"><caption className="sr-only">Riwayat sesi fasilitas, halaman {cursors.length}</caption><thead><tr>{['Fasilitas','Mulai (WIB)','Selesai (WIB)','Status','Durasi','Energi (kWh)'].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{result.data.map(s=><tr key={s.id}>
    <td data-label="Fasilitas"><strong>{s.facility_name}</strong><small>Simulasi</small></td>
    <td data-label="Mulai (WIB)">{sessionDate(s.started_at)}</td><td data-label="Selesai (WIB)">{s.ended_at?sessionDate(s.ended_at):'Belum selesai'}</td>
    <td data-label="Status"><span className={`pill ${tone(s.status)}`}>{labels[s.status]||'Status belum diketahui'}</span>{s.status==='review'&&<small>{reviewReason(s.review_reason)}</small>}</td>
    <td data-label="Durasi">{s.duration_seconds===null?'Belum selesai':`${decimal(s.duration_seconds,3)} detik`}</td>
    <td data-label="Energi (kWh)"><strong title={s.energy_kwh??undefined}>{decimal(s.energy_kwh,9)}</strong><small>{energyReason(s.energy_reason,s.energy_kwh)}</small></td>
   </tr>)}</tbody></table></div>}
   <nav className="rfid-pagination" aria-label="Halaman riwayat sesi"><label>Sesi per halaman<select value={size} onChange={e=>filter(setSize,Number(e.target.value))}>{[10,25,50].map(n=><option key={n}>{n}</option>)}</select></label><span aria-live="polite">Halaman {cursors.length}{result?` · ${result.data.length} sesi ditampilkan`:''}</span><button disabled={busy||cursors.length===1} onClick={()=>setCursors(v=>v.slice(0,-1))}>Sebelumnya</button><button disabled={busy||!!error||!result?.next_cursor||cursors.includes(result?.next_cursor)} onClick={()=>setCursors(v=>[...v,result.next_cursor])}>Berikutnya</button></nav>
   <div className="panel-foot">Energi dihitung backend dari counter meter. Tidak tersedia bukan nol. Belum ada tagihan atau integrasi hardware nyata.{tenant?' Riwayat hanya memuat sesi Anda, termasuk masa tinggal sebelumnya.':''}</div>
  </section>
 </main>;
}
