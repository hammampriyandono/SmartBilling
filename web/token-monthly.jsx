import React,{useEffect,useRef,useState} from 'react';
import {adminSections,adminRequest,loadAdminSection} from './admin-data.js';
import {sendAction} from './admin-mutations.js';
import {todayIn} from './data.js';
import {loadTokenMonth,tokenAction,tokenRupiah,tokenKwh,loadTokenEstimate} from './token-data.js';
import {isArchivedTestRecord} from './monitoring-view.js';

export function TokenMonthly({user,showTestData=false}){return user?.role==='owner'?<OwnerTokenMonthly key={`${user.id}:${showTestData}`} user={user} showTestData={showTestData}/>:null;}
function OwnerTokenMonthly({user,showTestData}){
 const [properties,setProperties]=useState([]),[propertyId,setPropertyId]=useState(''),[month,setMonth]=useState(''),[catalogError,setCatalogError]=useState('');
 const [result,setResult]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0),[form,setForm]=useState(null);
 const property=properties.find(p=>p.id===propertyId),zone=property?.timezone||'Asia/Jakarta';
 useEffect(()=>{const c=new AbortController();setCatalogError('');loadAdminSection(adminSections.find(s=>s.key==='properties'),c.signal,(p,s)=>adminRequest(p,s,fetch,user.id)).then(all=>{if(c.signal.aborted)return;const rows=showTestData?all:all.filter(p=>!isArchivedTestRecord(p));setProperties(rows);setPropertyId(id=>rows.some(p=>p.id===id)?id:rows[0]?.id||'');setMonth(m=>m||todayIn(rows[0]?.timezone||'Asia/Jakarta').slice(0,7));if(!rows.length){setResult(null);setLoading(false);}}).catch(e=>{if(!c.signal.aborted){setCatalogError(e.message);setLoading(false);}});return()=>c.abort();},[user.id,reload,showTestData]);
 useEffect(()=>{if(!propertyId)return;if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)){setResult(null);setError('Pilih bulan yang valid (2000–2099).');setLoading(false);return;}const c=new AbortController();setResult(null);setError('');setLoading(true);loadTokenMonth(propertyId,month,c.signal,user.id).then(data=>{if(!c.signal.aborted)setResult(data);}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[propertyId,month,user.id,reload]);
 const summary=result?.summary,refresh=()=>setReload(n=>n+1);
 return <section className="panel token-monthly" aria-labelledby="token-monthly-title">
  <header className="panel-heading"><div><p className="eyebrow">RINGKASAN BULANAN · OWNER</p><h2 id="token-monthly-title">Token dan Tagihan Bulanan</h2><p>Pembelian token dibandingkan dengan tagihan final tenant, bukan arus kas pembayaran.</p></div><button type="button" onClick={refresh} disabled={loading&&!catalogError}>Perbarui</button></header>
  <div className="token-filters"><label>Properti<select value={propertyId} onChange={e=>{setResult(null);setPropertyId(e.target.value);}} disabled={!properties.length}>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Bulan<input type="month" required min="2000-01" max="2099-12" value={month} onChange={e=>{setResult(null);setMonth(e.target.value);}}/></label><span>Zona waktu: {zone}</span><button type="button" onClick={()=>setForm({action:'create',row:null})} disabled={!propertyId||!!catalogError}>Tambah pembelian token</button></div>
  {(catalogError||error)&&<p className="error" role="alert">{catalogError||error} <button onClick={refresh}>Coba lagi</button></p>}
  {!catalogError&&!properties.length&&!loading?<p className="empty">Belum ada properti yang dapat diakses.</p>:loading?<p className="empty" role="status">Memuat ringkasan dan pembelian dari API…</p>:summary&&<>
   <div className="token-summary">{[['Pembelian token',summary.token_total_rp],['Tagihan final tenant',summary.tenant_total_rp],['Sudah lunas',summary.paid_total_rp],['Belum dibayar',summary.unpaid_total_rp],['Selisih token dan tagihan',summary.difference_rp]].map(([label,value])=><article key={label}><span>{label}</span><strong>{tokenRupiah(value)}</strong></article>)}</div>
   <div className="token-energy-record"><strong>Energi pembelian bulan ini: {tokenKwh(summary.energy_total_kwh)}</strong><p>{summary.energy_missing_count>0?`${summary.energy_missing_count} pembelian aktif belum memiliki catatan kWh; total energi belum lengkap.`:summary.purchase_count>0?'Jumlah kWh dari catatan pembelian.':'Belum ada pembelian aktif pada bulan ini.'} {summary.energy_estimated_count>0&&`${summary.energy_estimated_count} pembelian memakai estimasi simulasi expo. `}Ini bukan saldo tersisa atau pembacaan meter PLN. Saldo lintas bulan dan pengurangan konsumsi belum dihitung.</p></div>
   {summary.availability==='unavailable' &&<p className="token-notice">Belum tersedia: {summary.invalid_count?'data alokasi final perlu ditinjau.':'belum ada periode final produksi yang seluruh rentangnya berada dalam bulan ini.'} Pembelian token tetap ditampilkan; tagihan dan selisih bukan nol.</p>}
   {!!summary.cross_month_periods.length&&<aside className="token-notice" role="status"><strong>Perlu ditinjau — periode melintasi bulan</strong><p>{summary.cross_month_periods.length} periode final dikecualikan, tanpa pembagian/prorata nominal. Ringkasan {summary.availability==='partial'?'ini hanya sebagian dan ':' '}bukan total seluruh periode yang beririsan dengan bulan ini.</p><ul>{summary.cross_month_periods.map(p=><li key={p.id}>{new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(new Date(p.starts_at))} — {new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(new Date(p.ends_at))} · revisi {p.revision_no}</li>)}</ul></aside>}
   <p className="token-explanation">{summary.final_period_count} periode final tercakup. Hanya revisi final produksi yang berlaku dan bagian tenant dihitung. Status lunas/belum dibayar mengikuti status terkini, bukan tanggal pembayaran. Token dapat masih tersisa dan konsumsi owner/fasilitas belum tentu dibebankan ke tenant. Selisih ini bukan laba, rugi, atau kehilangan energi.</p>
   <div className="billing-table-wrap"><table className="billing-table"><caption className="sr-only">Pembelian token bulan {month}</caption><thead><tr><th>Tanggal pembelian</th><th>Nominal</th><th>Energi diperoleh</th><th>Catatan</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{result.rows.map(row=><tr key={row.id}><td data-label="Tanggal">{new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(row.purchase_date))}</td><td data-label="Nominal">{tokenRupiah(row.amount_rp)}</td><td data-label="Energi diperoleh">{tokenKwh(row.energy_kwh)}{row.energy_calculation&&<small>Estimasi expo</small>}</td><td data-label="Catatan">{row.note||'—'}{row.reason&&<small>Alasan: {row.reason}</small>}</td><td data-label="Status"><span className={`pill ${row.status==='active'?'green':'amber'}`}>{row.status==='active'?'Aktif':'Dibatalkan'}</span><small>Versi {row.row_version}</small></td><td data-label="Aksi">{row.status==='active'?<div className="token-actions"><button onClick={()=>setForm({action:'correct',row})}>Koreksi</button><button onClick={()=>setForm({action:'cancel',row})}>Batalkan</button></div>:'Tidak dihitung'}</td></tr>)}</tbody></table></div>
   {!result.rows.length&&<p className="empty">Belum ada catatan pembelian token pada bulan ini. Tambahkan pembelian sebenarnya; tidak ada transaksi contoh otomatis.</p>}
  </>}
  {form&&<TokenForm key={`${form.action}:${form.row?.id||'new'}`} {...form} property={property} user={user} onClose={()=>setForm(null)} onSaved={refresh}/>}
 </section>;
}
function TokenForm({action,row,property,user,onClose,onSaved}){
 const dialog=useRef(null),pending=useRef(null),lock=useRef(false),alive=useRef(true),controller=useRef(new AbortController());
 const [values,setValues]=useState({
  purchase_date:row?.purchase_date||todayIn(property.timezone),amount_rp:row?.amount_rp||'',
  energy_mode:row&&!row.energy_calculation?'manual':'estimate',energy_kwh:row?.energy_kwh||'',
  tariff_rp_per_kwh:row?.energy_calculation?.tariff_rp_per_kwh,tax_percent:row?.energy_calculation?.tax_percent,note:row?.note||'',reason:''
 }),[error,setError]=useState(null),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[preview,setPreview]=useState(null);
 const estimateKey=JSON.stringify([values.amount_rp,values.tariff_rp_per_kwh,values.tax_percent]);
 const estimate=preview?.key===estimateKey?preview:null;
 useEffect(()=>{alive.current=true;dialog.current.showModal();return()=>{alive.current=false;controller.current.abort();};},[]);
 useEffect(()=>{
  if(action==='cancel'||values.energy_mode!=='estimate')return;
  const c=new AbortController();
  const timer=setTimeout(()=>{
   loadTokenEstimate(values,c.signal,user.id).then(data=>{if(!c.signal.aborted)setPreview({key:estimateKey,data});})
    .catch(e=>{if(!c.signal.aborted)setPreview({key:estimateKey,error:e.message});});
  },300);
  return()=>{clearTimeout(timer);c.abort();};
 },[estimateKey,values.energy_mode,action,user.id]);
 function change(key,value){setValues(v=>({...v,[key]:value}));}
 function close(){if(busy)return;if(uncertain&&!window.confirm('Hasil aksi belum pasti. Tutup lalu periksa daftar sebelum membuat aksi baru?'))return;onClose();}
 async function execute(event){event?.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError(null);try{
  pending.current??=tokenAction(action,row,values,property.id,user.id);await sendAction(pending.current,controller.current.signal);if(alive.current){onSaved();onClose();}
 }catch(e){if(alive.current){setError(e);setUncertain(!!e.retry);if(!e.retry)pending.current=null;}}finally{lock.current=false;if(alive.current)setBusy(false);}}
 const title=action==='create'?'Tambah pembelian token':action==='correct'?'Koreksi pembelian token':'Batalkan pembelian token';
 const estimateBlocked=action!=='cancel'&&values.energy_mode==='estimate'&&!estimate?.data;
 return <dialog className="admin-dialog" ref={dialog} aria-labelledby="token-form-title" onCancel={e=>{e.preventDefault();close();}}>
  <div className="admin-dialog-heading"><h2 id="token-form-title">{title}</h2><button disabled={busy} onClick={close}>Tutup</button></div>
  <p>{property.name} · tanggal lokal {property.timezone}. {row?`Versi ${row.row_version}; histori sebelumnya tetap tersimpan.`:''}</p>
  <form onSubmit={execute}><fieldset disabled={busy||uncertain||error?.code==='stale_version'}>
   {action!=='cancel'?<>
    <div className="admin-form-grid">
     <label>Tanggal pembelian<input type="date" required min="2000-01-01" max="2099-12-31" value={values.purchase_date} onChange={e=>change('purchase_date',e.target.value)}/></label>
     <label>Nominal Rupiah bulat<input type="text" inputMode="numeric" required pattern="[0-9]{1,13}" maxLength={13} placeholder="Contoh: 50000" value={values.amount_rp} onChange={e=>change('amount_rp',e.target.value)}/></label>
     <details><summary>Opsi pengisian energi</summary><label>Cara mengisi energi<select value={values.energy_mode} onChange={e=>change('energy_mode',e.target.value)}><option value="estimate">Hitung otomatis (simulasi expo)</option><option value="manual">Isi kWh dari bukti pengisian</option></select></label></details>
     {values.energy_mode==='manual'&&<label>Energi yang diperoleh (kWh, opsional)<input type="text" inputMode="decimal" maxLength={16} placeholder="Contoh: 33,57" aria-describedby="token-energy-help" value={values.energy_kwh} onChange={e=>change('energy_kwh',e.target.value)}/><small id="token-energy-help">Isi kWh dari bukti pengisian, bukan counter PZEM. Kosong berarti belum diketahui.</small></label>}
     <label>Catatan (opsional)<textarea maxLength={500} value={values.note} onChange={e=>change('note',e.target.value)}/></label>
    </div>
    {values.energy_mode==='estimate'&&<aside className="token-estimate-preview" aria-live="polite"><strong>Energi token: {estimate?.data?tokenKwh(estimate.data.energy_kwh):'—'}</strong><p>{!values.amount_rp?'Masukkan nominal untuk menghitung.':estimate?.error?estimate.error:!estimate?'Menghitung…':'Dihitung otomatis dari nominal pengisian.'}</p><small>Estimasi expo · akan dicatat sebagai energi masuk setelah disimpan.</small></aside>}
   </>:<p>Pembelian {tokenRupiah(row.amount_rp)} tanggal {row.purchase_date} akan dikecualikan dari total. Catatan tidak dihapus dan tidak dapat diaktifkan ulang.</p>}
   {action!=='create'&&<label>Alasan {action==='cancel'?'pembatalan':'koreksi'} (wajib)<textarea required maxLength={500} value={values.reason} onChange={e=>change('reason',e.target.value)}/></label>}
  </fieldset>
  {error&&<p className="error" role="alert">{error.message}</p>}{uncertain&&<p>Isian dikunci. Retry memakai payload, versi, dan Idempotency-Key yang sama.</p>}
  <div className="admin-form-actions"><button type={uncertain?'button':'submit'} onClick={uncertain?()=>execute():undefined} disabled={busy||error?.code==='stale_version'||!uncertain&&estimateBlocked}>{busy?'Menyimpan…':uncertain?'Ulangi aksi yang sama':action==='cancel'?'Konfirmasi pembatalan':'Simpan'}</button>{error?.code==='stale_version'&&<button type="button" onClick={()=>{onSaved();onClose();}}>Muat versi terbaru</button>}<button type="button" disabled={busy} onClick={close}>Tutup</button></div>
 </form></dialog>;
}
