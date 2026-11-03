import React,{useEffect,useState} from 'react';
import {decimal} from './data.js';
import {useTestData} from './data-view.jsx';
import {sessionDate} from './sessions-data.js';
import {facilityReadingState,loadFacilityMonitoring} from './facility-monitoring-data.js';
import './facility-monitoring.css';

const fields=[['Daya','power_w','W','ϟ'],['Tegangan','voltage_v','V','↗'],['Arus','current_a','A','≈'],
 ['Energi kumulatif','energy_kwh','kWh','∑'],['Frekuensi','frequency_hz','Hz','∿']];
const readingTime=value=>Number.isFinite(Date.parse(value))?sessionDate(value):'Belum tersedia';

export function FacilityReading({meter,reading,error='',now=Date.now()}) {
 const state=error?{label:'Pembaruan pembacaan gagal',tone:'amber'}:facilityReadingState(reading,now);
 const values=!error&&reading?.quality==='valid'?reading:null;
 return <article className="facility-reading" aria-label={`Pembacaan ${meter.facility.name}`}>
  <div className="facility-reading-heading"><h3>{meter.facility.name}</h3><span className={`pill ${state.tone}`}>{state.label}</span></div>
  {error&&<p className="error" role="alert">{error}</p>}
  <div className="reading-note"><span>Diukur: {readingTime(reading?.measured_at)} · WIB</span><span>Meter · channel {meter.channel_no}</span></div>
  <div className="metrics facility-metrics">{fields.map(([label,field,unit,icon])=><div className="metric" key={field}>
   <div className="metric-label">{label}<span aria-hidden="true">{icon}</span></div>
   <div className={`metric-value ${values?.[field]==null?'unavailable':''}`} title={values?.[field]??undefined}>{decimal(values?.[field],field==='energy_kwh'?9:3)}{values?.[field]!=null&&unit&&<small>{unit}</small>}</div>
   <p>{field==='energy_kwh'?'Total energi tercatat pada meter':'Nilai pada waktu pengukuran terakhir'}</p>
  </div>)}</div>
  <p className="received">Data diterima: {readingTime(reading?.received_at)} · WIB</p>
 </article>;
}

// Communal telemetry remains owner-only, following the existing API scope.
export function FacilityMonitoring({user,...props}) {
 return user.role==='owner'?<OwnerFacilityMonitoring key={user.id} {...props}/>:null;
}

function OwnerFacilityMonitoring({facilityId='',refresh=0}) {
 const showTestData=useTestData(),[result,setResult]=useState(null),[retry,setRetry]=useState(0);
 const scope=`${facilityId}:${showTestData}`;
 useEffect(()=>{
  const controller=new AbortController();let running=false;
  setResult(null);
  async function poll() {
   if(running||controller.signal.aborted||document.hidden)return;running=true;
   try {
    const rows=await loadFacilityMonitoring(controller.signal,{facilityId,showTestData});
    if(!controller.signal.aborted)setResult({scope,rows,now:Date.now()});
   } catch(error) {
    if(!controller.signal.aborted)setResult({scope,error:error.message});
   } finally {running=false;}
  }
  poll();const timer=setInterval(poll,5000);document.addEventListener('visibilitychange',poll);
  return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',poll);};
 },[scope,refresh,retry]);
 const current=result?.scope===scope?result:null;
 return <section className="panel facility-monitoring" aria-labelledby="facility-monitoring-heading">
  <div className="panel-heading"><div><p className="eyebrow">PEMBACAAN METER FASILITAS</p><h2 id="facility-monitoring-heading">Monitoring listrik fasilitas</h2></div><button type="button" className="refresh-button" onClick={()=>setRetry(v=>v+1)}>↻ Perbarui pembacaan</button></div>
  <p className="rfid-description">Pembacaan listrik terbaru dari fasilitas bersama, diperbarui otomatis.</p>
  {current?.error?<p className="error" role="alert">{current.error} Pembacaan fasilitas belum dapat dimuat.</p>:!current?<p className="empty" role="status">Memuat pembacaan fasilitas…</p>:!current.rows.length?<p className="empty" role="status">{facilityId?'Belum ada meter aktif yang terpasang pada fasilitas ini.':'Belum ada meter aktif yang terpasang pada fasilitas Anda.'}</p>:current.rows.map(row=><FacilityReading key={row.meter.id} {...row} now={current.now}/>)}
  <div className="panel-foot">Energi kumulatif adalah total energi tercatat pada meter. Energi tiap pemakaian tersedia di riwayat sesi.</div>
 </section>;
}
