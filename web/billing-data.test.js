import test from 'node:test';
import assert from 'node:assert/strict';
import {billableEnergy,billingAction,billingGet,filterPayments,kwh,paymentLabel,periodSummary,periodTone,propertyOptions,reasonLabel,roomBillStatus,roomTotals,rupiah,sendBillingAction,tenantBillRows,tenantForRoom} from './billing-data.js';

test('nilai null billing selalu perlu ditinjau dan simulasi tidak tampak final',()=>{
 assert.equal(kwh(null),'Perlu ditinjau');assert.equal(rupiah(undefined),'Perlu ditinjau');
 assert.equal(periodTone({status:'finalized',source:'simulation'}),'amber');
 assert.match(reasonLabel('gap_policy_unset'),/belum ditetapkan/i);
});

test('ringkasan kamar hanya lengkap bila seluruh energi dan nominal tersedia',()=>{
 assert.deepEqual(roomTotals([{room_energy_kwh:'1.250',total_cost_rp:'2000'},{room_energy_kwh:'2.750',total_cost_rp:'4000'}]),{energy:4,cost:6000,complete:true});
 assert.equal(roomTotals([{room_energy_kwh:null,total_cost_rp:null}]).complete,false);
 assert.deepEqual(propertyOptions([{property_id:'b'},{property_id:'a'},{property_id:'b'}]),['a','b']);
});
test('ringkasan periode membedakan preview, final, review dan tenant temporal',()=>{
 const rooms=[{status:'finalized',total_cost_rp:'1000'},{status:'review',total_cost_rp:null}];assert.deepEqual(periodSummary({status:'draft',preview_total_cost_rp:'1000',room_bills:rooms}),{rooms:2,review:1,preview:1,final:0,total:'1000'});assert.deepEqual(periodSummary({status:'finalized',total_cost_rp:'1000',room_bills:[rooms[0]]}),{rooms:1,review:0,preview:0,final:1,total:'1000'});
 assert.deepEqual(roomBillStatus({status:'draft',source:'production'},rooms[0]),{label:'Preview',tone:''});assert.equal(roomBillStatus({status:'finalized',source:'simulation'},rooms[0]).label,'Pratinjau simulasi');
 const period={starts_at:'2026-09-01Z',ends_at:'2026-10-01Z'},occupancies=[{room_id:'r',user_id:'u',starts_at:'2026-01-01Z',ends_at:null}];assert.equal(tenantForRoom('r',period,occupancies,[{user_id:'u',name:'Tenant A'}]),'Tenant A');assert.match(tenantForRoom('x',period,occupancies,[]),/Owner/);
});
test('daftar tenant hanya meratakan revisi final dan energi billable tidak memaksa null menjadi nol',()=>{
 const periods=[{id:'final',status:'finalized',starts_at:'2026-09-01Z',ends_at:'2026-10-01Z',revision_no:1},{id:'draft',status:'draft'}],details={final:[{share_id:'s',room_energy_kwh:'2.5',attributable_energy_kwh:'0.5'}],draft:[{share_id:'x'}]};const rows=tenantBillRows(periods,details);assert.equal(rows.length,1);assert.equal(rows[0].period_id,'final');assert.equal(billableEnergy(rows[0]),3);assert.equal(billableEnergy({room_energy_kwh:null,attributable_energy_kwh:'1'}),null);
});

test('status pembayaran memakai label eksplisit dan default aman belum dibayar',()=>{
 assert.equal(paymentLabel('paid'),'Lunas');assert.equal(paymentLabel('unpaid'),'Belum dibayar');assert.equal(paymentLabel(undefined),'Belum dibayar');
 const rows=[{id:'a',billing_period_id:'p1',room_id:'r1',tenant_id:'t1',payment_status:'paid'},{id:'b',billing_period_id:'p2',room_id:'r2',tenant_id:'t2',payment_status:'unpaid'}];assert.deepEqual(filterPayments(rows,{period_id:'p1',room_id:'',tenant_id:'',payment_status:'paid'}).map(x=>x.id),['a']);assert.deepEqual(filterPayments(rows,{period_id:'',room_id:'r2',tenant_id:'t2',payment_status:'unpaid'}).map(x=>x.id),['b']);
});

test('GET billing membawa account, no-store, timeout, dan menghapus sesi pada 401',async()=>{
 let options,expired=false;const old=globalThis.window;globalThis.window={dispatchEvent(){expired=true;}};
 try{
  const result=await billingGet('/api/billing-periods',new AbortController().signal,'tenant',async(_path,o)=>{options=o;return Response.json({data:[]});});
  assert.deepEqual(result.data,[]);assert.equal(options.cache,'no-store');assert.equal(options.headers['X-Account-ID'],'tenant');
  await assert.rejects(()=>billingGet('/api/billing-periods',new AbortController().signal,'tenant',async()=>Response.json({error:'login_required'},{status:401})),/HTTP 401/);assert.equal(expired,true);
 }finally{globalThis.window=old;}
});

test('mutasi billing memakai CSRF dan key idempotensi yang tetap saat retry',async()=>{
 const action=billingAction('/api/owner/billing-periods/id/recalculate',{row_version:2,reason:'uji'},'owner');let calls=[];
 const request=async(path,options)=>{if(path==='/api/auth/csrf')return Response.json({csrf:'csrf-test'});calls.push(options);return Response.json({data:{id:'id'}});};
 await sendBillingAction(action,new AbortController().signal,request);await sendBillingAction(action,new AbortController().signal,request);
 assert.equal(calls.length,2);assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);assert.equal(calls[0].headers['X-CSRF-Token'],'csrf-test');assert.deepEqual(JSON.parse(calls[0].body),{row_version:2,reason:'uji'});
});
