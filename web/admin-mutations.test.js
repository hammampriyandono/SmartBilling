import test from 'node:test';
import assert from 'node:assert/strict';
import {newAction,sendAction,mutationError,actionBody,actionFields} from './admin-mutations.js';
test('Retry setelah respons hilang memakai key, versi, body sama dan CSRF baru',async()=>{
 const body={name:'Kamar UI',reason:'Pengujian',row_version:2},action=newAction('/api/owner/rooms/id','PATCH',body,'owner');body.name='Berubah';let tokens=0,calls=[];
 const request=async(path,opts)=>{if(path==='/api/auth/csrf')return Response.json({csrf:`token-${++tokens}`});calls.push(opts);if(calls.length===1)throw new TypeError('response lost');return Response.json({data:{id:'saved'}});};
 await assert.rejects(()=>sendAction(action,new AbortController().signal,request),e=>e.retry);
 const result=await sendAction(action,new AbortController().signal,request);assert.equal(result.data.id,'saved');assert.equal(calls[0].body,calls[1].body);assert.equal(JSON.parse(calls[1].body).name,'Kamar UI');assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);assert.notEqual(calls[0].headers['X-CSRF-Token'],calls[1].headers['X-CSRF-Token']);assert.equal(calls[1].headers['X-Account-ID'],'owner');assert.notEqual(newAction(action.path,'PATCH',body,'owner').key,action.key);
});
test('Error mutasi aman, retry in-progress/CSRF, stale dan konflik tidak diulang otomatis',()=>{
 for(const code of ['stale_version','idempotency_key_conflict'])assert.equal(!!mutationError(409,code).retry,false);
 assert.equal(mutationError(409,'idempotency_in_progress').retry,true);assert.equal(mutationError(403,'invalid_csrf').retry,true);
 for(const status of [400,401,403,404,409,503])assert.equal(mutationError(status,'SECRET').message.includes('SECRET'),false);
});
test('401 menghapus sesi tanpa menampilkan isi error server',async()=>{
 let expired=false;const old=globalThis.window;globalThis.window={dispatchEvent(){expired=true;}};
 try{await assert.rejects(()=>sendAction(newAction('/api/owner/rooms','POST',{},'owner'),new AbortController().signal,async()=>Response.json({error:'unauthenticated'},{status:401})),e=>e.status===401);assert.equal(expired,true);}finally{globalThis.window=old;}
});
test('Batas waktu sama atau terbalik ditolak sebelum request dibuat',()=>{
 assert.throws(()=>actionBody(actionFields('rfid-cards','revoke'),{property_id:'p',effective_at:'2026-09-22T11:00:00+07:00',reason:'uji'},{row_version:1,registered_at:'2026-09-22T04:00:00Z'}),/setelah/);
 assert.throws(()=>actionBody(actionFields('occupancies','create'),{property_id:'p',tenant_id:'t',room_id:'r',starts_at:'2026-09-22T11:00:00+07:00',ends_at:'2026-09-22T10:00:00+07:00',reason:'uji'}),/setelah/);
});
test('Body instalasi hanya field API, null titik lain dihilangkan; versi/reason dan tanggal terkirim',()=>{
 const fields=actionFields('meter-installations','create');const values={_property:'p',meter_asset_id:'a',device_id:'d',kind:'main',room_id:'old',communal_load_id:'old',channel_no:'0',installed_at:'2026-09-22T10:00:00+07:00',reason:' uji '};
 assert.deepEqual(actionBody(fields,values,null),{meter_asset_id:'a',device_id:'d',kind:'main',channel_no:0,installed_at:'2026-09-22T03:00:00.000Z',reason:'uji'});
 assert.deepEqual(actionBody(actionFields('rooms','edit'),{name:'Nama',reason:'edit'},{row_version:3}),{name:'Nama',reason:'edit',row_version:3});
 assert.deepEqual(actionBody(actionFields('properties','edit'),{name:'Kos Melati',reason:'rapikan nama'},{row_version:4}),{name:'Kos Melati',reason:'rapikan nama',row_version:4});
});
test('Move/end occupancy dan replace kartu mengirim field yang didukung tanpa atribut record lama',()=>{
 const row={id:'old',row_version:7,starts_at:'2026-08-01T00:00:00Z'},effective_at='2026-08-02T00:00:01Z';
 assert.deepEqual(actionBody(actionFields('occupancies','move'),{target_room_id:'new',effective_at,reason:'move'},row),{target_room_id:'new',effective_at:'2026-08-02T00:00:01.000Z',reason:'move',row_version:7});
 assert.deepEqual(actionBody(actionFields('occupancies','end'),{effective_at,reason:'end'},row),{effective_at:'2026-08-02T00:00:01.000Z',reason:'end',row_version:7});
 assert.deepEqual(Object.keys(actionBody(actionFields('rfid-cards','replace'),{property_id:'p',uid:'AABBCCDD',label:'baru',effective_at,reason:'replace'},row)),['property_id','uid','label','effective_at','reason','row_version']);
});
test('403/404 non-JSON mempertahankan kategori error; request aborted tidak menghapus sesi baru',async()=>{
 const a=newAction('/api/owner/rooms','POST',{},'owner');
 for(const status of [403,404])await assert.rejects(()=>sendAction(a,new AbortController().signal,async()=>new Response('not JSON',{status})),e=>e.status===status&&!e.retry);
 const c=new AbortController();c.abort();await assert.rejects(()=>sendAction(a,c.signal,async()=>Response.json({error:'login_required'},{status:401})),e=>e.name==='AbortError');
});
