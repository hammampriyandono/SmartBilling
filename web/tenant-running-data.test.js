import test from 'node:test';import assert from 'node:assert/strict';
import {loadTenantRunning,tenantEstimateReason} from './tenant-running-data.js';
test('tenant running: pagination, pilih terbaru, account header dan endpoint tenant saja',async()=>{
 const calls=[],request=async(path,opts)=>{calls.push({path,opts});return Response.json(path.includes('/billing-estimates/')?{data:{period_id:'new',estimated_cost_rp:'300'}}:path.includes('after=')?{data:[{id:'new',starts_at:'2026-10-01Z',revision_no:1}],next_after:null}:{data:[{id:'old',starts_at:'2026-09-01Z',revision_no:1}],next_after:'old'});};
 const c=new AbortController(),result=await loadTenantRunning('tenant','',false,c.signal,request);
 assert.equal(result.data.estimated_cost_rp,'300');assert.equal(result.periods[0].id,'new');assert.equal(calls.length,3);assert.ok(calls.at(-1).path.includes('/billing-estimates/new?data_view=observation'));
 assert.ok(calls.every(call=>!call.path.includes('/owner/')&&call.opts.headers['X-Account-ID']==='tenant'));
});
test('tenant running: kosong, gagal dan finalisasi di tengah fetch tidak menjadi tagihan nol',async()=>{
 const signal=new AbortController().signal;
 const empty=await loadTenantRunning('tenant','',false,signal,async()=>Response.json({data:[],next_after:null}));assert.equal(empty.data,null);
 await assert.rejects(loadTenantRunning('tenant','',false,signal,async()=>Response.json({},{status:503})),/HTTP 503/);
 const result=await loadTenantRunning('tenant','',false,signal,async path=>path.includes('/billing-estimates/')?Response.json({},{status:404}):Response.json({data:[{id:'ended',starts_at:'2026-10-01Z',revision_no:1}],next_after:null}));assert.equal(result.data,null);assert.equal(result.refreshFinals,true);
 assert.match(tenantEstimateReason({reason:'allocation_pending'}),/ditinjau/);assert.match(tenantEstimateReason({reason:'insufficient_readings'}),/Belum cukup/);
});
