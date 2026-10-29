import React,{useEffect,useRef,useState} from 'react';
import {estimateRupiah,kwh} from './billing-data.js';
import {loadTenantRunning,tenantEstimateReason} from './tenant-running-data.js';

export function TenantRunningBilling({user,showTestData,onOpen,onPeriodsChanged}){
 return <RunningBilling key={`${user.id}:${showTestData}`} {...{user,showTestData,onOpen,onPeriodsChanged}}/>;
}
function RunningBilling({user,showTestData,onOpen,onPeriodsChanged}){
 const [selectedId,setSelectedId]=useState(''),[state,setState]=useState({loading:true,data:null,periods:[],error:''});
 const previous=useRef(null),changeCallback=useRef(onPeriodsChanged);changeCallback.current=onPeriodsChanged;
 useEffect(()=>{
  const c=new AbortController();let timer;
  setState(old=>({...old,data:null,loading:true,error:''}));
  async function poll(){try{
   const result=await loadTenantRunning(user.id,selectedId,showTestData,c.signal);
   if(c.signal.aborted)return;
   const signature=result.periods.map(row=>row.id).join(':');
   if(result.refreshFinals||previous.current!==null&&previous.current!==signature)changeCallback.current?.();
   previous.current=signature;setState({...result,loading:false,error:''});
  }catch(error){if(!c.signal.aborted)setState(old=>({...old,loading:false,error:error.message}));}
  finally{if(!c.signal.aborted)timer=setTimeout(poll,5000);}}
  poll();return()=>{c.abort();clearTimeout(timer);};
 },[user.id,showTestData,selectedId]);
 const data=state.data,zone=data?.timezone||'Asia/Jakarta';
 const date=(value,timeZone=zone)=>new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'medium',timeZone}).format(new Date(value));
 const stale=data?.last_measured_at&&Date.now()-Date.parse(data.last_measured_at)>180000;
 return <section className="panel tenant-latest tenant-running" aria-labelledby="tenant-running-title">
  <div className="panel-heading"><div><p className="eyebrow">TAGIHAN ANDA · PEMBARUAN OTOMATIS</p><h2 id="tenant-running-title">Estimasi Tagihan Berjalan</h2></div><span className="pill amber">Estimasi · belum final</span></div>
  <div className="tenant-latest-body">
   <p>Estimasi hanya mencakup bagian energi kamar pada masa tinggal Anda. Fasilitas RFID dan komunal bersama belum dimasukkan. Nilai final dan status pembayaran ada pada tagihan final.</p>
   {state.periods.length>1&&<label className="tenant-running-filter">Periode<select value={data?.period_id||selectedId} onChange={e=>setSelectedId(e.target.value)}>{state.periods.map(period=><option key={period.id} value={period.id}>{date(period.starts_at,period.timezone)} — {date(period.ends_at,period.timezone)} · revisi {period.revision_no}</option>)}</select></label>}
   {state.error&&<p className="error" role="status">{state.error} {data?'Estimasi terakhir tetap ditampilkan; pembaruan dicoba lagi otomatis.':'Pembaruan dicoba lagi otomatis.'}</p>}
   {state.loading?<p role="status">Memuat estimasi Anda…</p>:!data&&!state.error?<p>Belum ada periode estimasi berjalan untuk masa tinggal Anda. Tagihan yang sudah final tetap tersedia pada daftar tagihan final.</p>:data&&<>
    <p className="tenant-running-period">{date(data.starts_at)} — {date(data.ends_at)}</p>
    <dl><div className="running-cost-highlight"><dt>Estimasi biaya Anda</dt><dd aria-live="polite">{estimateRupiah(data.estimated_cost_rp)}</dd></div><div><dt>Energi bagian Anda</dt><dd>{data.energy_kwh===null?'Belum tersedia':kwh(data.energy_kwh)}</dd></div><div><dt>Pembacaan pada masa tinggal Anda</dt><dd>{data.sample_count} sampel</dd></div><div><dt>Pengukuran terakhir</dt><dd>{data.last_measured_at?date(data.last_measured_at):'Belum ada pembacaan'}</dd></div></dl>
    <p>{stale?'Sensor belum memperbarui data. Histori dan estimasi terakhir tetap tersedia.':'Estimasi diperbarui otomatis sekitar setiap 5 detik.'} Periode parsial dihitung dari interval valid; jeda tidak diisi otomatis.</p>
    <div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>Kamar Anda</th><th>Energi bagian Anda</th><th>Estimasi biaya</th><th>Keterangan</th></tr></thead><tbody>{data.rooms.map(row=><tr key={row.room_id}><td data-label="Kamar Anda">{row.room_name||row.room_code}{row.data_source==='simulation'&&<small>Data simulasi</small>}{row.data_source==='mixed'&&<small>Data campuran</small>}</td><td data-label="Energi bagian Anda">{row.energy_kwh===null?'Belum tersedia':kwh(row.energy_kwh)}</td><td data-label="Estimasi biaya">{estimateRupiah(row.estimated_cost_rp)}</td><td data-label="Keterangan">{tenantEstimateReason(row)}</td></tr>)}</tbody></table></div>
   </>}
   {onOpen&&<button type="button" onClick={onOpen}>Buka Tagihan Saya</button>}
  </div>
 </section>;
}
