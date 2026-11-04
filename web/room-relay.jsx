import React,{useEffect,useRef,useState} from 'react';
import {loadRoomRelay,relayAction,sendRelayAction,relayStateLabel,relayBlocked,relayCommandLabel} from './room-relay-data.js';
import {Icon} from './interface-icon.jsx';
import './room-relay.css';

const when=value=>value?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'medium'}).format(new Date(value))+' WIB':'Belum tersedia';
export function RoomRelayControl({user,meter}){
  return user?.role==='owner'&&meter?.kind==='room'?<OwnerRoomRelay key={`${user.id}:${meter.id}`} user={user} meter={meter}/>:null;
}
function OwnerRoomRelay({user,meter}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
  const [choice,setChoice]=useState(null),[reason,setReason]=useState(''),[pending,setPending]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const mounted=useRef(true),actionController=useRef(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;actionController.current?.abort();};},[]);
  useEffect(()=>{
    const controller=new AbortController();let running=false;
    async function poll(){if(running||document.hidden||controller.signal.aborted)return;running=true;
      try{const value=await loadRoomRelay(meter.room_id,user.id,controller.signal);if(value.meter_id!==meter.id)throw new Error('Pemasangan meter sudah berubah. Muat ulang daftar meter sebelum mengontrol relay.');if(!controller.signal.aborted){setData(value);setError('');}}
      catch(e){if(!controller.signal.aborted){setData(null);setError(e.message);}}finally{running=false;}}
    poll();const timer=setInterval(poll,5000);document.addEventListener('visibilitychange',poll);
    return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',poll);};
  },[meter.room_id,user.id,refresh]);
  async function submit(event){event.preventDefault();if(busy)return;
    let action=pending;
    try{action??=relayAction(data,choice,reason,user.id);}catch(e){setError(e.message);return;}
    setPending(action);setBusy(true);setError('');const controller=new AbortController();actionController.current=controller;
    try{await sendRelayAction(action,controller.signal);if(!mounted.current)return;setPending(null);setChoice(null);setReason('');setNotice('Permintaan dicatat. Tunggu konfirmasi perangkat pada riwayat.');setRefresh(v=>v+1);}
    catch(e){if(!mounted.current)return;setError(e.message);if(!e.retry)setPending(null);}
    finally{if(mounted.current)setBusy(false);}
  }
  const blocked=relayBlocked[data?.blocked_reason];
  return <section className="panel room-relay" aria-labelledby={`relay-${meter.id}`}>
    <div className="panel-heading"><div><p className="eyebrow">KONTROL OWNER</p><h2 id={`relay-${meter.id}`}>Relay kamar</h2></div><span className={`pill ${data?.fresh?'green':''}`}>{relayStateLabel(data)}</span></div>
    <p>Kontrol manual untuk kamar yang dipilih. Perintah baru dianggap terkonfirmasi setelah perangkat melaporkan hasilnya.</p>
    {data&&<p className="subtle">{data.room_name} · {data.device_uid}<br/>Laporan terakhir: {when(data.last_reported_at)}</p>}
    {blocked&&<p className="room-relay-status">{blocked}</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {!data&&!error&&<p role="status">Memeriksa kesiapan kontrol…</p>}
    <div className="room-relay-buttons">
      <button className="relay-primary" type="button" disabled={!data?.can_control||Boolean(pending)||busy} onClick={()=>{setChoice('on');setReason('');setNotice('');}}><Icon name="powerSwitch" size={17}/>Minta ON</button>
      <button className="relay-secondary" type="button" disabled={!data?.can_control||Boolean(pending)||busy} onClick={()=>{setChoice('off');setReason('');setNotice('');}}><Icon name="powerSwitch" size={17}/>Minta OFF</button>
      <button type="button" disabled={busy} onClick={()=>setRefresh(v=>v+1)}><Icon name="refresh" size={17}/>Perbarui status</button>
    </div>
    {choice&&<form className="room-relay-confirm" onSubmit={submit}>
      <h3>Konfirmasi permintaan {choice.toUpperCase()}</h3><p>Tujuan: {data?.room_name||'Kamar yang dipilih'} · {data?.device_uid||'Perangkat belum tersedia'}</p>
      <label>Alasan tindakan<textarea value={reason} required maxLength={500} disabled={Boolean(pending)||busy} onChange={e=>setReason(e.target.value)}/></label>
      <div className="room-relay-confirm-actions">
        <button className="relay-primary" type="submit" disabled={busy||(!pending&&!data?.can_control)}>{busy?'Mengirim…':pending?'Periksa / ulangi permintaan yang sama':`Kirim permintaan ${choice.toUpperCase()}`}</button>
        {!pending&&!busy&&<button type="button" onClick={()=>setChoice(null)}>Batal</button>}
      </div>
    </form>}
    {Boolean(data?.history.length)&&<div className="billing-table-wrap"><table className="billing-table"><caption>Riwayat kontrol kamar</caption><thead><tr><th>Waktu</th><th>Permintaan</th><th>Hasil</th><th>Alasan owner</th></tr></thead><tbody>{data.history.map(c=><tr key={c.id}><td data-label="Waktu">{when(c.issued_at)}</td><td data-label="Permintaan">{c.desired_state.toUpperCase()}</td><td data-label="Hasil">{relayCommandLabel[c.status]||'Belum diketahui'}{c.confirmed_at&&<small>{when(c.confirmed_at)}</small>}</td><td data-label="Alasan owner">{c.reason}</td></tr>)}</tbody></table></div>}
    <p className="subtle">Status menunjukkan laporan relay dari perangkat. Kondisi listrik pada jalur kamar perlu diperiksa langsung.</p>
  </section>;
}
