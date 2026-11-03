import React,{useEffect,useState} from 'react';
import {getJson} from './data.js';
import {useTestData} from './data-view.jsx';
import {viewPath} from '../src/display-policy.js';
import {sessionDate} from './sessions-data.js';

export function RfidDevices(){
 const showTestData=useTestData(),[devices,setDevices]=useState(null),[error,setError]=useState('');
 useEffect(()=>{
  const c=new AbortController();let running=false;
  async function poll(){
   if(running||c.signal.aborted||document.hidden)return;running=true;
   try{const r=await getJson(viewPath('/api/owner/rfid-devices',showTestData),c.signal);if(!c.signal.aborted){setDevices(r.data);setError('');}}
   catch(e){if(!c.signal.aborted)setError(e.message);}finally{running=false;}
  }
  poll();const timer=setInterval(poll,5000);document.addEventListener('visibilitychange',poll);
  return()=>{c.abort();clearInterval(timer);document.removeEventListener('visibilitychange',poll);};
 },[showTestData]);
 return <section className="panel" aria-labelledby="rfid-devices-heading">
  <div className="panel-heading"><div><p className="eyebrow">PERANGKAT RFID</p><h2 id="rfid-devices-heading">Koneksi dan pembacaan kartu</h2><p className="rfid-description">Pantau koneksi pembaca RFID dan status kartu yang terakhir digunakan.</p></div><span>Pembaruan otomatis</span></div>
  {error&&<p className="error" role="alert">{error} Status terakhir mungkin belum diperbarui.</p>}
  {devices===null?<p className="empty">{error?'Status perangkat belum tersedia.':'Memuat perangkat RFID…'}</p>:!devices.length?<p className="empty">Belum ada perangkat RFID terhubung. Periksa koneksi perangkat.</p>:<div className="device-health-grid">{devices.map(d=><article key={d.id}>
   <div><h3>{d.display_name||d.device_uid}</h3><span className={`pill ${!error&&d.connection==='online'?'green':''}`}>{error?'Status belum tersedia':d.connection==='online'?'Terhubung':d.connection==='offline'?'Terputus / belum diperbarui':'Belum pernah terhubung'}</span></div>
   <code>{d.device_uid}</code><dl>
    <dt>Laporan perangkat</dt><dd>{sessionDate(d.received_at)}</dd>
    <dt>Pembaca kartu</dt><dd>{d.reader_state==='ready'?'Terdeteksi':d.reader_state==='error'?'Perlu diperiksa':d.reader_state==='unavailable'?'Belum terdeteksi':'Belum diuji'}</dd>
    <dt>Waktu perangkat</dt><dd>{d.ntp_synced?'Tersinkron':'Belum tersinkron'}</dd>
    <dt>Tap terakhir</dt><dd>{sessionDate(d.last_tap_at)}</dd>
    <dt>UID kartu</dt><dd><code>{d.last_card_uid||'Belum ada tap yang diterima'}</code></dd>
    <dt>Pendaftaran kartu</dt><dd>{!d.last_card_uid?'Belum ada kartu terbaca':d.card_registered?'Terdaftar':'Kartu belum terdaftar'}</dd>
    {d.last_tap_reason&&<><dt>Hasil tap</dt><dd>{d.last_tap_reason==='unknown_reader'?'Pembaca kartu belum dihubungkan ke fasilitas':d.last_tap_reason==='invalid_card_or_account'?'Kartu atau akun belum sah':'Tap memerlukan pemeriksaan sebelum menjadi sesi pemakaian.'}</dd></>}
    {d.pending_tap&&<><dt>Pengiriman tap</dt><dd>Menunggu konfirmasi</dd></>}
   </dl>
  </article>)}</div>}
 </section>;
}
