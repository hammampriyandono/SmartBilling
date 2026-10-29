import test from 'node:test';import assert from 'node:assert/strict';
import {tokenRupiah,tokenKwh,tokenAction,loadTokenMonth,tokenEstimateInput,loadTokenEstimate} from './token-data.js';import {sendAction} from './admin-mutations.js';

test('token UI: kWh manual menerima koma/titik, kosong tetap null, pembatalan tanpa isian energi',()=>{
 const row={id:'purchase',row_version:1},values={purchase_date:'2026-10-22',amount_rp:'50000',energy_kwh:'33,570000',reason:'Koreksi'};
 const body=v=>JSON.parse(tokenAction('create',null,v,'property','owner').body);
 assert.equal(body(values).energy_kwh,'33.570000');assert.equal(body({...values,energy_kwh:''}).energy_kwh,null);
 assert.equal(body({...values,energy_kwh:null}).energy_kwh,null);
 assert.equal(Object.hasOwn(body({...values,energy_kwh:undefined}),'energy_kwh'),false);
 for(const energy_kwh of ['0','-1','1e3','1.1234567','1000000000','1,2,3'])assert.throws(()=>body({...values,energy_kwh}));
 assert.equal(tokenKwh(null),'Belum dicatat');assert.equal(tokenKwh('33.570000'),'33,57 kWh');assert.equal(tokenKwh('0.000001'),'0,000001 kWh');
 assert.equal(tokenKwh('9007199254740993.123456'),'9.007.199.254.740.993,123456 kWh');
 assert.deepEqual(JSON.parse(tokenAction('cancel',row,{...values,energy_kwh:'invalid'},'property','owner').body),{row_version:1,reason:'Koreksi'});
});
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

test('token UI: estimasi otomatis kirim asumsi tanpa mempercayai kWh pratinjau',async()=>{
 const values={purchase_date:'2026-10-22',amount_rp:'50000',energy_mode:'estimate',energy_kwh:'999',tariff_rp_per_kwh:'1444,70',tax_percent:'3'};
 const parsed=JSON.parse(tokenAction('create',null,values,'property','owner').body);
 assert.deepEqual(parsed.energy_estimate,{tariff_rp_per_kwh:'1444.70',tax_percent:'3'});assert.equal(Object.hasOwn(parsed,'energy_kwh'),false);
 const simple={...values,tariff_rp_per_kwh:undefined,tax_percent:undefined};
 assert.deepEqual(JSON.parse(tokenAction('create',null,simple,'property','owner').body).energy_estimate,{});
 for(const value of ['0','-1','Infinity','1e3'])assert.throws(()=>tokenEstimateInput({...values,tariff_rp_per_kwh:value}));
 assert.throws(()=>tokenEstimateInput({...values,tax_percent:'100'}));
 const c=new AbortController();let url,headers;
 const result=await loadTokenEstimate(values,c.signal,'owner',async(path,opts)=>{url=path;headers=opts.headers;return new Response(JSON.stringify({data:{energy_kwh:'33.57',energy_calculation:{kind:'simulation_estimate'}}}));});
 assert.equal(result.energy_kwh,'33.57');assert.ok(url.includes('amount_rp=50000'));assert.ok(url.includes('tariff_rp_per_kwh=1444.70'));assert.equal(headers['X-Account-ID'],'owner');
 await loadTokenEstimate(simple,c.signal,'owner',async(path)=>{assert.equal(path,'/api/owner/token-energy-estimate?amount_rp=50000');return new Response(JSON.stringify({data:{energy_kwh:'33.57'}}));});
 await assert.rejects(loadTokenEstimate(values,c.signal,'owner',async()=>new Response('{}',{status:503})));
});
