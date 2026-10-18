import test from 'node:test';import assert from 'node:assert/strict';
import {tokenRupiah,tokenAction,loadTokenMonth} from './token-data.js';import {sendAction} from './admin-mutations.js';
test('token UI: Rupiah signed/zero/null dan angka melampaui safe integer tetap presisi',()=>{
 assert.equal(tokenRupiah(null),'Belum tersedia');assert.match(tokenRupiah('0'),/Rp.*0/);assert.match(tokenRupiah('-15000'),/-Rp.*15\.000/);assert.match(tokenRupiah('9007199254740993'),/9\.007\.199\.254\.740\.993/);assert.equal(tokenRupiah('1.2'),'Perlu ditinjau');
});
test('token UI: seluruh pagination, scope properti/bulan dan kosong/error bukan data rekaan',async()=>{
 const c=new AbortController(),calls=[],request=async(path,opts)=>{calls.push([path,opts]);return new Response(JSON.stringify(path.includes('summary')?{data:{tenant_total_rp:null,difference_rp:null}}:path.includes('after=')?{data:[{id:'b',purchase_date:'2026-10-02'}],next_after:null}:{data:[{id:'a',purchase_date:'2026-10-01'}],next_after:'a'}),{status:200});};
 const result=await loadTokenMonth('property','2026-10',c.signal,'owner',request);assert.deepEqual(result.rows.map(x=>x.id),['b','a']);assert.equal(result.summary.tenant_total_rp,null);assert.equal(calls.length,3);for(const [url,opts] of calls){assert.ok(url.includes('property_id=property'));assert.ok(url.includes('month=2026-10'));assert.equal(opts.headers['X-Account-ID'],'owner');}
 const empty=await loadTokenMonth('property','2026-10',c.signal,'owner',async()=>new Response(JSON.stringify({data:[],next_after:null})));assert.deepEqual(empty.rows,[]);
 await assert.rejects(loadTokenMonth('property','2026-10',c.signal,'owner',async()=>new Response('{}',{status:403})),/ditolak/);
});
test('token UI: create/correct/cancel, reason, versi, CSRF dan retry key/body stabil',async()=>{
 const row={id:'purchase',row_version:3},values={purchase_date:'2026-10-02',amount_rp:'100000',note:' bukti lokal ',reason:' Koreksi tanggal '};
 const create=tokenAction('create',null,values,'property','owner'),correct=tokenAction('correct',row,values,'property','owner'),cancel=tokenAction('cancel',row,values,'property','owner');
 assert.equal(create.path,'/api/owner/token-purchases');assert.equal(JSON.parse(create.body).property_id,'property');assert.equal(correct.method,'PATCH');assert.equal(JSON.parse(correct.body).row_version,3);assert.equal(cancel.path,'/api/owner/token-purchases/purchase/cancel');assert.deepEqual(JSON.parse(cancel.body),{row_version:3,reason:'Koreksi tanggal'});
 assert.throws(()=>tokenAction('cancel',row,{reason:''},'property','owner'));assert.throws(()=>tokenAction('create',null,{...values,amount_rp:'1.2'},'property','owner'));
 const requests=[],c=new AbortController(),request=async(path,opts)=>{if(path.includes('/csrf'))return new Response('{"csrf":"fixture"}');requests.push(opts);return new Response('{}',{status:requests.length===1?503:200});};
 await assert.rejects(sendAction(correct,c.signal,request),e=>e.retry===true);await sendAction(correct,c.signal,request);assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);assert.equal(requests[0].body,requests[1].body);assert.equal(requests[1].headers['X-CSRF-Token'],'fixture');
 const conflict=async(path)=>new Response(path.includes('/csrf')?'{"csrf":"fixture"}':'{"error":"stale_version"}',{status:path.includes('/csrf')?200:409});await assert.rejects(sendAction(cancel,c.signal,conflict),e=>e.code==='stale_version'&&!e.retry);
});
