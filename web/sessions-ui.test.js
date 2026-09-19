import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionRange,facilityPages,energyReason,reviewReason} from './sessions-data.js';
import {decimal,getJson,setAccountId} from './data.js';
test('RFID UI: rentang WIB akhir inklusif, batas 31 hari dan tanggal invalid',()=>{
 assert.deepEqual(sessionRange({from:'2026-09-17',to:'2026-09-19'}),{from:'2026-09-17T00:00:00+07:00',to:'2026-09-20T00:00:00+07:00'});
 assert.doesNotThrow(()=>sessionRange({from:'2026-01-01',to:'2026-01-31'}));
 for(const range of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-01-01',to:'2026-02-01'},{from:'2026-09-19',to:'2026-09-17'}])assert.throws(()=>sessionRange(range));
});
test('RFID UI: fasilitas multi-halaman, error dan cursor berulang tidak menjadi daftar lengkap',async()=>{
 const signal=new AbortController().signal;let calls=[];
 const rows=await facilityPages(signal,async path=>{calls.push(path);return path.includes('after=')?{data:[{id:'b'}],next_after:null}:{data:[{id:'a'}],next_after:'a'};});
 assert.deepEqual(rows.map(r=>r.id),['a','b']);assert.ok(calls[1].includes('after=a'));assert.ok(calls.every(p=>p.includes('limit=100')));
 await assert.rejects(()=>facilityPages(signal,async()=>({data:[],next_after:'same'})),/Pagination/);
 await assert.rejects(()=>facilityPages(signal,async path=>{if(path.includes('after='))throw new Error('offline');return {data:[{id:'a'}],next_after:'a'};}),/offline/);
});
test('RFID UI: null bukan nol dan alasan aman tanpa kode/payload asing',()=>{
 assert.equal(decimal(null,9),'Tidak tersedia');assert.equal(decimal('0.000000000',9),'0');
 assert.match(energyReason('missing_boundary',null),/waktu tap/);assert.match(energyReason('counter_reset',null),/reset/);
 assert.equal(energyReason('PRIVATE_UID',null).includes('PRIVATE_UID'),false);
 assert.equal(reviewReason('PRIVATE_UID').includes('PRIVATE_UID'),false);
});
test('RFID UI: HTTP 401 memicu pembersihan sesi existing dan header akun tetap dikirim',async()=>{
 const previousFetch=globalThis.fetch,previousWindow=globalThis.window;let expired=false,headers;
 try{globalThis.window={dispatchEvent:e=>{expired=e.type==='session-expired';}};globalThis.fetch=async(_url,options)=>{headers=options.headers;return new Response('{}',{status:401});};setAccountId('test-owner');
  await assert.rejects(()=>getJson('/api/usage-sessions',new AbortController().signal),/401/);assert.equal(expired,true);assert.equal(headers['X-Account-ID'],'test-owner');
 }finally{globalThis.fetch=previousFetch;globalThis.window=previousWindow;setAccountId(null);}
});
