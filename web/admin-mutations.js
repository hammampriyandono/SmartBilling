// Pending requests remain in memory only. The serialized body is immutable across retries.
export function newAction(path,method,body,accountId){return Object.freeze({path,method,body:JSON.stringify(body),accountId,key:crypto.randomUUID()});}
const messages={stale_version:'Data sudah berubah. Tutup form, muat ulang daftar, lalu tinjau versi terbaru sebelum mengajukan aksi baru.',idempotency_in_progress:'Aksi ini masih diproses. Tunggu sebentar lalu ulangi aksi yang sama.',idempotency_key_conflict:'Identitas aksi telah dipakai untuk permintaan berbeda. Jangan kirim ulang; tutup dan periksa daftar terlebih dahulu.',simulation_read_only:'Data simulasi dilindungi. Gunakan record manual baru.',email_unavailable:'Email sudah digunakan. Gunakan email tenant baru.',active_membership_required:'Tenant harus memiliki membership aktif pada properti ini.',active_installation_blocks_retirement:'Aset masih terpasang. Akhiri pemasangannya terlebih dahulu.',invalid_card_uid:'Identitas kartu harus berisi 8, 14, atau 20 karakter heksadesimal.',property_mismatch:'Pilih record dalam properti yang sama.',cross_property_move_not_allowed:'Pindah occupancy hanya dapat dilakukan dalam properti yang sama.'};
export function mutationError(status,code){
 code=typeof code==='string'?code:undefined;
 const retry=status>=500||code==='idempotency_in_progress';
 const message=messages[code]||(code?.startsWith('open_session_blocks_')?'Masih ada sesi fasilitas terbuka yang menghalangi aksi ini.':status===401?'Sesi berakhir. Silakan masuk kembali.':status===403?(code?.includes('csrf')?'Verifikasi keamanan CSRF gagal. Ulangi aksi yang sama untuk mengambil token keamanan baru.':'Akses ditolak atau sesi akun telah berubah.'):status===404?'Record tidak ditemukan atau tidak dapat diakses.':status===409?'Aksi berbenturan dengan kondisi data. Muat ulang dan periksa relasi serta rentang waktunya.':status>=500?'Hasil aksi belum dapat dipastikan. Ulangi dengan identitas yang sama; jangan membuat aksi pengganti.':'Data belum dapat diterima. Periksa isian, relasi, serta waktu yang dipilih.');
 return Object.assign(new Error(message),{status,code,retry:retry||(status===403&&code?.includes('csrf'))});
}
export async function sendAction(action,signal,request=fetch){
 const options={credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])};
 async function read(response){signal.throwIfAborted();if(response.status===401&&typeof window!=='undefined')window.dispatchEvent(new Event('session-expired'));let result;try{result=await response.json();}catch{if(response.ok)throw mutationError(503);result={};}signal.throwIfAborted();if(!response.ok)throw mutationError(response.status,result?.error);return result;}
 try{
  const {csrf}=await read(await request('/api/auth/csrf',{...options,headers:{'X-Account-ID':action.accountId}}));
  return await read(await request(action.path,{...options,method:action.method,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'X-Account-ID':action.accountId,'Idempotency-Key':action.key},body:action.body}));
 }catch(e){if(signal.aborted)throw e;if(e.status)throw e;throw Object.assign(new Error('Koneksi terputus atau batas waktu terlewati. Hasil belum pasti; ulangi aksi yang sama dengan key tetap.'),{retry:true});}
}
const f=(key,label,type='text',extra={})=>({key,label,type,...extra});
const property=f('property_id','Properti','property');
const at=(key,label)=>f(key,label,'datetime-local');
const effective=at('effective_at','Waktu efektif');
const room=f('room_id','Kamar','ref',{section:'rooms'}),device=f('device_id','Device','ref',{section:'devices'});
const kind=f('kind','Jenis titik ukur','select',{options:[['main','Utama'],['room','Kamar'],['communal','Komunal']]});
const point=[device,kind,room,f('communal_load_id','Fasilitas','ref',{section:'facilities'}),f('channel_no','Channel','number')];
const tenant=f('tenant_id','Tenant aktif','tenant');
const uid=f('uid','Identitas kartu baru (tersamarkan)','password',{maxLength:20,pattern:'(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{14}|[0-9a-fA-F]{20})'});
export const createFields={
 rooms:[property,f('code','Kode kamar','text',{maxLength:32}),f('name','Nama kamar'),at('active_from','Aktif sejak')],
 tenants:[property,f('name','Nama tenant'),f('email','Email tenant','email',{maxLength:254}),at('expires_at','Invitation berlaku sampai')],
 occupancies:[property,tenant,room,at('starts_at','Mulai tinggal'),{...at('ends_at','Selesai tinggal (opsional)'),optional:true}],
 'rfid-cards':[property,tenant,uid,f('label','Label kartu','text',{maxLength:100}),at('registered_at','Terdaftar sejak')],
 facilities:[property,f('name','Nama fasilitas'),f('load_type','Jenis beban','select',{options:[['shared','Bersama'],['attributable','Penggunaan tercatat']]})],
 devices:[property,f('device_uid','Identitas device','text',{maxLength:80}),f('display_name','Nama device')],
 'meter-assets':[property,f('label','Label aset'),f('serial_number','Nomor seri (opsional)','text',{optional:true,maxLength:100}),f('model','Model (opsional)','text',{optional:true,maxLength:100})],
 'meter-installations':[{...property,key:'_property'},f('meter_asset_id','Aset meter','ref',{section:'meter-assets'}),...point,at('installed_at','Waktu pemasangan')],
 readers:[property,device,f('reader_channel','Channel reader','number'),f('facility_id','Fasilitas','ref',{section:'facilities'}),at('active_from','Aktif sejak')]
};
export const lifecycle={properties:[['edit','Ubah nama properti']],rooms:[['edit','Edit nama']],facilities:[['deactivate','Nonaktifkan']],devices:[['deactivate','Nonaktifkan']],'meter-assets':[['retire','Pensiunkan']],'meter-installations':[['move','Pindah pemasangan'],['retire','Akhiri pemasangan']],readers:[['retire','Akhiri reader']],'rfid-cards':[['replace','Ganti kartu'],['revoke','Cabut kartu']],occupancies:[['move','Pindah kamar'],['end','Akhiri occupancy']],tenants:[]};
export function actionFields(section,action){
 if(action==='create')return createFields[section];
 if(action==='edit')return [f('name',section==='properties'?'Nama properti':'Nama kamar')];
 if(section==='rfid-cards')return [property,...(action==='replace'?[uid,f('label','Label kartu pengganti','text',{maxLength:100})]:[]),effective];
 if(action==='move')return section==='occupancies'?[f('target_room_id','Kamar tujuan','ref',{section:'rooms'}),effective]:[...point,effective];
 if(['devices','facilities'].includes(section))return [];
 return [effective];
}
export function fieldsForValues(fields,values){return fields.filter(f=>f.key!=='room_id'||!fields.some(x=>x.key==='kind')||values.kind==='room').filter(f=>f.key!=='communal_load_id'||values.kind==='communal');}
export function actionBody(fields,values,row){
 const body={};for(const f of fieldsForValues(fields,values)){if(f.key.startsWith('_'))continue;const v=values[f.key];if(!v&&f.optional)continue;body[f.key]=f.type==='datetime-local'?new Date(v).toISOString():f.type==='number'?Number(v):v;}
 const start=row?.registered_at||row?.installed_at||row?.starts_at||row?.active_from;
 if(body.effective_at&&start&&Date.parse(body.effective_at)<=Date.parse(start))throw new Error('Waktu efektif harus setelah waktu mulai record. Pilih waktu hingga detik yang lebih akhir.');
 if(body.ends_at&&Date.parse(body.ends_at)<=Date.parse(body.starts_at))throw new Error('Waktu selesai tinggal harus setelah waktu mulai.');
 if(body.expires_at&&Date.parse(body.expires_at)<=Date.now())throw new Error('Batas berlaku invitation harus di masa depan.');
 body.reason=values.reason.trim();if(row)body.row_version=row.row_version;return body;
}
