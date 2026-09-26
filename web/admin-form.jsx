import React,{useEffect,useRef,useState} from 'react';
import {adminSections,recordTitle} from './admin-data.js';
import {actionFields,fieldsForValues,actionBody,newAction,sendAction,lifecycle} from './admin-mutations.js';
function localTime(date){const d=new Date(date);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,19);}
export function AdminForm({section,action,row,data,user,onClose,onSaved}){
 const fields=actionFields(section.key,action),dialog=useRef(null),pending=useRef(null),controller=useRef(null),alive=useRef(true),lock=useRef(false);
 const propertyIds=(data.properties||[]).map(r=>r.id);
 const rowProperty=row?.property_id||data.rooms?.find(r=>r.id===row?.room_id)?.property_id;
 const [values,setValues]=useState(()=>Object.fromEntries([...fields.map(f=>[f.key,f.type==='password'||f.optional?'':f.type==='datetime-local'?localTime(Date.now()+(f.key==='expires_at'?7*86400000:0)):f.type==='property'?rowProperty||propertyIds[0]||'':row?.[f.key]??(f.type==='select'?f.options[0][0]:f.type==='number'?'0':'')]),['reason','']]));
 const [busy,setBusy]=useState(false),[error,setError]=useState(null),[uncertain,setUncertain]=useState(false),[success,setSuccess]=useState(null);
 const title=action==='create'?(section.key==='tenants'?'Invitation tenant':`Tambah ${section.name}`):lifecycle[section.key].find(a=>a[0]===action)[1];
 useEffect(()=>{alive.current=true;dialog.current.showModal();return()=>{alive.current=false;controller.current?.abort();pending.current=null;};},[]);
 const pid=rowProperty||values.property_id||values._property||data['meter-assets']?.find(r=>r.id===values.meter_asset_id)?.property_id;
 const locked=busy||uncertain||error?.code==='stale_version'||error?.code==='idempotency_key_conflict';
 function close(){if(busy)return;if(uncertain&&!window.confirm('Hasil aksi belum pasti. Jika menutup, retry dengan identitas yang sama tidak lagi tersedia. Periksa daftar sebelum membuat aksi baru. Tetap tutup?'))return;pending.current=null;setValues({});setSuccess(null);onClose();}
 async function execute(event){event?.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError(null);
  controller.current=new AbortController();
  try{
   if(!pending.current){const suffix=action==='create'?(section.key==='tenants'?'/invitations':''):`/${row.id}${action==='edit'?'':`/${action}`}`;pending.current=newAction(`/api/owner/${section.key}${suffix}`,action==='edit'?'PATCH':'POST',actionBody(fields,values,row),user.id);}
   const result=await sendAction(pending.current,controller.current.signal);if(!alive.current)return;
   // Never retain raw mutation records (or replay keys) after success.
   pending.current=null;setValues({});setUncertain(false);setSuccess({token:section.key==='tenants'?result.data?.token:null});onSaved();
  }catch(e){if(!alive.current)return;setError(e);setUncertain(!!e.retry);if(!e.retry)pending.current=null;}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 function options(f){
  if(f.type==='property'){const ids=row&&section.key==='rfid-cards'?propertyIds.filter(id=>data.tenants?.some(t=>t.property_id===id&&t.user_id===row.user_id)):propertyIds;return ids.map(id=>[id,`${data.properties?.find(p=>p.id===id)?.name||'Properti'} · …${id.slice(-8)}`]);}
  if(f.type==='tenant')return(data.tenants||[]).filter(t=>t.property_id===pid&&t.status==='active'&&t.is_active).map(t=>[t.user_id,t.name||t.email]);
  if(f.type==='ref')return(data[f.section]||[]).filter(r=>r.property_id===pid&&r.source!=='simulation'&&(f.key!=='target_room_id'||r.id!==row?.room_id)).map(r=>[r.id,`${recordTitle(adminSections.find(s=>s.key===f.section),r)} · …${r.id.slice(-8)}`]);
  return f.options;
 }
 function change(f,value){setValues(v=>{const next={...v,[f.key]:value};if(['property_id','_property','meter_asset_id'].includes(f.key))for(const other of fields)if(['ref','tenant'].includes(other.type)&&other.key!==f.key)next[other.key]='';return next;});}
 return <dialog className="admin-dialog" aria-labelledby="admin-form-title" ref={dialog} onCancel={e=>{e.preventDefault();close();}}><div className="admin-dialog-heading"><div><p className="eyebrow">ADMINISTRASI OWNER</p><h2 id="admin-form-title">{title}</h2></div><button type="button" disabled={busy} onClick={close} aria-label="Tutup form">Tutup</button></div>
  {success?<section role="status"><h3>Berhasil disimpan</h3><p>Daftar diperbarui dari API. Histori tetap tersimpan pada record asal.</p>{success.token&&<div className="invitation-once"><strong>Tautan aktivasi — hanya ditampilkan sekarang</strong><p>Kirim tautan ini kepada tenant. Token hanya dapat dipakai sekali dan hilang setelah layar ini ditutup, navigasi, atau logout. Email belum dikirim otomatis.</p><label>Tautan aktivasi<input readOnly autoComplete="off" value={`${window.location.origin}/#/aktivasi?token=${encodeURIComponent(success.token)}`} onFocus={e=>e.target.select()}/></label><a href={`/#/aktivasi?token=${encodeURIComponent(success.token)}`} target="_blank" rel="noreferrer">Pratinjau halaman aktivasi</a></div>}<button type="button" onClick={close}>Selesai</button></section>:<form onSubmit={execute}>
   {row&&<p>{recordTitle(section,row)} · Versi yang ditinjau: <strong>{row.row_version}</strong></p>}
   <p className="admin-description">Semua waktu mengikuti zona browser ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Waktu dikirim sebagai timestamp UTC. Aksi dicatat bersama alasan Anda.</p>
   <fieldset disabled={locked}><div className="admin-form-grid">{fieldsForValues(fields,values).map(f=>{const choices=options(f);return <label key={f.key}>{f.label}{choices?<select name={f.key} required={!f.optional} value={values[f.key]??''} onChange={e=>change(f,e.target.value)}><option value="">Pilih…</option>{choices.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>:<input name={f.key} type={f.type} required={!f.optional} maxLength={f.maxLength||120} pattern={f.pattern} min={f.type==='number'?0:undefined} step={['number','datetime-local'].includes(f.type)?1:undefined} autoComplete="off" value={values[f.key]??''} onInput={f.type==='datetime-local'?e=>change(f,e.target.value):undefined} onChange={e=>change(f,e.target.value)}/>}</label>;})}</div>
   <label>Alasan perubahan<textarea name="reason" required minLength={1} maxLength={500} value={values.reason||''} onChange={e=>setValues(v=>({...v,reason:e.target.value}))}/></label></fieldset>
   {fields.some(f=>f.type==='ref'||f.type==='tenant')&&<p className="admin-description">Pilihan dibatasi properti dan record manual. Tenant harus sudah aktif. API tetap memeriksa relasi dan masa berlaku.</p>}
   {error&&<p role="alert" className="error">{error.message}</p>}
   {uncertain&&<p>Isian dikunci agar retry memakai key, versi, dan isi aksi yang sama. Token CSRF akan diambil ulang.</p>}
   <div className="admin-form-actions">{uncertain?<button type="button" disabled={busy} onClick={()=>execute()}>Ulangi aksi yang sama</button>:<button type="submit" disabled={locked||!values.reason?.trim()}>{busy?'Menyimpan…':'Simpan perubahan'}</button>}<button type="button" disabled={busy} onClick={close}>Batal / tutup</button></div>
  </form>}
 </dialog>;
}
