import React,{useEffect,useState} from 'react';
import {getJson} from './data.js';
import {measurementDecimal} from './meter-comparison-data.js';
import './meter-comparison.css';

const labels={aligned:'Putaran selaras',waiting:'Menunggu putaran lengkap',stale:'Pembacaan lama',unsynchronized:'Waktu ukur belum selaras',incomplete_mapping:'Pemetaan belum lengkap'};
const stamp=(value,zone)=>value?new Intl.DateTimeFormat('id-ID',{timeZone:zone,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3}).format(new Date(value)):'Belum tersedia';
const value=(number,unit)=>number==null?'Belum tersedia':`${measurementDecimal(number)} ${unit}`;

export function MeterComparison({propertyId}){
 const [state,setState]=useState({propertyId:null,data:null,error:null});
 useEffect(()=>{
  if(!propertyId)return;
  const controller=new AbortController();let busy=false;
  setState({propertyId,data:null,error:null});
  async function poll(){
   if(busy||document.hidden||controller.signal.aborted)return;busy=true;
   try{const result=await getJson(`/api/owner/meter-comparison?property_id=${encodeURIComponent(propertyId)}`,controller.signal);if(!controller.signal.aborted)setState({propertyId,data:result.data,error:null});}
   catch(error){if(!controller.signal.aborted)setState(old=>({...old,error:error.message}));}
   finally{busy=false;}
  }
  poll();const timer=setInterval(poll,5000);document.addEventListener('visibilitychange',poll);
  return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',poll);};
 },[propertyId]);
 if(!propertyId)return null;
 const data=state.propertyId===propertyId?state.data:null,error=state.propertyId===propertyId?state.error:null,zone=data?.timezone||'Asia/Jakarta';
 return <section className="panel meter-comparison" aria-label="Perbandingan waktu ukur">
  <div className="panel-heading"><div><p className="eyebrow">METER UTAMA DAN CABANG</p><h2>Perbandingan waktu ukur</h2></div><span className={`pill ${data?.status==='aligned'&&!error?'':'amber'}`}>{error?'Pembaruan gagal':data?labels[data.status]:'Memuat…'}</span></div>
  <div className="comparison-content">
   <p>Bandingkan meter utama dan cabang yang diukur pada waktu berdekatan, dengan selisih maksimal 1 detik.</p>
   {error&&<p role="alert" className="error">{error} {data?'Hasil terakhir dipertahankan; periksa waktu pengukurannya.':''}</p>}
   {data&&<>
    <p className="comparison-round">{data.round_at?<>Putaran {stamp(data.round_at,zone)} · Selisih waktu {data.spread_ms} ms{data.status==='waiting'&&' · Menunggu data putaran berikutnya'}</>:<>Menunggu pembacaan lengkap dengan waktu ukur yang selaras.</>}</p>
    <div className="comparison-table-wrap"><table><thead><tr><th>Titik ukur</th><th>Waktu baca</th><th>Tegangan</th><th>Arus</th><th>Daya</th><th>Counter energi</th><th>Pemakaian antarputaran</th></tr></thead><tbody>
     {data.meters.map(m=><tr key={m.id}><th scope="row">{m.label}</th><td>{m.reading?stamp(m.reading.measured_at,zone):'Menunggu data selaras'}{!m.reading&&m.latest_measured_at&&<small>Terakhir: {stamp(m.latest_measured_at,zone)}</small>}</td><td>{value(m.reading?.voltage_v,'V')}</td><td>{value(m.reading?.current_a,'A')}</td><td>{value(m.reading?.power_w,'W')}</td><td>{value(m.reading?.energy_kwh,'kWh')}</td><td>{value(m.delta_kwh,'kWh')}{m.delta_starts_at&&<small>{stamp(m.delta_starts_at,zone)} — {stamp(m.delta_ends_at,zone)}</small>}</td></tr>)}
    </tbody></table></div>
    <div className="comparison-totals"><div><span>Jumlah daya cabang terdaftar</span><strong>{value(data.power?.registered_branches_w,'W')}</strong></div><div><span>Daya meter utama</span><strong>{value(data.power?.main_w,'W')}</strong></div><div><span>Selisih utama − cabang terdaftar</span><strong>{value(data.power?.difference_w,'W')}</strong></div></div>
    {data.energy?.starts_at&&<p>Pemakaian antarputaran {stamp(data.energy.starts_at,zone)} — {stamp(data.energy.ends_at,zone)}: cabang {value(data.energy.registered_branches_delta_kwh,'kWh')} · utama {value(data.energy.main_delta_kwh,'kWh')}.</p>}
    <p className="comparison-note">Perbandingan hanya mencakup cabang terdaftar. Selisih pengukuran belum menunjukkan pemakaian bersama atau kehilangan energi.</p>
   </>}
  </div>
 </section>;
}
