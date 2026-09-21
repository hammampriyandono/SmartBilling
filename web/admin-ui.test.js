import test from 'node:test';
import assert from 'node:assert/strict';
import {adminSections,projectRecord,loadAdminSection,adminRequest,recordStatus,displayValue} from './admin-data.js';
test('Administrasi: proyeksi field membuang secret, UID kartu, token dan payload',()=>{
 for(const section of adminSections){const row=projectRecord(section,{id:'safe',name:'nama',uid:'SECRET',password:'SECRET',password_hash:'SECRET',token:'SECRET',token_sha256:'SECRET',payload:'SECRET'});assert.equal(JSON.stringify(row).includes('SECRET'),false);}
});
test('Administrasi: semua halaman API dimuat, duplikat ID dihapus, cursor macet/error tidak menjadi hasil lengkap',async()=>{
 const section=adminSections[0],signal=new AbortController().signal;let calls=0;
 const rows=await loadAdminSection(section,signal,async path=>{calls++;return path.includes('after=')?{data:[{id:'a'},{id:'b'}],next_after:null}:{data:[{id:'a'}],next_after:'a'};});
 assert.equal(calls,2);assert.deepEqual(rows.map(r=>r.id),['a','b']);
 await assert.rejects(()=>loadAdminSection(section,signal,async()=>({data:[],next_after:'same'})),/Pagination/);
 await assert.rejects(()=>loadAdminSection(section,signal,async path=>{if(path.includes('after='))throw new Error('offline');return {data:[{id:'a'}],next_after:'a'};}),/offline/);
});
test('Administrasi: endpoint tanpa pagination tidak mengirim parameter yang tidak didukung',async()=>{
 for(const section of adminSections.filter(s=>s.unpaged)){let calls=0;await loadAdminSection(section,new AbortController().signal,async path=>{calls++;assert.equal(path.includes('?'),false);return {data:[]};});assert.equal(calls,1);}
});
test('Administrasi: pembacaan selalu GET, header akun, 401/403/404 aman',async()=>{
 const signal=new AbortController().signal,oldWindow=globalThis.window;let expired=false;
 try{globalThis.window={dispatchEvent:e=>{expired=e.type==='session-expired';}};
  for(const status of [401,403,404,503])await assert.rejects(()=>adminRequest('/api/owner/rooms',signal,async(_path,opts)=>{assert.equal(opts.method,undefined);assert.equal(opts.body,undefined);assert.equal(opts.headers['X-Account-ID'],'owner-id');return new Response('{"error":"SECRET"}',{status});},'owner-id'),e=>!e.message.includes('SECRET'));
  assert.equal(expired,true);
 }finally{globalThis.window=oldWindow;}
});
test('Administrasi: status temporal memakai batas [awal,akhir) dan nilai kosong bukan nol',()=>{
 const s=adminSections.find(s=>s.key==='occupancies'),now=Date.parse('2026-09-21T00:00:00Z');
 assert.equal(recordStatus(s,{starts_at:'2026-09-22T00:00:00Z'},now).group,'scheduled');
 assert.equal(recordStatus(s,{starts_at:'2026-09-20T00:00:00Z',ends_at:'2026-09-21T00:00:00Z'},now).group,'inactive');
 assert.equal(recordStatus(s,{starts_at:'2026-09-21T00:00:00Z'},now).group,'active');
 assert.equal(displayValue(null),'Tidak tersedia');assert.equal(displayValue(0),'0');
});
