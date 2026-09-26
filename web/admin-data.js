// Explicit projection: never pass raw API objects to details, search, or the DOM.
const common=['id','property_id','source','row_version','updated_at'];
const field=(key,label,type='text')=>({key,label,type});
export const adminSections=[
 {key:'properties',name:'Properti',note:'Nama dan zona waktu properti. Mengganti nama tidak mengubah ID maupun histori terkait.',fields:[field('name','Nama'),field('timezone','Zona waktu'),field('created_at','Dibuat','date')],actions:'Ubah nama properti'},
 {key:'rooms',name:'Kamar',note:'Identitas kamar dan masa aktifnya.',fields:[field('code','Kode'),field('name','Nama'),field('active_from','Aktif sejak','date'),field('active_until','Aktif sampai','date')],actions:'Tambah kamar, edit nama, nonaktifkan'},
 {key:'tenants',name:'Tenant',note:'Membership tenant pada properti Anda. Tidak memuat credential.',unpaged:true,fields:[field('name','Nama'),field('email','Email'),field('user_id','ID tenant'),field('status','Membership'),field('is_active','Akun aktif','boolean'),field('created_at','Dibuat','date'),field('ended_at','Berakhir','date')],actions:'Buat invitation tenant'},
 {key:'occupancies',name:'Occupancy',note:'Masa tinggal penghuni; riwayat tidak dipindahkan.',unpaged:true,fields:[field('user_id','ID tenant'),field('room_id','ID kamar'),field('starts_at','Mulai','date'),field('ends_at','Selesai','date')],actions:'Tambah, akhiri, pindah kamar'},
 {key:'rfid-cards',name:'Kartu RFID',note:'Pendaftaran kartu. UID mentah tidak ditampilkan.',unpaged:true,fields:[field('label','Label'),field('user_id','ID tenant'),field('registered_at','Terdaftar','date'),field('revoked_at','Dicabut','date')],actions:'Daftar kartu, revoke, replace'},
 {key:'facilities',name:'Fasilitas',note:'Beban komunal bersama atau yang dapat diatribusikan.',fields:[field('name','Nama'),field('load_type','Jenis beban'),field('is_active','Aktif','boolean')],actions:'Tambah, nonaktifkan'},
 {key:'devices',name:'Device',note:'Perangkat dan status administrasinya, bukan indikator koneksi MQTT.',fields:[field('display_name','Nama'),field('device_uid','Identitas device'),field('status','Status perangkat'),field('deactivated_at','Dinonaktifkan','date')],actions:'Tambah, nonaktifkan'},
 {key:'meter-assets',name:'Aset Meter',note:'Meter fisik, terpisah dari riwayat pemasangannya.',fields:[field('label','Label'),field('serial_number','Nomor seri'),field('model','Model'),field('status','Status aset'),field('retired_at','Pensiun','date')],actions:'Tambah, retire'},
 {key:'meter-installations',name:'Pemasangan Meter',note:'Relasi meter, device, channel, dan titik ukur.',fields:[field('meter_asset_id','ID aset meter'),field('device_id','ID device'),field('kind','Jenis titik ukur'),field('channel_no','Channel'),field('room_id','ID kamar'),field('communal_load_id','ID fasilitas'),field('installed_at','Dipasang','date'),field('retired_at','Dilepas','date')],actions:'Tambah, retire, move'},
 {key:'readers',name:'RFID Reader',note:'Mapping pembaca kartu ke fasilitas.',fields:[field('device_id','ID device'),field('reader_channel','Channel reader'),field('communal_load_id','ID fasilitas'),field('active_from','Aktif sejak','date'),field('active_until','Aktif sampai','date')],actions:'Tambah, retire'},
];
export function projectRecord(section,row){return Object.fromEntries([...common,...section.fields.map(f=>f.key)].filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]));}
export async function adminRequest(path,signal,request=fetch,accountId){
 let response;
 try{response=await request(path,{cache:'no-store',credentials:'same-origin',headers:accountId?{'X-Account-ID':accountId}:{},signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});}
 catch(e){if(signal.aborted)throw e;throw new Error('Tidak dapat menghubungi layanan. Periksa koneksi lalu coba lagi.');}
 if(response.status===401){if(!signal.aborted&&typeof window!=='undefined')window.dispatchEvent(new Event('session-expired'));throw Object.assign(new Error('Sesi berakhir. Silakan masuk kembali.'),{status:401});}
 if(response.status===403)throw Object.assign(new Error('Akses Administrasi hanya tersedia bagi owner.'),{status:403});
 if(response.status===404)throw new Error('Data tidak ditemukan atau tidak dapat diakses oleh akun ini.');
 if(!response.ok)throw new Error('Daftar belum dapat dimuat. Coba lagi setelah layanan pulih.');
 return response.json();
}
export async function loadAdminSection(section,signal,request=adminRequest){
 const records=new Map(),seen=new Set();let after=null;
 do{
  const query=section.unpaged?'':`?limit=100${after?`&after=${encodeURIComponent(after)}`:''}`;
  const result=await request(`/api/owner/${section.key}${query}`,signal);
  if(!Array.isArray(result.data))throw new Error('Format daftar tidak sesuai. Muat ulang data.');
  for(const row of result.data)records.set(row.id,projectRecord(section,row));
  after=section.unpaged?null:result.next_after;
  if(after&&seen.has(after))throw new Error('Pagination API tidak bergerak. Daftar tidak ditampilkan sebagai hasil lengkap.');
  if(after)seen.add(after);
 }while(after&&!signal.aborted);
 if(signal.aborted)throw new DOMException('Aborted','AbortError');
 return [...records.values()];
}
const states={active:'Aktif',inactive:'Nonaktif',retired:'Pensiun',invited:'Diundang',ended:'Berakhir',shared:'Bersama',attributable:'Penggunaan tercatat',main:'Utama',room:'Kamar',communal:'Komunal'};
export function displayValue(value,type='text'){
 if(value===null||value===undefined||value==='')return 'Tidak tersedia';
 if(type==='date')return Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(value))+' WIB':'Tanggal tidak tersedia';
 if(type==='boolean')return value?'Ya':'Tidak';
 return states[value]||String(value);
}
export function recordStatus(section,row,now=Date.now()){
 if(row.is_active===false&&section.key!=='tenants')return {label:'Nonaktif',group:'inactive'};
 if(row.status)return {label:states[row.status]||'Status belum dikenal',group:row.status==='active'?'active':'inactive'};
 const start=row.starts_at||row.active_from||row.registered_at||row.installed_at;
 const end=row.ends_at||row.active_until||row.revoked_at||row.retired_at;
 if(end&&Date.parse(end)<=now)return {label:row.revoked_at?'Dicabut':'Berakhir',group:'inactive'};
 if(start&&Date.parse(start)>now)return {label:'Terjadwal',group:'scheduled'};
 return {label:end?'Aktif · akhir terjadwal':'Aktif',group:'active'};
}
export function recordTitle(section,row){return row.name||row.label||row.display_name||row.code||`${section.name} · ${row.id.slice(-8)}`;}
